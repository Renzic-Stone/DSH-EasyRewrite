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
import { randomUUID } from 'node:crypto';

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
 * 判断 fork 失败是否因为边界落在未闭合回合内（DSH fork 硬性限制：
 * 只能 fork 到闭合回合边界；回合未结束时无法截断回合内消息）。
 */
function isOpenTurnError(err) {
  const msg = String(err?.message ?? err);
  return msg.includes('open turn') || msg.includes('OPEN_TURN');
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
  // 2) 目标前一个事件（最后手段）
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
      // 指定唯一 child id：默认 id 策略会生成 session-1 等，与磁盘已有日志冲突
      const child = ctx.sessions.fork(sessionId, b, 'dsh-er-' + randomUUID());
      return { child };
    } catch (err) {
      lastErr = err;
      if (isOpenTurnError(err)) break; // 回合未结束，再试也无效
    }
  }
  if (isOpenTurnError(lastErr)) {
    return {
      code: 'turn-open', status: 409,
      message: '该消息所在回合尚未结束，无法截断；请等待回复完成（回合结束）后再撤回'
    };
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
