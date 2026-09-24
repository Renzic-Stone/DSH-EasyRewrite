
import * as React from "react";

    // ---------- pending store（按会话；内存缓存 + localStorage 持久化 + 订阅） ----------
    var PENDING_PREFIX = "dsh-easyrewrite:pending:";
    var pendingCache = {};
    var pendingListeners = [];
    // review M9：跨标签页同步——另一标签页写入/清除 pending 时刷新本地缓存并通知订阅者
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("storage", function (e) {
        try {
          if (!e.key || e.key.indexOf(PENDING_PREFIX) !== 0) return;
          pendingCache[e.key.slice(PENDING_PREFIX.length)] = null; // 强制重读
          for (var li = 0; li < pendingListeners.length; li++) {
            try { pendingListeners[li](); } catch (err) { /* ignore */ }
          }
        } catch (err) { /* ignore */ }
      });
    }
    function loadPendingFromStorage(sessionId) {
      try { var raw = localStorage.getItem(PENDING_PREFIX + sessionId); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    }
    function readPending(sessionId) {
      if (!(sessionId in pendingCache)) pendingCache[sessionId] = loadPendingFromStorage(sessionId);
      return pendingCache[sessionId];
    }
    function writePending(sessionId, p) {
      pendingCache[sessionId] = p;
      try {
        if (p === null) {
          localStorage.removeItem(PENDING_PREFIX + sessionId);
          // 处理完成（发送/取消/编辑确定）→ 删除自动备份（无感）
          try {
            fetch("/bubble/backup/delete", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId: sessionId }),
              keepalive: true
            }).catch(function () { /* 静默 */ });
          } catch (e) { /* 静默 */ }
        } else {
          localStorage.setItem(PENDING_PREFIX + sessionId, JSON.stringify(p));
        }
      } catch (e) { /* 静默 */ }
      var ls = pendingListeners.slice();
      for (var i = 0; i < ls.length; i++) { try { ls[i](); } catch (e) { /* ignore */ } }
    }
    function subscribePending(fn) {
      pendingListeners.push(fn);
      return function () { var i = pendingListeners.indexOf(fn); if (i !== -1) pendingListeners.splice(i, 1); };
    }
    function usePending(sessionId) {
      return React.useSyncExternalStore(subscribePending, function () { return readPending(sessionId); });
    }


export {
  PENDING_PREFIX,
  pendingCache,
  pendingListeners,
  loadPendingFromStorage,
  readPending,
  writePending,
  subscribePending,
  usePending
};
