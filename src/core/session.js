import { log } from "./log.js";

// ---------- 版本家族（< X > 翻页器）：派生自官方 parentId lineage ----------
export function sessionLineageRoot(byId, id) {
  let cur = id;
  let guard = 0;
  while (guard++ < 64) {
    const s = byId[cur];
    const p = s && s.parentId;
    if (p === void 0 || !byId[p]) return cur;
    cur = p;
  }
  return cur;
}

/** 派生版本家族：{rootId, versions[](深度升序=fork 时间序，updatedAt 次序), index}；子代理排除。 */
export function familyOfSession(sessionId, ctxSessions) {
  try {
    if (!ctxSessions || !ctxSessions.list || typeof ctxSessions.list.getSnapshot !== "function") return null;
    const snap = ctxSessions.list.getSnapshot();
    if (!snap || !snap.byId || !snap.byId[sessionId]) return null;
    const ids = Array.isArray(snap.ids) ? snap.ids : [];
    const depth = {};
    for (let pass = 0; pass < 64; pass++) {
      let changed = false;
      for (let i = 0; i < ids.length; i++) {
        const id0 = ids[i];
        if (depth[id0] !== void 0) continue;
        const s0 = snap.byId[id0];
        if (!s0) continue;
        const p0 = s0.parentId;
        if (p0 === void 0 || !snap.byId[p0]) {
          depth[id0] = 0;
          changed = true;
        } else if (depth[p0] !== void 0) {
          depth[id0] = depth[p0] + 1;
          changed = true;
        }
      }
      if (!changed) break;
    }
    const root = sessionLineageRoot(snap.byId, sessionId);
    const versions = [];
    for (let j = 0; j < ids.length; j++) {
      const id = ids[j];
      const sj = snap.byId[id];
      if (sj && sj.origin === "subagent") continue;
      if (sj && sj.blank) continue;
      if (depth[id] === void 0) continue;
      let cur = id;
      let g2 = 0;
      let ok = false;
      while (g2++ < 64) {
        if (cur === root) {
          ok = true;
          break;
        }
        const s5 = snap.byId[cur];
        const pp = s5 && s5.parentId;
        if (pp === void 0 || !snap.byId[pp] || depth[pp] === void 0) break;
        cur = pp;
      }
      if (ok) versions.push(id);
    }
    if (versions.indexOf(sessionId) < 0) versions.unshift(sessionId);
    versions.sort((a, b) => {
      const da = depth[a] !== void 0 ? depth[a] : 999;
      const db = depth[b] !== void 0 ? depth[b] : 999;
      if (da !== db) return da - db;
      const sa = snap.byId[a] || {};
      const sb = snap.byId[b] || {};
      const ta = sa.updatedAt || 0;
      const tb = sb.updatedAt || 0;
      if (ta !== tb) return ta - tb;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    const index = versions.indexOf(sessionId);
    return { rootId: root, versions, index: index >= 0 ? index : 0 };
  } catch (e) {
    log("warn", "pager", "lineage 派生失败", { sessionId, err: String(e && e.message ? e.message : e) });
    return null;
  }
}

/** 全部家族（设置卡恢复入口）：按 root 去重，仅列 ≥2 版本的真家族。 */
export function listVersionFamilies(ctxSessions) {
  try {
    if (!ctxSessions || !ctxSessions.list) return [];
    const snap = ctxSessions.list.getSnapshot();
    if (!snap || !snap.byId) return [];
    const seen = {};
    const out = [];
    const ids = Array.isArray(snap.ids) ? snap.ids : [];
    for (let i = 0; i < ids.length; i++) {
      const root = sessionLineageRoot(snap.byId, ids[i]);
      if (seen[root]) continue;
      seen[root] = true;
      const fam = familyOfSession(ids[i], ctxSessions);
      if (fam && fam.versions.length >= 2) out.push(fam);
    }
    return out;
  } catch (e) {
    return [];
  }
}

/** 跨版本安全打开会话 */
export function invokeOpenSession(ctx, id) {
  try {
    if (ctx && ctx.uiWorkspace && typeof ctx.uiWorkspace.openSession === "function") {
      ctx.uiWorkspace.openSession(id);
      return true;
    }
  } catch (e1) {}
  try {
    const uiW = (ctx && typeof ctx.get === "function") ? ctx.get("uiWorkspace") : null;
    if (uiW && typeof uiW.openSession === "function") {
      uiW.openSession(id);
      return true;
    }
  } catch (e2) {}
  try {
    if (ctx && ctx.sessions && typeof ctx.sessions.open === "function") {
      ctx.sessions.open(id);
      return true;
    }
  } catch (e4) {}
  try {
    if (ctx && ctx.workspaces && typeof ctx.workspaces.openSession === "function") {
      ctx.workspaces.openSession(id);
      return true;
    }
  } catch (e5) {}
  log("error", "session", "所有 openSession 途径均不可用", { id });
  return false;
}
