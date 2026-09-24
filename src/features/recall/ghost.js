
import { log } from "../../core/log.js";

    /**
     * 向 Host 端请求物理拔除 fork 继承的幽灵队列（Issue #10 根治核心）。
     * DSH 的 sessions.fork 会贪婪切入 boundary 到下一个 turn/start 之间的非回合事件，
     * 导致旧消息的 agent/inbox/spliced 入队事件被子会话继承，而配对出队事件被截断，
     * 在 Host 端的 Agent.inbox.nextTurn 留下悬空旧消息。
     * 本函数直接调用 Host 路由 /bubble/clean-ghost 操作宿主 agent.inbox 彻底移除它。
     */
    async function requestCleanGhostQueue(targetSessionId) {
      if (!targetSessionId) return { ok: false, cleared: 0, removedIds: [] };
      try {
        var resp = await fetch("/bubble/clean-ghost", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: targetSessionId })
        });
        if (resp.ok) {
          var data = await resp.json();
          log("info", "clean-ghost", "Host 幽灵队列清理完成", {
            sessionId: targetSessionId,
            cleared: data.cleared,
            removedIds: data.removedIds
          });
          return data;
        }
      } catch (e) {
        log("warn", "clean-ghost", "请求 clean-ghost 异常（降级继续）", {
          sessionId: targetSessionId,
          err: String(e && e.message ? e.message : e)
        });
      }
      return { ok: false, cleared: 0, removedIds: [] };
    }


export { requestCleanGhostQueue };
