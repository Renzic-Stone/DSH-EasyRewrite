import { serviceRefs } from "./services.js";

export const NS = "dsh-easyrewrite";

export const CURRENT_VERSION = "3.1.0";
export const MIN_DSH_VERSION = "0.1.2-rc.1";
export const MAX_TESTED_DSH_VERSION = "0.2.5";

export const SETTING_KEYS = {
  conflictMode: "dsh-easyrewrite:conflictMode",   // "overwrite" | "merge"
  visualMode: "dsh-easyrewrite:visualMode",        // "minimal" | "simple" | "info"
  showOriginalImages: "dsh-easyrewrite:showOriginalImages",
  rewriteOnClick: "dsh-easyrewrite:rewriteOnClick",
  editOffShowRecall: "dsh-easyrewrite:editOffShowRecall",
  recallConfirm: "dsh-easyrewrite:recallConfirm",
  debug: "dsh-easyrewrite:debug",
  shortcut: "dsh-easyrewrite:shortcut",
  pagerEnabled: "dsh-easyrewrite:pagerEnabled",
  pagerConfirm: "dsh-easyrewrite:pagerConfirm",
  checkUpdateDaily: "dsh-easyrewrite:checkUpdateDaily",
  lastUpdateCheckTime: "dsh-easyrewrite:lastUpdateCheckTime",
  dismissedUpdateVersion: "dsh-easyrewrite:dismissedUpdateVersion",
  editWidthMode: "dsh-easyrewrite:editWidthMode",
  messagePreviewSize: "dsh-easyrewrite:messagePreviewSize", // "standard" | "small"
  vaultStorageLocation: "dsh-easyrewrite:vaultStorageLocation" // "global" | "workspace"
};

export function vaultStorageLocation() {
  return getSetting(SETTING_KEYS.vaultStorageLocation, "global");
}

export function getSetting(key, def) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : v;
  } catch (e) {
    return def;
  }
}

export function setSetting(key, val) {
  try {
    localStorage.setItem(key, val);
    if (typeof window !== "undefined") {
      try {
        if (typeof window.StorageEvent === "function") {
          window.dispatchEvent(new window.StorageEvent("storage", { key: key, newValue: String(val) }));
        }
        window.dispatchEvent(new CustomEvent("dsh-easyrewrite:settings-change", { detail: { key: key, value: val } }));
      } catch (eEv) {}
    }
  } catch (e) {
    /* ignore */
  }
}

export function messagePreviewSize() {
  const v = getSetting(SETTING_KEYS.messagePreviewSize, "small");
  if (v === "standard") return "small"; // 旧版本的 standard 自动迁移为默认 small
  return v === "large" ? "large" : "small";
}

export function getBool(key, def) {
  return getSetting(key, def ? "1" : "0") !== "0";
}

export function setBool(key, v) {
  setSetting(key, v ? "1" : "0");
}

export function draftConflictMode() {
  return getSetting(SETTING_KEYS.conflictMode, "overwrite");
}

export function recallVisualMode() {
  return getSetting(SETTING_KEYS.visualMode, "simple");
}

export function showOriginalImages() {
  return getBool(SETTING_KEYS.showOriginalImages, true);
}

export function rewriteOnClick() {
  return getBool(SETTING_KEYS.rewriteOnClick, true);
}

export function editOffShowRecall() {
  return getBool(SETTING_KEYS.editOffShowRecall, true);
}

export function recallConfirmEnabled() {
  return getBool(SETTING_KEYS.recallConfirm, true);
}

export function pagerEnabled() {
  return getBool(SETTING_KEYS.pagerEnabled, true);
}

export function pagerConfirmEnabled() {
  return getBool(SETTING_KEYS.pagerConfirm, true);
}

// ---------- 语义化版本比较（1.2.4 < 1.3.0；缺失段视为 0） ----------
export function versionGt(a, b) {
  const pa = String(a || "0").split(".").map((x) => parseInt(x, 10) || 0);
  const pb = String(b || "0").split(".").map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let vi = 0; vi < len; vi++) {
    const av = pa[vi] || 0;
    const bv = pb[vi] || 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
}

// ---------- dsh 宿主版本比较（v2.4.0） ----------
export function dshVerRank(v) {
  const m = String(v || "").trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-(alpha|rc)\.(\d+))?$/);
  if (!m) return null;
  return {
    core: [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)],
    pre: m[4] ? (m[4] === "rc" ? 2 : 1) : 3,
    preNum: m[5] ? parseInt(m[5], 10) : 0
  };
}

export function cmpDsh(a, b) {
  const va = dshVerRank(a), vb = dshVerRank(b);
  if (!va || !vb) return 0;
  for (let i = 0; i < 3; i++) {
    if (va.core[i] !== vb.core[i]) return va.core[i] - vb.core[i];
  }
  if (va.pre !== vb.pre) return va.pre - vb.pre;
  return va.preNum - vb.preNum;
}

// ---------- 宿主会话快照读取兼容层（v2.4.0） + 非 Hook 同步读写与签名隔离（v3.x） ----------
export function hookSignatureKey(props, propNames) {
  if (!props) return "empty";
  return propNames.map((k) => (typeof props[k] === "function" ? k + ":1" : k + ":0")).join("|");
}

export function hasChatSnapshot(props) {
  return !!(props && (
    typeof props.useChat === "function" ||
    typeof props.useSession === "function" ||
    props._resolvedChatSnapshot ||
    props.chatSnapshot
  ));
}

/**
 * 非 Hook 同步读取会话 ChatSnapshot（供事件回调 / helper 使用，严禁在回调内调 React Hook → React #321）。
 */
export function readChatSnapshotSync(sessionId, opts) {
  const o = opts || {};
  try {
    const uiConv = o.uiConversation || serviceRefs.uiConversation;
    const sessions = o.sessions || o.ctxSessions || serviceRefs.sessions;
    if (uiConv && typeof uiConv.binding === "function" && sessions && typeof sessions.binding === "function" && sessionId) {
      const sb = sessions.binding(sessionId);
      if (sb) {
        const convB = uiConv.binding(sb);
        const chatTarget = convB && typeof convB.target === "function" ? convB.target("chat") : null;
        if (chatTarget && typeof chatTarget.getSnapshot === "function") {
          const snap = chatTarget.getSnapshot();
          if (snap) return snap;
        }
      }
    }
  } catch (e) {
    /* ignore */
  }
  return o.fallbackSnapshot || null;
}

/**
 * 读取由外层 Hook Gate 预解析注入的 ChatSnapshot，或在未经过 Gate 时同步降级读取。
 * 彻底移除函数体内条件/try-catch Hook 调用，消除 React #300/#310/#321 隐患。
 */
export function getChatSnapshot(props) {
  if (!props) return null;
  if (props._resolvedChatSnapshot !== undefined) return props._resolvedChatSnapshot;
  if (props.chatSnapshot) return props.chatSnapshot;
  return readChatSnapshotSync(props.sessionId, {
    uiConversation: props.uiConversation,
    sessions: props.ctxSessions
  });
}
