import * as React from "react";
import { useUILocaleDict } from "../../core/i18n.js";
import { getBool, setBool } from "../../core/constants.js";
import { listVersionFamilies } from "../../core/session.js";
import { createSettingsStyles } from "../../core/ui-settings.js";
import { VersionPager } from "./pager.js";
import { serviceRefs } from "../../core/services.js";
import { log } from "../../core/log.js";
import { invokeOpenSession } from "../../core/session.js";

export function HistorySettingsPage(props) {
  const L = useUILocaleDict();
  const styles = createSettingsStyles();
  const {
    bodyStyle,
    sectionStyle,
    groupTitleStyle,
    groupStyle,
    hintStyle,
    switchRow
  } = styles;

  const [pagerOn, setPagerOn] = React.useState(getBool("dsh-easyrewrite:pagerEnabled", true));
  const [histOpen, setHistOpen] = React.useState(false);
  const [famOpenMap, setFamOpenMap] = React.useState({});

  const ctxSessions = (props && props.ctxSessions) || serviceRefs.sessions;

  if (props && props.view === "summary") {
    return L.rowHistoryDesc || "提供会话顶部 < X / Y > 历史版本翻页器与历史版本树导航。";
  }

  const families = listVersionFamilies(ctxSessions);
  let snap = null;
  try { snap = ctxSessions && ctxSessions.list && typeof ctxSessions.list.getSnapshot === "function" ? ctxSessions.list.getSnapshot() : null; } catch (e) {}
  const metaOf = (vid) => (snap && snap.byId && snap.byId[vid]) || {};
  const famName = (fam) => {
    let best = null, bt = -1;
    fam.versions.forEach((vid) => {
      const m = metaOf(vid);
      const tt = m.updatedAt || 0;
      if (tt >= bt) { bt = tt; best = m.title || null; }
    });
    return best || (fam.versions.length + " " + L.versionCount);
  };
  const fmtStamp = (tsv) => {
    if (!tsv) return "—";
    const dd = new Date(tsv);
    const p2 = (x) => (x < 10 ? "0" : "") + x;
    return dd.getFullYear() + "-" + p2(dd.getMonth() + 1) + "-" + p2(dd.getDate()) + " " + p2(dd.getHours()) + ":" + p2(dd.getMinutes());
  };
  const chev = (openState) => React.createElement("svg", {
    width: "18", height: "18", viewBox: "0 0 24 24",
    style: { flex: "none", display: "block", color: "var(--dsw-alias-label-tertiary)", transform: openState ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .12s" }
  }, React.createElement("path", { d: "M9 6l6 6-6 6", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }));

  const rowHead = { display: "flex", alignItems: "center", gap: "6px", padding: "5px 4px", cursor: "pointer", borderRadius: "6px" };
  const hdrRow = { display: "flex", alignItems: "center", cursor: "pointer" };

  return React.createElement("div", {
    style: Object.assign({}, bodyStyle, { margin: 0, borderTop: "none", padding: "12px 16px" }),
    "data-dsh-easyrewrite": "history-settings"
  },
    React.createElement("div", { style: sectionStyle },
      React.createElement("span", { style: groupTitleStyle }, L.rowHistoryTitle || L.sectionVersions),
      switchRow(L.pagerTitle || "启用翻页器", pagerOn, (v) => {
        setPagerOn(v);
        setBool("dsh-easyrewrite:pagerEnabled", v);
      }),
      React.createElement("div", { style: groupStyle },
        families.length === 0
          ? React.createElement("span", { style: hintStyle }, L.versionFamilyNone)
          : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "2px" } },
              React.createElement("div", { style: hdrRow, onClick: () => setHistOpen(!histOpen) },
                chev(histOpen),
                React.createElement("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } }, L.versionHistory),
                React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", marginLeft: "auto" } }, families.length + "")
              ),
              histOpen ? families.map((fam) => {
                const open = !!famOpenMap[fam.rootId];
                return React.createElement("div", {
                  key: fam.rootId,
                  style: { display: "flex", flexDirection: "column", gap: "2px", padding: "2px 0 2px 12px", borderTop: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.14))" }
                },
                  React.createElement("div", { style: hdrRow, onClick: () => {
                    const nm = Object.assign({}, famOpenMap);
                    nm[fam.rootId] = !open;
                    setFamOpenMap(nm);
                  } },
                    chev(open),
                    React.createElement("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1" } }, famName(fam)),
                    React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", flex: "none", marginLeft: "auto" } }, fam.versions.length + " " + L.versionCount)
                  ),
                  open ? fam.versions.map((vid, vi) => React.createElement("div", { key: vid, style: rowHead },
                    React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", fontVariantNumeric: "tabular-nums", flex: "none", width: "26px" } }, "v" + (vi + 1)),
                    React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", fontVariantNumeric: "tabular-nums", flex: "1" } }, fmtStamp(metaOf(vid).updatedAt)),
                    React.createElement("button", {
                      type: "button",
                      style: { appearance: "none", border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))", background: "transparent", color: "var(--dsw-alias-label-secondary)", borderRadius: "6px", padding: "2px 8px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", flex: "none" },
                      onClick: (ev) => {
                        ev.stopPropagation();
                        fetch("/bubble/unarchive", {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ sessionId: vid }),
                          keepalive: true
                        }).then(() => {
                          if (props && typeof props.openSession === "function") props.openSession(vid);
                          else invokeOpenSession(null, vid);
                        }).catch(() => {});
                      }
                    }, L.versionRestoreOpen)
                  )) : null
                );
              }) : null
            )
      )
    ),
    React.createElement("span", { style: Object.assign({}, hintStyle, { marginTop: "8px" }) }, L.instant)
  );
}

