import * as React from "react";
import { useUILocaleDict } from "../../core/i18n.js";
import {
  CURRENT_VERSION,
  MIN_DSH_VERSION,
  MAX_TESTED_DSH_VERSION,
  cmpDsh,
  versionGt,
  getBool,
  setBool
} from "../../core/constants.js";
import { legacyCopy } from "../../core/ui.js";
import { createSettingsStyles } from "../../core/ui-settings.js";

export function BundleConfigPage(props) {
  const L = useUILocaleDict();
  const styles = createSettingsStyles();
  const {
    bodyStyle,
    sectionStyle,
    groupTitleStyle,
    groupStyle,
    rowStyle,
    labelStyle,
    hintStyle,
    switchRow
  } = styles;

  const [updateVer, setUpdateVer] = React.useState(CURRENT_VERSION);
  const [dshVer, setDshVer] = React.useState(null);
  const [remindClosed, setRemindClosed] = React.useState(getBool("dsh-easyrewrite:autoCheckReminded", false));
  const [updateMsg, setUpdateMsg] = React.useState("");
  const [updateAvailableVer, setUpdateAvailableVer] = React.useState("");
  const [updateChecking, setUpdateChecking] = React.useState(false);
  const [updateUpdating, setUpdateUpdating] = React.useState(false);
  const [autoCheckOn, setAutoCheckOn] = React.useState(getBool("dsh-easyrewrite:autoCheckUpdate", false));

  function doCheckUpdate() {
    setUpdateChecking(true);
    setUpdateMsg("");
    fetch("/bubble/check-update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
      keepalive: true
    }).then((r) => r.json()).then((d) => {
      setUpdateChecking(false);
      if (!d || !d.ok) {
        setUpdateMsg(L.updateFailed);
        return;
      }
      setUpdateVer(d.current || CURRENT_VERSION);
      setDshVer(typeof d.dshVersion === "string" ? d.dshVersion : null);
      if (d.latest && versionGt(d.latest, d.current || "0")) {
        setUpdateAvailableVer(d.latest);
        try { localStorage.setItem("dsh-easyrewrite:updateAvailable", "1"); } catch (e) {}
      } else {
        setUpdateAvailableVer("");
        setUpdateMsg(L.upToDate);
        try { localStorage.removeItem("dsh-easyrewrite:updateAvailable"); } catch (e) {}
      }
    }).catch(() => {
      setUpdateChecking(false);
      setUpdateMsg(L.updateFailed);
    });
  }

  function doUpdatePlugin() {
    if (!updateAvailableVer) return;
    setUpdateUpdating(true);
    fetch("/bubble/update-plugin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
      keepalive: true
    }).then((r) => r.json()).then((d) => {
      setUpdateUpdating(false);
      if (d && d.ok) {
        setUpdateMsg(L.updateDone);
        setUpdateAvailableVer("");
        try { localStorage.removeItem("dsh-easyrewrite:updateAvailable"); } catch (e) {}
      } else {
        setUpdateMsg(L.updateFailed);
      }
    }).catch(() => {
      setUpdateUpdating(false);
      setUpdateMsg(L.updateFailed);
    });
  }

  React.useEffect(() => {
    doCheckUpdate();
  }, []);

  return React.createElement("div", {
    style: Object.assign({}, bodyStyle, { margin: 0, borderTop: "none", padding: "12px 16px" }),
    "data-dsh-easyrewrite": "bundle-config"
  },
    React.createElement("div", { style: sectionStyle },
      React.createElement("span", { style: groupTitleStyle }, L.bundleConfigTitle || L.sectionUpdate),
      React.createElement("div", { style: groupStyle },
        React.createElement("span", { style: labelStyle }, (L.currentVersion || "当前版本") + "：v" + updateVer),
        (() => {
          if (!dshVer) return null;
          if (cmpDsh(dshVer, MIN_DSH_VERSION) < 0) {
            return React.createElement("div", {
              key: "dsh-low",
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                padding: "6px 8px",
                background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))",
                borderRadius: "8px"
              }
            },
              React.createElement("span", { style: { fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-primary)" } },
                L.dshLowWarning.replace("{cur}", dshVer).replace("{min}", MIN_DSH_VERSION)
              ),
              React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px" } },
                React.createElement("code", {
                  style: {
                    fontSize: "11px",
                    color: "var(--dsw-alias-label-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: "1"
                  }
                }, "npm install -g @deepseek-ai/dsh@" + MIN_DSH_VERSION),
                React.createElement("button", {
                  type: "button",
                  style: {
                    appearance: "none",
                    border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
                    background: "transparent",
                    color: "var(--dsw-alias-label-secondary)",
                    borderRadius: "6px",
                    padding: "2px 8px",
                    fontSize: "11px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    flex: "none"
                  },
                  onClick: () => {
                    try { legacyCopy("npm install -g @deepseek-ai/dsh@" + MIN_DSH_VERSION); } catch (e) {}
                  }
                }, L.copyUpgradeCmd)
              )
            );
          }
          if (cmpDsh(MAX_TESTED_DSH_VERSION, dshVer) < 0) {
            return React.createElement("div", {
              key: "dsh-new",
              style: {
                padding: "6px 8px",
                fontSize: "12px",
                lineHeight: "18px",
                color: "var(--dsw-alias-label-secondary)",
                background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08))",
                borderRadius: "8px"
              }
            }, L.dshNewNotice.replace("{cur}", dshVer));
          }
          return null;
        })(),
        !remindClosed && !getBool("dsh-easyrewrite:autoCheckUpdate", false) ? React.createElement("div", {
          key: "remind",
          style: {
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 8px",
            background: "rgba(77,107,254,0.08)",
            borderRadius: "8px"
          }
        },
          React.createElement("span", { style: { fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-primary)", flex: "1", minWidth: "0" } }, L.suggestAutoCheck),
          React.createElement("button", {
            type: "button",
            style: {
              appearance: "none",
              border: "none",
              background: "var(--dsw-static-deepseek-500, #4d6bfe)",
              color: "#ffffff",
              borderRadius: "6px",
              padding: "3px 10px",
              fontSize: "12px",
              cursor: "pointer",
              fontFamily: "inherit",
              flex: "none"
            },
            onClick: () => {
              setBool("dsh-easyrewrite:autoCheckUpdate", true);
              setBool("dsh-easyrewrite:autoCheckReminded", true);
              setAutoCheckOn(true);
              setRemindClosed(true);
            }
          }, L.enableNow),
          React.createElement("button", {
            type: "button",
            title: L.remindIgnore,
            style: {
              appearance: "none",
              border: "none",
              background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.16))",
              color: "var(--dsw-alias-label-secondary)",
              borderRadius: "6px",
              padding: "3px 10px",
              fontSize: "12px",
              cursor: "pointer",
              fontFamily: "inherit",
              flex: "none"
            },
            onClick: () => {
              setBool("dsh-easyrewrite:autoCheckReminded", true);
              setRemindClosed(true);
            }
          }, L.remindIgnore)
        ) : null,
        React.createElement("div", { style: rowStyle },
          React.createElement("span", { style: Object.assign({}, hintStyle, { flex: "1" }) }, updateMsg || ""),
          React.createElement("button", {
            type: "button",
            style: {
              appearance: "none",
              border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
              background: "transparent",
              color: "var(--dsw-alias-label-secondary)",
              borderRadius: "6px",
              padding: "3px 10px",
              fontSize: "12px",
              cursor: "pointer",
              fontFamily: "inherit",
              flex: "none"
            },
            onClick: () => { doCheckUpdate(); }
          }, updateChecking ? L.checking : L.checkUpdate)
        ),
        updateAvailableVer ? React.createElement("div", { style: rowStyle },
          React.createElement("span", { style: { fontSize: "12px", color: "var(--dsw-alias-brand-primary, #4d6bfe)", flex: "1" } }, L.newVersion.replace("{ver}", updateAvailableVer)),
          React.createElement("button", {
            type: "button",
            style: {
              appearance: "none",
              border: "none",
              background: "var(--dsw-static-deepseek-500, #4d6bfe)",
              color: "#ffffff",
              borderRadius: "6px",
              padding: "3px 12px",
              fontSize: "12px",
              cursor: "pointer",
              fontFamily: "inherit",
              flex: "none"
            },
            onClick: () => { doUpdatePlugin(); }
          }, updateUpdating ? L.updating : L.updateNow)
        ) : null,
        switchRow(L.autoCheckUpdate, autoCheckOn, (v) => {
          setAutoCheckOn(v);
          setBool("dsh-easyrewrite:autoCheckUpdate", v);
        })
      )
    ),
    React.createElement("span", { style: Object.assign({}, hintStyle, { marginTop: "8px" }) }, L.instant)
  );
}

export function initAutoUpdateCheck() {
  const autoOn = getBool("dsh-easyrewrite:autoCheckUpdate", false);
  if (!autoOn) return;
  const today = new Date().toISOString().slice(0, 10);
  let last = null;
  try { last = localStorage.getItem("dsh-easyrewrite:lastUpdateCheck"); } catch (e) {}
  if (last === today) return;
  try { localStorage.setItem("dsh-easyrewrite:lastUpdateCheck", today); } catch (e) {}
  fetch("/bubble/check-update", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
    keepalive: true
  }).catch(() => {});
}
