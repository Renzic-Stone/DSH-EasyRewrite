
import { log } from "../../core/log.js";

let ctxUiWorkspaceRef = null;
export function setCtxUiWorkspaceRef(ref) {
  ctxUiWorkspaceRef = ref;
}

    /** 安全打开会话：多重降级通道，确保可靠切换会话 */
    function safeOpenSession(targetId, props) {
      if (props && typeof props.openSession === "function") {
        try {
          var r1 = props.openSession(targetId);
          if (r1 !== false) return true;
        } catch (e1) {
          log("warn", "session", "props.openSession 失败，尝试降级通道", { targetId: targetId, err: String(e1 && e1.message ? e1.message : e1) });
        }
      }
      try {
        if (ctxUiWorkspaceRef && typeof ctxUiWorkspaceRef.openSession === "function") {
          ctxUiWorkspaceRef.openSession(targetId);
          return true;
        }
      } catch (e2) {
        log("warn", "session", "ctxUiWorkspaceRef.openSession 失败", { targetId: targetId, err: String(e2 && e2.message ? e2.message : e2) });
      }
      try {
        if (props && props.ctxSessions && typeof props.ctxSessions.open === "function") {
          props.ctxSessions.open(targetId);
          return true;
        }
      } catch (e3) {
        log("warn", "session", "ctxSessions.open 失败", { targetId: targetId, err: String(e3 && e3.message ? e3.message : e3) });
      }
      log("error", "session", "所有切换会话通道均不可用", { targetId: targetId });
      return false;
    }


export { safeOpenSession };
