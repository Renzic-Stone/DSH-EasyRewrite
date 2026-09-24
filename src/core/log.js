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

export function log(level, tag, message, data) {
  try {
    if (debugEnabled()) {
      const prefix = "[dsh-easyrewrite][" + level + "] " + (tag ? "[" + tag + "] " : "");
      if (level === "error") console.error(prefix + message, data !== undefined ? data : "");
      else if (level === "warn") console.warn(prefix + message, data !== undefined ? data : "");
      else console.info(prefix + message, data !== undefined ? data : "");
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
