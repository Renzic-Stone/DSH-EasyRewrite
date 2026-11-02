import * as React from "react";
import { log } from "./log.js";
import { serviceRefs } from "./services.js";

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

/** 响应式获取全量版本家族（融合 Vault 影子仓储与官方 lineage 历史树，带自动订阅与静默刷新） */
export function useVersionFamilies(ctxSessions, props) {
  const [vaultFamilies, setVaultFamilies] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [versionTick, setVersionTick] = React.useState(0);
  const propsRef = React.useRef(props);
  propsRef.current = props;
  const sessionsRef = React.useRef(ctxSessions);
  sessionsRef.current = ctxSessions;
  const isFetchingRef = React.useRef(false);

  const fetchVault = React.useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      // 1. 优先请求全量 Vault 家族接口（新后端）
      try {
        const r = await fetch("/bubble/vault/families", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
          keepalive: true
        });
        if (r.ok) {
          const data = await r.json();
          if (data && data.ok && Array.isArray(data.families) && data.families.length > 0) {
            let snap = null;
            try {
              const sRef = sessionsRef.current || serviceRefs.sessions;
              snap = sRef && sRef.list && typeof sRef.list.getSnapshot === "function" ? sRef.list.getSnapshot() : null;
            } catch (e) {}
            const sanitized = data.families.map((fam) => {
              let t = fam.title;
              const sid = fam.sessionId || fam.rootId || "";
              if (!t || t.startsWith("session-")) {
                const snapItem = snap && snap.byId && (snap.byId[sid] || snap.byId[sid.replace(/^session-/, "")]);
                t = snapItem?.displayTitle || snapItem?.title || "未命名对话";
              }
              return Object.assign({}, fam, { title: t });
            });
            setVaultFamilies(sanitized);
            setLoading(false);
            return;
          }
        }
      } catch (e1) {}

      // 2. 容灾降级方案（免重启兼容老后端）：直接利用现有 /bubble/vault/list 接口并发全量扫描
      const candidates = new Set();
      const sRef = sessionsRef.current || serviceRefs.sessions;
      const curProps = propsRef.current;

      // 当前活跃会话 ID
      try {
        const cur = (sRef && sRef.current) || (curProps && typeof curProps.currentSessionId === "function" ? curProps.currentSessionId() : null);
        if (cur) candidates.add(cur);
      } catch (eCur) {}

      // 从 sRef.list 中获取全量会话
      try {
        const snap = sRef && sRef.list && typeof sRef.list.getSnapshot === "function" ? sRef.list.getSnapshot() : null;
        if (snap) {
          if (Array.isArray(snap.ids)) snap.ids.forEach((id) => candidates.add(id));
          if (snap.byId) Object.keys(snap.byId).forEach((id) => candidates.add(id));
        }
      } catch (eSnap) {}

      // 从 localStorage 中抓取近期会话 ID
      try {
        for (let li = 0; li < localStorage.length; li++) {
          const lk = localStorage.key(li);
          if (lk && lk.includes("session-")) {
            const lm = lk.match(/session-[0-9a-f-]{32,36}/i);
            if (lm && lm[0]) candidates.add(lm[0]);
          }
        }
      } catch (eLs) {}

      // 从当前 URL 抓取可能包含的会话 ID
      try {
        if (typeof window !== "undefined" && window.location) {
          const urlMatch = (window.location.pathname + window.location.hash + window.location.search).match(/session-[0-9a-f-]{32,36}/i);
          if (urlMatch && urlMatch[0]) candidates.add(urlMatch[0]);
        }
      } catch (eUrl) {}

      if (candidates.size > 0) {
        const sidList = Array.from(candidates);
        const fetches = sidList.map((sid) =>
          fetch("/bubble/vault/list", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId: sid }),
            keepalive: true
          }).then((res) => (res.ok ? res.json() : null)).catch(() => null)
        );

        const results = await Promise.all(fetches);
        const fallbackList = [];
        const clonedFromSet = new Set();
        let snap = null;
        try { snap = sRef && sRef.list && typeof sRef.list.getSnapshot === "function" ? sRef.list.getSnapshot() : null; } catch (e) {}

        for (let i = 0; i < results.length; i++) {
          const res = results[i];
          const sid = sidList[i];
          // 严格要求：只有真实版本数 >= 2 的真正演进家族才并入，单体用户归档绝对不混入
          if (res && res.ok && res.manifest && Array.isArray(res.manifest.versions) && res.manifest.versions.length >= 2) {
            const m = res.manifest;
            if (m.clonedFrom) clonedFromSet.add(m.clonedFrom);

            let displayTitle = (m.title && !m.title.startsWith("session-")) ? m.title.trim() : null;
            if (!displayTitle && snap && snap.byId) {
              const snapItem = snap.byId[sid] || snap.byId[sid.replace(/^session-/, "")];
              if (snapItem && (snapItem.displayTitle || snapItem.title)) {
                displayTitle = (snapItem.displayTitle || snapItem.title).trim();
              }
            }
            if (!displayTitle || displayTitle.startsWith("session-")) {
              displayTitle = "未命名对话";
            }

            let latestTime = 0;
            m.versions.forEach((v) => {
              const t = v.updatedAt || v.createdAt || 0;
              if (t > latestTime) latestTime = t;
            });

            fallbackList.push({
              rootId: sid,
              sessionId: sid,
              clonedFrom: m.clonedFrom || null,
              workspaceId: m.workspaceId || null,
              title: displayTitle,
              updatedAt: latestTime,
              currentVersionIndex: typeof m.currentVersionIndex === "number" ? m.currentVersionIndex : (m.versions.length - 1),
              isVault: true,
              versions: m.versions.map((v, idx) => ({
                versionNumber: v.versionNumber || (idx + 1),
                createdAt: v.createdAt || v.updatedAt || 0,
                summary: v.summary || `版本 ${v.versionNumber || (idx + 1)}`,
                isCurrent: idx === m.currentVersionIndex
              }))
            });
          }
        }

        // 核心过滤：剔除已被后代继承的冗余前代派生快照，只保留最新最完整的家族
        const filteredList = fallbackList.filter((f) => !clonedFromSet.has(f.sessionId));

        if (filteredList.length > 0) {
          filteredList.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          setVaultFamilies(filteredList);
        }
      }
    } catch (eFallback) {
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, [versionTick]);

  React.useEffect(() => {
    fetchVault();
  }, [fetchVault]);

  // 监听 ctxSessions.list 订阅变动
  React.useEffect(() => {
    if (!ctxSessions || !ctxSessions.list || typeof ctxSessions.list.subscribe !== "function") return;
    const unsub = ctxSessions.list.subscribe(() => {
      setVersionTick((t) => t + 1);
    });
    return () => {
      try { unsub(); } catch (e) {}
    };
  }, [ctxSessions]);

  // 合并 Vault 家族与官方 lineage 家族（严格仅合并多版本家族，正常用户单体归档绝对不混入）
  const families = React.useMemo(() => {
    const list = [...vaultFamilies];
    const seen = new Set(list.map((f) => f.sessionId || f.rootId));
    try {
      const lineageList = listVersionFamilies(ctxSessions);
      lineageList.forEach((lf) => {
        // 严格保护：仅当确实拥有 >= 2 个版本时才作为真家族并入
        if (lf && Array.isArray(lf.versions) && lf.versions.length >= 2 && !seen.has(lf.rootId) && !seen.has(lf.sessionId)) {
          list.push(lf);
          seen.add(lf.rootId);
        }
      });
    } catch (e) {}
    return list;
  }, [vaultFamilies, ctxSessions, versionTick]);

  return { families, loading, refresh: fetchVault };
}

/** 跨体系统一恢复会话版本（支持 Vault 影子仓储快照原子还原与官方老归档 unarchive） */
export async function restoreSessionVersion(fam, targetVersion, props) {
  if (fam && fam.isVault) {
    const res = await fetch("/bubble/vault/restore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: fam.sessionId,
        workspaceId: fam.workspaceId,
        targetVersionNumber: targetVersion.versionNumber,
        storageMode: fam.storageMode
      }),
      keepalive: true
    }).then((r) => r.json()).catch(() => null);

    if (res && res.ok) {
      if (props && typeof props.openSession === "function") {
        props.openSession(fam.sessionId);
      } else {
        invokeOpenSession(null, fam.sessionId);
      }
      return { ok: true, isVault: true };
    }
    return { ok: false, error: res?.error || "restore-failed" };
  }

  // 传统官方 lineage 归档还原
  const targetId = typeof targetVersion === "string" ? targetVersion : (targetVersion.id || targetVersion.sessionId);
  await fetch("/bubble/unarchive", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: targetId }),
    keepalive: true
  }).catch(() => {});

  if (props && typeof props.openSession === "function") {
    props.openSession(targetId);
  } else {
    invokeOpenSession(null, targetId);
  }
  return { ok: true, isVault: false };
}
