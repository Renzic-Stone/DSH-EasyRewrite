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
        reject(new Error('body-too-large'));
        req.destroy();
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
 * 判断 fork 失败是否因为边界落在未闭合回合内（DSH fork 硬性限制：
 * 只能 fork 到闭合回合边界；回合未结束时无法截断回合内消息）。
 */
function isOpenTurnError(err) {
  const msg = String(err?.message ?? err);
  return msg.includes('open turn') || msg.includes('OPEN_TURN');
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
    // 目标前没有闭合回合：检查是否处于未结束回合内
    let insideOpenTurn = false;
    for (let i = targetIdx - 1; i >= 0; i--) {
      if (events[i].type === 'turn/start') { insideOpenTurn = true; break; }
      if (events[i].type === 'turn/end') break;
    }
    if (insideOpenTurn) {
      return { code: 'turn-open', status: 409, message: '该消息所在回合尚未结束，无法截断；请等待回复完成（回合结束）后再撤回' };
    }
    return { code: 'no-boundary', status: 409, message: '该消息之前没有可截断的回合边界（如首条消息）' };
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
        if (typeof sessionId !== 'string' || !pending) { sendJson(res, 400, { ok: false, error: 'invalid-request' }); return; }
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
        if (typeof sessionId !== 'string') { sendJson(res, 400, { ok: false }); return; }
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
        if (typeof sessionId !== 'string') { sendJson(res, 400, { ok: false }); return; }
        await rm(backupPath(sessionId), { force: true });
        sendJson(res, 200, { ok: true });
      } catch (err) {
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
        if (typeof sessionId !== 'string' || typeof targetSeq !== 'number' || !Number.isFinite(targetSeq)) {
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
        sendJson(res, 500, { ok: false, error: 'internal', message: String(err?.message ?? err) });
      }
    }
  }));
  writeLog('info', 'host', 'apply: 路由注册完成');
  return () => {
    for (const d of disposers) { try { d(); } catch (e) { /* ignore */ } }
    writeLog('info', 'host', 'apply: 已卸载');
  };
}
