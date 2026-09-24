import * as React from "react";
import { useUILocaleDict } from "../../core/i18n.js";
import { IconCheckOutline } from "../../core/icons.js";
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

export function BundleConfigPage(props) {
  const L = useUILocaleDict();

  const [updateVer, setUpdateVer] = React.useState(CURRENT_VERSION);
  const [dshVer, setDshVer] = React.useState(null);
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
        setUpdateMsg(L.updateFailed || "检查失败");
        return;
      }
      setUpdateVer(d.current || CURRENT_VERSION);
      setDshVer(typeof d.dshVersion === "string" ? d.dshVersion : null);
      if (d.latest && versionGt(d.latest, d.current || "0")) {
        setUpdateAvailableVer(d.latest);
        try { localStorage.setItem("dsh-easyrewrite:updateAvailable", "1"); } catch (e) {}
      } else {
        setUpdateAvailableVer("");
        setUpdateMsg(L.upToDate || "已是最新版本");
        try { localStorage.removeItem("dsh-easyrewrite:updateAvailable"); } catch (e) {}
      }
    }).catch(() => {
      setUpdateChecking(false);
      setUpdateMsg(L.updateFailed || "检查失败");
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
        setUpdateMsg(L.updateDone || "更新完成");
        setUpdateAvailableVer("");
        try { localStorage.removeItem("dsh-easyrewrite:updateAvailable"); } catch (e) {}
      } else {
        setUpdateMsg(L.updateFailed || "更新失败");
      }
    }).catch(() => {
      setUpdateUpdating(false);
      setUpdateMsg(L.updateFailed || "更新失败");
    });
  }

  React.useEffect(() => {
    doCheckUpdate();
  }, []);

  // 状态小字文案
  let statusText = "";
  if (updateChecking) {
    statusText = L.checking || "正在检查…";
  } else if (updateAvailableVer) {
    statusText = (L.newVersion || "发现新版本：v{ver}").replace("{ver}", updateAvailableVer);
  } else if (updateMsg) {
    statusText = updateMsg;
  }

  return React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "2px",
      margin: "4px 0 16px 0",
      width: "100%",
      boxSizing: "border-box"
    },
    "data-dsh-easyrewrite": "bundle-config"
  },
    // 第一行：当前版本：v3.0.0（已是最新版本）   [检查更新]
    React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: "36px",
        gap: "12px"
      }
    },
      React.createElement("div", {
        style: { display: "flex", alignItems: "baseline", gap: "6px", flexWrap: "wrap", minWidth: 0 }
      },
        React.createElement("span", {
          style: {
            fontSize: "13px",
            color: "var(--dsw-alias-label-primary)",
            lineHeight: "20px"
          }
        }, (L.currentVersion || "当前版本") + "：v" + updateVer),
        statusText ? React.createElement("span", {
          style: {
            display: "inline-block",
            fontSize: "13px",
            transform: "scale(0.6)",
            transformOrigin: "left center",
            color: updateAvailableVer ? "var(--dsw-alias-brand-primary, #4d6bfe)" : "var(--dsw-alias-label-secondary)",
            lineHeight: "20px",
            opacity: 0.85,
            whiteSpace: "nowrap"
          }
        }, "（" + statusText + "）") : null
      ),
      updateAvailableVer ? React.createElement("button", {
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
          whiteSpace: "nowrap",
          flex: "none"
        },
        onClick: () => { doUpdatePlugin(); }
      }, updateUpdating ? (L.updating || "正在更新…") : (L.updateNow || "立即更新")) : React.createElement("button", {
        type: "button",
        disabled: updateChecking,
        style: {
          appearance: "none",
          border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
          background: "transparent",
          color: "var(--dsw-alias-label-secondary)",
          borderRadius: "6px",
          padding: "3px 10px",
          fontSize: "12px",
          cursor: updateChecking ? "not-allowed" : "pointer",
          opacity: updateChecking ? 0.6 : 1,
          fontFamily: "inherit",
          whiteSpace: "nowrap",
          flex: "none"
        },
        onClick: () => { doCheckUpdate(); }
      }, updateChecking ? (L.checking || "正在检查…") : (L.checkUpdate || "检查更新"))
    ),

    // 第二行：每日检查更新（发现新版本时提示）   (switch)
    React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: "36px",
        gap: "12px"
      }
    },
      React.createElement("span", {
        style: {
          fontSize: "13px",
          color: "var(--dsw-alias-label-primary)",
          lineHeight: "20px"
        }
      }, L.autoCheckUpdate || "每日检查更新（发现新版本时提示）"),
      React.createElement("div", {
        role: "checkbox",
        "aria-checked": !!autoCheckOn,
        style: {
          width: 20,
          height: 20,
          borderRadius: "50%",
          border: "2px solid " + (autoCheckOn ? "#ffffff" : "var(--dsw-alias-border-l2, rgba(128,128,128,0.45))"),
          background: autoCheckOn ? "#ffffff" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: autoCheckOn ? "#000000" : "transparent",
          fontSize: "13px",
          lineHeight: "13px",
          cursor: "pointer",
          flex: "none",
          boxSizing: "border-box",
          transition: "border-color .15s, background .15s, color .15s",
          userSelect: "none"
        },
        onClick: (e) => {
          e.stopPropagation();
          const next = !autoCheckOn;
          setAutoCheckOn(next);
          setBool("dsh-easyrewrite:autoCheckUpdate", next);
        }
      }, autoCheckOn ? React.createElement(IconCheckOutline, null) : null)
    ),

    // DSH 兼容性低版本告警提示（仅当不兼容时兜底）
    (() => {
      if (!dshVer) return null;
      if (cmpDsh(dshVer, MIN_DSH_VERSION) < 0) {
        return React.createElement("div", {
          key: "dsh-low",
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            padding: "8px",
            margin: "6px 0",
            background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))",
            borderRadius: "8px"
          }
        },
          React.createElement("span", { style: { fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-primary)" } },
            (L.dshLowWarning || "DeepSeek Harness 版本较低").replace("{cur}", dshVer).replace("{min}", MIN_DSH_VERSION)
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
            }, L.copyUpgradeCmd || "复制升级命令")
          )
        );
      }
      return null;
    })()
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
