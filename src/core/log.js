/** 统一日志：默认静默（仅上报 host 落盘）；调试模式（localStorage dsh-easyrewrite:debug=1）时打印控制台。 */
export function debugEnabled() {
  try {
    if (localStorage.getItem("dsh-easyrewrite:debug") === "1") return true;
  } catch (e) {
    /* ignore */
  }
  try {
    return /\?dsh-er-debug/.test(location.search || "");
  } catch (e) {
    return false;
  }
}

const recentLogTimestamps = new Map();

export function log(level, tag, message, data) {
  try {
    if (debugEnabled()) {
      const prefix = "[dsh-easyrewrite][" + level + "] " + (tag ? "[" + tag + "] " : "");
      if (level === "error") console.error(prefix + message, data !== undefined ? data : "");
      else if (level === "warn") console.warn(prefix + message, data !== undefined ? data : "");
      else console.info(prefix + message, data !== undefined ? data : "");
    }

    // 客户端日志节流：防止非 error 的同类日志在流式重渲染或循环中高频轰炸网络
    if (level !== "error") {
      const logKey = (tag || "") + ":" + (message || "");
      const now = Date.now();
      const last = recentLogTimestamps.get(logKey) || 0;
      if (now - last < 4000) return;
      recentLogTimestamps.set(logKey, now);
      if (recentLogTimestamps.size > 200) {
        const threshold = now - 10000;
        for (const [k, t] of recentLogTimestamps.entries()) {
          if (t < threshold) recentLogTimestamps.delete(k);
        }
      }
    }

    try {
      fetch("/bubble/log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ level, tag, message, data: data !== undefined ? data : null }),
        keepalive: true
      }).catch(() => {
        /* 静默 */
      });
    } catch (e) {
      /* 静默 */
    }
  } catch (e) {
    /* 静默 */
  }
}
