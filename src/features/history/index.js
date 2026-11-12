import * as React from "react";
import { useUILocaleDict } from "../../core/i18n.js";
import { getBool, setBool } from "../../core/constants.js";
import { useVersionFamilies, restoreSessionVersion, listVersionFamilies } from "../../core/session.js";
import { createSettingsStyles } from "../../core/ui-settings.js";
import { VersionPager } from "./pager.js";
import { serviceRefs } from "../../core/services.js";
import { log } from "../../core/log.js";
import { invokeOpenSession } from "../../core/session.js";

export function HistorySettingsPage(props) {
  const L = useUILocaleDict();
  if (props && props.view === "summary") {
    return L.rowHistoryDesc || "提供会话顶部 < X / Y > 历史版本翻页器与历史版本树导航。";
  }
  return React.createElement(HistorySettingsPageBody, props);
}

function HistorySettingsPageBody(props) {
  const L = useUILocaleDict();
  const styles = createSettingsStyles();
  const {
    bodyStyle,
    sectionStyle,
    groupTitleStyle,
    groupStyle,
    labelStyle,
    hintStyle,
    switchRow
  } = styles;

  const [pagerOn, setPagerOn] = React.useState(getBool("dsh-easyrewrite:pagerEnabled", true));
  const [pagerConfirmOn, setPagerConfirmOn] = React.useState(getBool("dsh-easyrewrite:pagerConfirm", true));
  const [histOpen, setHistOpen] = React.useState(true); // 有版本时默认展开，便于直观查阅
  const [famOpenMap, setFamOpenMap] = React.useState({});
  const [statusMsg, setStatusMsg] = React.useState(null);
  const [cleaning, setCleaning] = React.useState(false);

  const ctxSessions = (props && props.ctxSessions) || serviceRefs.sessions;

  // 融合拉取影子仓储与官方 lineage 全量版本家族
  const { families, loading, refresh } = useVersionFamilies(ctxSessions, props);

  let snap = null;
  try { snap = ctxSessions && ctxSessions.list && typeof ctxSessions.list.getSnapshot === "function" ? ctxSessions.list.getSnapshot() : null; } catch (e) {}
  const metaOf = (vid) => (snap && snap.byId && snap.byId[vid]) || {};
  const famName = (fam) => {
    if (fam && fam.title && !fam.title.startsWith("session-")) return fam.title;
    let best = null, bt = -1;
    if (Array.isArray(fam.versions)) {
      fam.versions.forEach((v) => {
        const vid = typeof v === "string" ? v : (v.sessionId || v.sourceSessionId);
        const m = vid ? metaOf(vid) : {};
        const tt = m.updatedAt || (v.createdAt || 0);
        const candTitle = m.title || (v.summary && !v.summary.startsWith("版本 ") ? v.summary : null);
        if (tt >= bt && candTitle && !candTitle.startsWith("session-")) {
          bt = tt;
          best = candTitle;
        }
      });
    }
    return best || "未命名对话";
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

  const rowHead = { display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px", cursor: "pointer", borderRadius: "6px" };
  const hdrRow = { display: "flex", alignItems: "center", cursor: "pointer", padding: "4px 0" };

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
      switchRow(L.pagerConfirm || "版本切换确认胶囊", pagerConfirmOn, (v) => {
        setPagerConfirmOn(v);
        setBool("dsh-easyrewrite:pagerConfirm", v);
      }),
      statusMsg ? React.createElement("div", {
        style: { padding: "6px 10px", borderRadius: "6px", background: "rgba(77,107,254,0.12)", color: "var(--dsw-alias-brand-primary, #4d6bfe)", fontSize: "12px", marginBottom: "6px" }
      }, statusMsg) : null,
      React.createElement("div", { style: groupStyle },
        loading
          ? React.createElement("span", { style: hintStyle }, "正在扫描历史版本家族...")
          : (families.length === 0
              ? React.createElement("span", { style: hintStyle }, L.versionFamilyNone)
              : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } },
                  React.createElement("div", { style: hdrRow, onClick: () => setHistOpen(!histOpen) },
                    chev(histOpen),
                    React.createElement("span", { style: { fontSize: "12px", fontWeight: "600", color: "var(--dsw-alias-label-secondary)" } }, L.versionHistory),
                    React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", marginLeft: "auto" } }, families.length + " 个家族")
                  ),
                  histOpen ? families.map((fam) => {
                    const fid = fam.sessionId || fam.rootId;
                    const open = !!famOpenMap[fid];
                    const vList = fam.versions || [];
                    return React.createElement("div", {
                      key: fid,
                      style: { display: "flex", flexDirection: "column", gap: "2px", padding: "4px 0 4px 12px", borderTop: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.14))" }
                    },
                      React.createElement("div", { style: hdrRow, onClick: () => {
                        const nm = Object.assign({}, famOpenMap);
                        nm[fid] = !open;
                        setFamOpenMap(nm);
                      } },
                        chev(open),
                        React.createElement("span", { style: { fontSize: "12px", fontWeight: "500", color: "var(--dsw-alias-label-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1" } }, famName(fam)),
                        fam.isVault ? React.createElement("span", { style: { fontSize: "10px", padding: "1px 6px", borderRadius: "4px", background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))", color: "var(--dsw-alias-label-tertiary)", marginRight: "6px" } }, "Vault") : null,
                        React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", flex: "none", marginLeft: "auto" } }, vList.length + " " + L.versionCount)
                      ),
                      open ? vList.map((ver, vi) => {
                        const isVault = fam.isVault;
                        const vNum = isVault ? ver.versionNumber : (vi + 1);
                        const vStamp = isVault ? (ver.createdAt || ver.updatedAt) : metaOf(ver).updatedAt;
                        const isCur = isVault ? (ver.isCurrent || vi === fam.currentVersionIndex) : false;
                        const summary = isVault && ver.summary ? ver.summary : null;

                        return React.createElement("div", { key: isVault ? ver.versionNumber : ver, style: rowHead },
                          React.createElement("span", { style: { fontSize: "11px", fontWeight: "bold", color: isCur ? "var(--dsw-alias-brand-primary, #4d6bfe)" : "var(--dsw-alias-label-tertiary)", fontVariantNumeric: "tabular-nums", flex: "none", width: "28px" } }, "v" + vNum),
                          React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", fontVariantNumeric: "tabular-nums", flex: "none", width: "115px" } }, fmtStamp(vStamp)),
                          summary ? React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1", minWidth: "0" }, title: summary }, summary) : React.createElement("span", { style: { flex: "1" } }),
                          isCur
                            ? React.createElement("span", {
                                style: { fontSize: "11px", padding: "2px 8px", borderRadius: "4px", background: "rgba(46,160,67,0.15)", color: "#2ea043", flex: "none", fontWeight: "500" }
                              }, "当前版本")
                            : React.createElement("button", {
                                type: "button",
                                style: { appearance: "none", border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))", background: "transparent", color: "var(--dsw-alias-label-secondary)", borderRadius: "6px", padding: "2px 8px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", flex: "none" },
                                onClick: (ev) => {
                                  ev.stopPropagation();
                                  setStatusMsg(`正在恢复 ${famName(fam)} 到 v${vNum}...`);
                                  restoreSessionVersion(fam, ver, props).then((res) => {
                                    if (res && res.ok) {
                                      setStatusMsg(`已成功恢复至 v${vNum} 并打开！`);
                                      setTimeout(() => setStatusMsg(null), 3000);
                                      refresh();
                                    } else {
                                      setStatusMsg(`恢复失败: ${res?.error || "unknown"}`);
                                      setTimeout(() => setStatusMsg(null), 5000);
                                    }
                                  }).catch((e) => {
                                    setStatusMsg(`恢复异常: ${String(e?.message || e)}`);
                                    setTimeout(() => setStatusMsg(null), 5000);
                                  });
                                }
                              }, L.versionRestoreOpen)
                        );
                      }) : null
                    );
                  }) : null
                )
            )
      ),
      // 智能迁移与清理遗留插件归档（严格保留用户主动归档会话）
      React.createElement("div", {
        style: Object.assign({}, groupStyle, { marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.15))" })
      },
        React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" } },
          React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "2px", flex: "1", minWidth: 0 } },
            React.createElement("span", { style: labelStyle }, L.cleanLegacyArchived || "智能清理遗留插件归档"),
            React.createElement("span", { style: hintStyle }, L.cleanLegacyArchivedHint || "将历史撤回归档安全转化为影子仓储新模式，拔除残留列表；用户主动归档 100% 安全保留！")
          ),
          React.createElement("button", {
            type: "button",
            disabled: cleaning,
            style: {
              appearance: "none",
              border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
              background: cleaning ? "rgba(128,128,128,0.1)" : "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08))",
              color: "var(--dsw-alias-label-primary)",
              borderRadius: "6px",
              padding: "5px 14px",
              fontSize: "12px",
              cursor: cleaning ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              flex: "none",
              whiteSpace: "nowrap"
            },
            onClick: async (e) => {
              e.stopPropagation();
              setCleaning(true);
              setStatusMsg("正在扫描并清理遗留插件归档...");
              try {
                const res = await fetch("/bubble/cleanup-legacy-archived", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({}),
                  keepalive: true
                });
                const d = await res.json();
                if (d && d.ok) {
                  const mig = d.migrated || d.migratedCount || 0;
                  const ret = d.retained || d.retainedCount || (d.retainedArchived && d.retainedArchived.length) || 0;
                  const msg = `清理完成：已转化/拔除 ${mig} 个插件历史会话，安全保留 ${ret} 个用户主动归档！`;
                  setStatusMsg(msg);
                  setTimeout(() => refresh(), 500);
                } else {
                  setStatusMsg("清理完成：未发现需要转化的插件残留归档，用户主动归档已全部保留。");
                }
              } catch (err) {
                setStatusMsg(`清理异常: ${err?.message || err}`);
              } finally {
                setCleaning(false);
              }
            }
          }, cleaning ? (L.cleaning || "清理中…") : (L.cleanLegacyArchived || "智能清理"))
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
        {
          name: "plugins.row.config",
          key: "dsh-easyrewrite#history",
          inject: () => ({
            openSession: (id) => invokeOpenSession(ctx, id),
            ctxSessions: ctx.sessions,
            ctxWorkspaces: ctx.workspaces,
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
            }
          })
        },
        HistorySettingsPage
      )
    );
    if (typeof d2 === "function") disposers.push(d2);
  }

  return () => {
    for (let i = 0; i < disposers.length; i++) disposers[i]();
  };
}