export function registerHistory(ctx) {
  const disposers = [];

  // 清扫陈旧版本树键
  try {
    const stale = [];
    for (let sk = 0; sk < localStorage.length; sk++) {
      const skey = localStorage.key(sk);
      if (skey && skey.indexOf("dsh-easyrewrite:versions:") === 0) stale.push(skey);
    }
    for (let sv = 0; sv < stale.length; sv++) localStorage.removeItem(stale[sv]);
    if (stale.length > 0) log("info", "lifecycle", "已清扫陈旧版本树键", { count: stale.length });
  } catch (e) {}

  if (ctx && ctx.slots && typeof ctx.slots.inject === "function") {
    // 1. 注册翻页器到 conversation.chat.assistant-actions
    const d1 = ctx.slots.inject("conversation.chat.assistant-actions", () =>
      ctx.slots.register({
        name: "conversation.chat.assistant-actions",
        id: "dsh-easyrewrite-version-pager",
        order: 10,
        inject: () => ({
          openSession: (id) => invokeOpenSession(ctx, id),
          ctxSessions: ctx.sessions,
          archiveSession: (id) => {
            try {
              return Promise.resolve(ctx.workspaces && ctx.workspaces.archiveSession ? ctx.workspaces.archiveSession(id) : false).then((ok) => {
                log("debug", "pager", "归档结果（官方直调）", { id, ok: ok !== false });
                return ok !== false;
              }).catch((e) => {
                log("warn", "pager", "归档失败（官方直调）", { id, err: String(e && e.message ? e.message : e) });
                return false;
              });
            } catch (e) {
              log("warn", "pager", "归档异常", { id, err: String(e && e.message ? e.message : e) });
              return Promise.resolve(false);
            }
          },
          currentSessionId: () => {
            try {
              const s = ctx.sessions && ctx.sessions.list && typeof ctx.sessions.list.getSnapshot === "function" ? ctx.sessions.list.getSnapshot() : null;
              if (!s) return null;
              if (s.current) return s.current;
              if (s.byId) {
                const found = Object.values(s.byId).find((r) => r && r.retainedBy && (r.retainedBy.mainView > 0));
                if (found && found.id) return found.id;
              }
              return null;
            } catch (e) { return null; }
          },
          restoreSession: (id) => {
            return fetch("/bubble/unarchive", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId: id }),
              keepalive: true
            }).then((r) => r.json()).then((d) => {
              if (d && d.ok && d.restored) log("info", "pager", "版本会话已恢复（unarchive）", { sessionId: id });
              return !!(d && d.ok);
            }).catch(() => false);
          }
        })
      }, VersionPager)
    );
    if (typeof d1 === "function") disposers.push(d1);

    // 2. 注册 Row 配置页
    const d2 = ctx.slots.inject("plugins.row.config", () =>
      ctx.slots.register(
        { name: "plugins.row.config", key: "dsh-easyrewrite#history" },
        HistorySettingsPage
      )
    );
    if (typeof d2 === "function") disposers.push(d2);
  }

  return () => {
    for (let i = 0; i < disposers.length; i++) disposers[i]();
  };
}
