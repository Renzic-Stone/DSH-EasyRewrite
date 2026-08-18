/**
 * dsh-bubble-edit — node half。
 *
 * host 路由：
 *  - POST /bubble/recall { sessionId, targetSeq } → 撤回：
 *    在 targetSeq 之前的最后一个闭合回合（turn/end）处 fork 新版本
 *    （新会话不含目标消息及其之后全部内容），flush 持久化。
 *    「真正修改」只发生在这里；client 侧 pending 只是本地草稿态。
 *
 * 依赖服务：webServer（路由）、sessions（fork/flush）。
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const name = 'dsh-bubble-edit'
export const inject = ['webServer', 'sessions']

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
 * 无闭合回合时的安全边界：从目标所在回合起点逐层外推，
 * 找到"最外层未闭合回合的起点之前"的事件 seq（撤回整个回合链）。
 * 返回 -1 表示无可撤回边界（如首条消息）。
 */
function findOuterBoundary(events, targetIdx) {
  let i = targetIdx - 1;
  while (i >= 0) {
    const t = events[i].type;
    if (t === 'turn/start') {
      if (i === 0) return -1; // 回合从会话开头开始，前面无内容
      // 检查更早是否还有 turn/start（更外层回合）
      let earlierStart = -1;
      for (let j = i - 1; j >= 0; j--) {
        if (events[j].type === 'turn/start') { earlierStart = j; break; }
      }
      if (earlierStart === -1) return events[i - 1].seq; // 无更外层 → 前一个事件是安全边界
      // 检查 earlierStart..i-1 之间是否有 turn/end（外层回合是否已闭合）
      let hasEnd = false;
      for (let k = earlierStart + 1; k < i; k++) {
        if (events[k].type === 'turn/end') { hasEnd = true; break; }
      }
      if (hasEnd) return events[i - 1].seq; // 外层已闭合 → 安全
      i = earlierStart; // 外层未闭合 → 继续外推
      continue;
    }
    i--;
  }
  return -1;
}

/** 撤回核心：优先 fork 到目标前最后闭合回合；退化到目标前一个事件；fork 失败逐候选重试。 */
function buildRecall(ctx, sessionId, targetSeq) {
  const session = ctx.sessions.get(sessionId);
  if (!session) return { code: 'session-not-found', status: 404 };
  const events = session.events;
  const targetIdx = events.findIndex((e) => e.seq === targetSeq);
  if (targetIdx === -1) {
    return { code: 'invalid-target', status: 404, message: JSON.stringify({ targetSeq, eventsLen: events.length }) };
  }
  const candidates = [];
  // 1) 目标前最后闭合回合（最精确）
  const turnEnd = findTurnEndBefore(events, targetIdx);
  if (turnEnd !== -1) candidates.push(turnEnd);
  // 2) 无闭合回合：逐层外推到最外层回合起点之前（撤回整个回合链）
  if (candidates.length === 0) {
    const outer = findOuterBoundary(events, targetIdx);
    if (outer !== -1) candidates.push(outer);
  }
  // 3) 目标前一个事件（最后手段）
  if (targetIdx > 0) candidates.push(events[targetIdx - 1].seq);
  if (candidates.length === 0) {
    return {
      code: 'no-boundary', status: 409,
      message: JSON.stringify({ targetIdx, targetSeq, eventsLen: events.length, hasTurnEnd: events.some((e) => e.type === 'turn/end') })
    };
  }
  let lastErr = null;
  for (const b of candidates) {
    try {
      const child = ctx.sessions.fork(sessionId, b);
      return { child };
    } catch (err) {
      lastErr = err;
    }
  }
  return { code: 'fork-failed', status: 409, message: String(lastErr?.message ?? lastErr) + ' candidates=' + JSON.stringify(candidates) };
}

export function apply(ctx) {
  const dispose = ctx.webServer.register({
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
        const result = buildRecall(ctx, sessionId, targetSeq);
        if (result.code) {
          sendJson(res, result.status, { ok: false, error: result.code, message: result.message });
          return;
        }
        await ctx.sessions.flush(result.child);
        sendJson(res, 200, { ok: true, newId: result.child.id });
      } catch (err) {
        console.warn('[dsh-bubble-edit] /bubble/recall failed:', err);
        sendJson(res, 500, { ok: false, error: 'internal', message: String(err?.message ?? err) });
      }
    }
  });
  return () => { try { dispose(); } catch (e) { /* ignore */ } };
}
