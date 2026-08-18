/**
 * dsh-easyrewrite — node half。
 *
 * host 路由：
 *  - POST /bubble/recall { sessionId, targetSeq } → 撤回：
 *    在 targetSeq 之前的最后一个闭合回合（turn/end）处 fork 新版本
 *    （新会话不含目标消息及其之后全部内容），flush 持久化。
 *    「真正修改」只发生在这里；client 侧 pending 只是本地草稿态。
 *
 * 依赖服务：webServer（路由）、sessions（fork/flush）。
 */
import { appendFile, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/;
function settingsNamespace(value) {
  if (!NAMESPACE_PATTERN.test(value)) throw new TypeError(`settings namespace "${value}" must match ${String(NAMESPACE_PATTERN)}`);
  return value;
}

// ---------- 统一日志（host 落盘 $DSH_HOME/dsh-easyrewrite.log） ----------
let logFile = null;
let logQueue = Promise.resolve();
function resolveLogFile() {
  if (logFile !== null) return logFile;
  const home = process.env.DSH_HOME || join(homedir(), '.dsh');
  logFile = join(home, 'dsh-easyrewrite.log');
  return logFile;
}
function ts() { return new Date().toISOString(); }
/** 串行化写入（避免并发交错）。 */
function writeLog(level, tag, message, data) {
  const line = JSON.stringify({ t: ts(), level, tag, message, data: data ?? null });
  logQueue = logQueue.then(async () => {
    try {
      const file = resolveLogFile();
      await mkdir(dirname(file), { recursive: true });
      await appendFile(file, line + '\n', 'utf8');
    } catch (e) { /* 日志失败不抛 */ }
  });
  // 默认静默（仅落盘）；调试模式：环境变量 DSH_EASYREWRITE_DEBUG=1 时输出控制台
  if (process.env.DSH_EASYREWRITE_DEBUG === '1') {
    if (level === 'error') console.error('[dsh-easyrewrite]', tag, message, data ?? '');
    else if (level === 'warn') console.warn('[dsh-easyrewrite]', tag, message, data ?? '');
    else console.info('[dsh-easyrewrite]', tag, message, data ?? '');
  }
  return logQueue;
}

export const name = 'dsh-easyrewrite'
export const inject = ['webServer', 'sessions', 'settings']

/** 读取 JSON 请求体（带大小上限保护）。 */
function readJsonBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        // 超限：停止收集并继续消费 body（不 destroy——避免连接重置，handler 回 413）
        req.removeAllListeners('data');
        req.resume();
        reject(new Error('body-too-large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// ---------- 路由安全层（review S1-S3）：会话 id 白名单 / 同源校验 / JSON Content-Type ----------
const SESSION_ID_PATTERN = /^[A-Za-z0-9-]+$/;
function validSessionId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && SESSION_ID_PATTERN.test(value);
}
/** 同源校验：请求必须来自本 GUI 页面（Origin/Referer 与 Host 匹配）；无 Origin（同源/非浏览器）放行。 */
function requestFromSameOrigin(req) {
  try {
    const origin = req.headers?.origin || req.headers?.referer;
    if (!origin) return true;
    if (origin === 'null') return false; // sandbox iframe 拒绝
    const host = req.headers?.host;
    if (!host) return false;
    const u = new URL(origin);
    return u.host === host;
  } catch { return false; }
}
function isJsonContentType(req) {
  const ct = String(req.headers?.['content-type'] || '').toLowerCase();
  return ct === 'application/json' || ct.startsWith('application/json;');
}
/** 统一路由守卫：同源 + JSON Content-Type + 可选 sessionId 白名单。通过返回 true。 */
function guard(req, res, needSessionId, sessionId) {
  if (!requestFromSameOrigin(req)) { sendJson(res, 403, { ok: false, error: 'forbidden' }); return false; }
  if (!isJsonContentType(req)) { sendJson(res, 415, { ok: false, error: 'unsupported-media-type' }); return false; }
  if (needSessionId && !validSessionId(sessionId)) { sendJson(res, 400, { ok: false, error: 'invalid-session-id' }); return false; }
  return true;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

/** 目标事件之前最近的 turn/end seq；无则 -1。 */
function findTurnEndBefore(events, targetIdx) {
  for (let i = targetIdx - 1; i >= 0; i--) {
    if (events[i].type === 'turn/end') return events[i].seq;
  }
  return -1;
}

/**
 * 撤回边界解析：返回目标消息之前最后闭合回合（turn/end）的事件 seq。
 * fork 由 client 端官方 RPC（ctx.sessions.fork）执行——child 才能进入会话列表。
 * 无闭合回合（未结束回合内）→ turn-open。
 */
function resolveBoundary(ctx, sessionId, targetSeq) {
  const session = ctx.sessions.get(sessionId);
  if (!session) return { code: 'session-not-found', status: 404 };
  const events = session.events;
  const targetIdx = events.findIndex((e) => e.seq === targetSeq);
  if (targetIdx === -1) {
    return { code: 'invalid-target', status: 404, message: JSON.stringify({ targetSeq, eventsLen: events.length }) };
  }
  const boundary = findTurnEndBefore(events, targetIdx);
  if (boundary === -1) {
    // review M10：先判定目标之后是否有 turn/end（回合是否已闭合）——
    // 已闭合但无前置边界（如首回合消息）→ no-boundary（诊断准确，不是 turn-open）
    let hasLaterClose = false;
    for (let i = targetIdx + 1; i < events.length; i++) {
      if (events[i].type === 'turn/end') { hasLaterClose = true; break; }
    }
    if (hasLaterClose) {
      return { code: 'no-boundary', status: 409, message: '该消息之前没有可截断的闭合回合边界（首条消息或跨回合场景）' };
    }
    return { code: 'turn-open', status: 409, message: '该消息所在回合尚未结束，无法截断；请等待回复完成（回合结束）后再撤回' };
  }
  return { boundary };
}

/** 仅测试用：暴露内部纯函数（不参与运行时行为）。 */
export const __test = { findTurnEndBefore };

export function apply(ctx) {
  writeLog('info', 'host', 'apply: 路由注册开始');
  try {
    if (ctx.settings && typeof ctx.settings.register === 'function') {
      const dummySchema = (x) => x ?? {};
      dummySchema.toJSON = () => ({ type: 'object' });
      ctx.settings.register(settingsNamespace('dsh-easyrewrite'), dummySchema);
      writeLog('info', 'host', 'settings namespace 已注册（插件配置卡片可用）');
    }
  } catch (err) {
    writeLog('warn', 'host', 'settings namespace 注册失败（不影响核心功能）', { err: String(err?.message ?? err) });
  }
  const disposers = [];
  // client 日志上报路由（统一甄别，落盘 $DSH_HOME/dsh-easyrewrite.log）
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/log',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method-not-allowed' }); return; }
        if (!guard(req, res, false)) return;
        const body = await readJsonBody(req, 256 * 1024);
        await writeLog(
          typeof body.level === 'string' ? body.level : 'info',
          typeof body.tag === 'string' ? body.tag : 'client',
          typeof body.message === 'string' ? body.message : '',
          body.data
        );
        sendJson(res, 200, { ok: true });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));
  // 草稿自动备份（覆盖式）：写 $DSH_HOME/dsh-easyrewrite/backups/<sessionId>.json
  function backupPath(sessionId) {
    const home = process.env.DSH_HOME || join(homedir(), '.dsh');
    return join(home, 'dsh-easyrewrite', 'backups', sessionId + '.json');
  }
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/backup',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false }); return; }
        const body = await readJsonBody(req, 512 * 1024);
        const { sessionId, pending } = body;
        if (!guard(req, res, true, sessionId) || !pending || typeof pending !== 'object') { sendJson(res, 400, { ok: false, error: 'invalid-request' }); return; }
        const file = backupPath(sessionId);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, JSON.stringify(pending, null, 2), 'utf8'); // 覆盖式
        sendJson(res, 200, { ok: true });
      } catch (err) {
        writeLog('warn', 'backup', '备份写入失败', { err: String(err?.message ?? err) });
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/backup/read',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false }); return; }
        const body = await readJsonBody(req);
        const { sessionId } = body;
        if (!guard(req, res, true, sessionId)) { return; }
        try {
          const raw = await readFile(backupPath(sessionId), 'utf8');
          const pending = JSON.parse(raw);
          sendJson(res, 200, { ok: true, pending });
        } catch (e) {
          sendJson(res, 200, { ok: true, pending: null }); // 无备份
        }
      } catch (err) {
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/backup/delete',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false }); return; }
        const body = await readJsonBody(req);
        const { sessionId } = body;
        if (!guard(req, res, true, sessionId)) { return; }
        await rm(backupPath(sessionId), { force: true });
        sendJson(res, 200, { ok: true });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));
  // 版本翻页器：恢复归档会话（幂等——未归档时为 no-op）。官方无 unarchive API，
  // 通过 workspaceRegistry 实例的排队操作把 sessionId 从归档集合移除。
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/unarchive',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method-not-allowed' }); return; }
        const body = await readJsonBody(req);
        const { sessionId } = body;
        if (!guard(req, res, true, sessionId)) { return; }
        let registry = null;
        try { registry = ctx.get('workspaceRegistry'); } catch (e) { /* service absent */ }
        if (!registry || typeof registry.enqueueOperation !== 'function' || typeof registry.requireState !== 'function' || typeof registry.setState !== 'function') {
          writeLog('warn', 'host', 'unarchive: workspaceRegistry 不可用');
          sendJson(res, 200, { ok: false, error: 'registry-unavailable' });
          return;
        }
        // review S3：存在性校验（与官方 archiveSession 的 sessionKnown 对齐）
        if (typeof registry.sessionKnown === 'function') {
          const known = await registry.sessionKnown(sessionId);
          if (!known) { sendJson(res, 404, { ok: false, error: 'session-not-found' }); return; }
        }
        const restored = await registry.enqueueOperation(async () => {
          const state = registry.requireState();
          const next = state.archivedSessionIds.filter((id) => id !== sessionId);
          if (next.length === state.archivedSessionIds.length) return false; // 未归档
          await registry.setState({ ...state, archivedSessionIds: next });
          return true;
        });
        writeLog('info', 'host', 'unarchive 完成', { sessionId, restored });
        sendJson(res, 200, { ok: true, restored });
      } catch (err) {
        writeLog('warn', 'host', 'unarchive 失败', { err: String(err?.message ?? err) });
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));
  // 版本翻页器：归档历史版本（与 unarchive 对称）。官方 archiveSession 有 sessionKnown
  // 检查（非 live 的历史版本会抛 WorkspaceUnknownSessionError），这里直接操作归档集合。
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/archive',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method-not-allowed' }); return; }
        const body = await readJsonBody(req);
        const { sessionId } = body;
        if (!guard(req, res, true, sessionId)) { return; }
        let registry = null;
        try { registry = ctx.get('workspaceRegistry'); } catch (e) { /* service absent */ }
        if (!registry || typeof registry.enqueueOperation !== 'function' || typeof registry.requireState !== 'function' || typeof registry.setState !== 'function') {
          writeLog('warn', 'host', 'archive: workspaceRegistry 不可用');
          sendJson(res, 200, { ok: false, error: 'registry-unavailable' });
          return;
        }
        // review S3：存在性校验（与官方 archiveSession 的 sessionKnown 对齐）
        if (typeof registry.sessionKnown === 'function') {
          const known = await registry.sessionKnown(sessionId);
          if (!known) { sendJson(res, 404, { ok: false, error: 'session-not-found' }); return; }
        }
        const archived = await registry.enqueueOperation(async () => {
          const state = registry.requireState();
          if (state.archivedSessionIds.includes(sessionId)) return false; // 已归档
          await registry.setState({ ...state, archivedSessionIds: [...state.archivedSessionIds, sessionId] });
          return true;
        });
        writeLog('info', 'host', 'archive 完成', { sessionId, archived });
        sendJson(res, 200, { ok: true, archived });
      } catch (err) {
        writeLog('warn', 'host', 'archive 失败', { err: String(err?.message ?? err) });
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));
  // 撤回路由
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/recall',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method-not-allowed' }); return; }
        const body = await readJsonBody(req);
        const { sessionId, targetSeq } = body;
        if (!guard(req, res, true, sessionId) || typeof targetSeq !== 'number' || !Number.isFinite(targetSeq)) {
          sendJson(res, 400, { ok: false, error: 'invalid-request' });
          return;
        }
        writeLog('info', 'recall', '收到撤回边界请求', { sessionId, targetSeq });
        const result = resolveBoundary(ctx, sessionId, targetSeq);
        if (result.code) {
          writeLog('warn', 'recall', '撤回被拒绝: ' + result.code, { sessionId, targetSeq, message: result.message });
          sendJson(res, result.status, { ok: false, error: result.code, message: result.message });
          return;
        }
        // fork 由 client 官方 RPC 执行（child 才能进会话列表并可打开）
        writeLog('info', 'recall', '边界就绪', { sessionId, targetSeq, boundary: result.boundary });
        sendJson(res, 200, { ok: true, boundary: result.boundary });
      } catch (err) {
        writeLog('error', 'recall', '/bubble/recall 异常', { message: String(err?.message ?? err) });
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));
  writeLog('info', 'host', 'apply: 路由注册完成');
  return () => {
    for (const d of disposers) { try { d(); } catch (e) { /* ignore */ } }
    writeLog('info', 'host', 'apply: 已卸载');
  };
}
