import * as React from "react";
import { useUILocaleDict } from "../../core/i18n.js";
import {
  recallConfirmEnabled,
  showOriginalImages,
  recallVisualMode,
  setBool,
  setSetting
} from "../../core/constants.js";
import { countContentAfter, statOnlyUser } from "../other/helpers.js";
import {
  hotkeySetting,
  setHotkeySetting,
  hotkeyEnabledSetting,
  setHotkeyEnabledSetting,
  hotkeyCaptureActive,
  keydownCombo,
  keydownMatches,
  formatHotkey
} from "./hotkey.js";
import { createSettingsStyles } from "../../core/ui-settings.js";
import { RecallBanner } from "./banner.js";
import { barTune, barDiagnose } from "./tune.js";
import { log } from "../../core/log.js";
import { invokeOpenSession } from "../../core/session.js";
import { setCtxUiWorkspaceRef } from "./safe-session.js";

export function RecallSettingsPage(props) {
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
    switchRow,
    segmentedGroup
  } = styles;

  const [confirmCapsule, setConfirmCapsule] = React.useState(recallConfirmEnabled());
  const [origImg, setOrigImg] = React.useState(showOriginalImages());
  const [visual, setVisual] = React.useState(recallVisualMode());
  const [statOnly, setStatOnly] = React.useState(statOnlyUser());
  const [hotkey, setHotkeyState] = React.useState(hotkeySetting());
  const [hotkeyOn, setHotkeyOn] = React.useState(hotkeyEnabledSetting());
  const [recording, setRecording] = React.useState(false);
  const [hotkeyInvalid, setHotkeyInvalid] = React.useState(false);

  React.useEffect(() => {
    if (!recording) return;
    function onKey(e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        setHotkeyInvalid(false);
        return;
      }
      const combo = keydownCombo(e);
      if (!combo) {
        setHotkeyInvalid(true);
        return;
      }
      setHotkeyInvalid(false);
      setHotkeyState(combo);
      setHotkeySetting(combo);
      setRecording(false);
    }
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [recording]);

  if (props && props.view === "summary") {
    return L.rowRecallDesc || "提供消息撤回操作栏按钮、撤回待定胶囊倒计时确认、三种视觉模式及全局快捷键。";
  }

  return React.createElement("div", {
    style: Object.assign({}, bodyStyle, { margin: 0, borderTop: "none", padding: "12px 16px" }),
    "data-dsh-easyrewrite": "recall-settings"
  },
    React.createElement("div", { style: sectionStyle },
      React.createElement("span", { style: groupTitleStyle }, L.rowRecallTitle || L.sectionRecall),
      switchRow(L.recallConfirm, confirmCapsule, (v) => {
        setConfirmCapsule(v);
        setBool("dsh-easyrewrite:recallConfirm", v);
      }),
      switchRow(L.showOriginalImages, origImg, (v) => {
        setOrigImg(v);
        setBool("dsh-easyrewrite:showOriginalImages", v);
      }),
      React.createElement("div", { style: groupStyle },
        React.createElement("span", { style: labelStyle }, L.visualMode),
        segmentedGroup([
          ["simple", L.visualSimple],
          ["minimal", L.visualMinimal],
          ["info", L.visualInfo]
        ], visual, (v) => {
          setVisual(v);
          setSetting("dsh-easyrewrite:visualMode", v);
        })
      ),
      switchRow(L.statOnlyUser, statOnly, (v) => {
        setStatOnly(v);
        setBool("dsh-easyrewrite:statOnlyUser", v);
      }),
      switchRow(L.hotkeyEnable, hotkeyOn, (v) => {
        setHotkeyOn(v);
        setHotkeyEnabledSetting(v);
        if (!v) setRecording(false);
      }, L.hotkeyHint),
      React.createElement("div", { style: rowStyle },
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "2px" } },
          React.createElement("span", { style: labelStyle }, L.hotkey + "：" + (hotkey ? formatHotkey(hotkey) : L.hotkeyNone)),
          React.createElement("span", { style: hintStyle }, recording ? L.hotkeyRecording : (hotkey ? null : L.hotkeyHint)),
          hotkeyInvalid ? React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-error, #d9534f)" } }, L.hotkeyInvalid) : null
        ),
        React.createElement("button", {
          type: "button",
          disabled: !hotkeyOn,
          style: {
            appearance: "none",
            border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
            background: "transparent",
            color: "var(--dsw-alias-label-secondary)",
            borderRadius: "6px",
            padding: "3px 10px",
            fontSize: "12px",
            cursor: hotkeyOn ? "pointer" : "not-allowed",
            fontFamily: "inherit",
            flex: "none",
            opacity: hotkeyOn ? 1 : 0.45
          },
          onClick: () => {
            setHotkeyInvalid(false);
            setRecording(!recording);
          }
        }, recording ? L.hotkeyRecording : L.hotkeyRecord)
      )
    ),
    React.createElement("span", { style: Object.assign({}, hintStyle, { marginTop: "8px" }) }, L.instant)
  );
}

export function registerRecall(ctx) {
  const disposers = [];

  try {
    const uiW = ctx.uiWorkspace || ((typeof ctx.get === "function") ? (ctx.get("uiWorkspace") || null) : null);
    setCtxUiWorkspaceRef(uiW);
  } catch (e) {}

  // 1. 全局快捷键监听
  function onHotkeyKeydown(e) {
    try {
      if (hotkeyCaptureActive) return;
      if (!hotkeyEnabledSetting()) return;
      const hk = hotkeySetting();
      if (!hk || !keydownMatches(e, hk)) return;
      const tgt = e.target;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.tagName === "SELECT" || tgt.isContentEditable)) return;
      let cur = null;
      try {
        const sl = ctx.sessions && ctx.sessions.list && typeof ctx.sessions.list.getSnapshot === "function" ? ctx.sessions.list.getSnapshot() : null;
        cur = sl ? sl.current : null;
      } catch (err) { cur = null; }
      if (!cur) return;
      const flowItems = document.querySelectorAll("[data-chat-flow-kind=\"user\"]");
      if (!flowItems || flowItems.length === 0) return;
      const lastUser = flowItems[flowItems.length - 1];
      const recallKey = lastUser.querySelector("[data-dsh-easyrewrite=\"recall-key\"]");
      if (!recallKey) return;
      e.preventDefault();
      recallKey.click();
      log("info", "hotkey", "快捷键触发撤回", { key: hotkeySetting() });
    } catch (err) {}
  }
  window.addEventListener("keydown", onHotkeyKeydown, true);
  disposers.push(() => window.removeEventListener("keydown", onHotkeyKeydown, true));

  // 2. 挂载调试 API
  try {
    if (typeof window !== "undefined") {
      if (!window.__dshEasyRewrite) window.__dshEasyRewrite = {};
      window.__dshEasyRewrite.bar = {
        _on: () => { try { return localStorage.getItem("dsh-easyrewrite:debug") === "1"; } catch (e) { return false; } },
        get: () => JSON.stringify({ tune: barTune }),
        diagnose: () => barDiagnose()
      };
    }
  } catch (e) {}

  // 3. 注册 RecallBanner 到 conversation.input.dock
  if (ctx && ctx.slots && typeof ctx.slots.inject === "function") {
    const d1 = ctx.slots.inject("conversation.input.dock", () =>
      ctx.slots.register({
        name: "conversation.input.dock",
        id: "dsh-easyrewrite-recall-banner",
        order: -10,
        inject: (sessionId) => {
          let inputShell = null;
          try {
            if (typeof ctx.sessions.scope === "function" && sessionId) {
              const scope = ctx.sessions.scope(sessionId);
              const conversationSvc = scope ? scope.get("conversation") : null;
              if (conversationSvc && conversationSvc.input && typeof conversationSvc.input.for === "function") {
                inputShell = conversationSvc.input.for(scope);
              }
            }
          } catch (eShell) { inputShell = null; }
          return {
            sessionId,
            openSession: (id) => invokeOpenSession(ctx, id),
            ctxWorkspaces: ctx.workspaces,
            ctxSessions: ctx.sessions,
            inputActions: inputShell && inputShell.actions ? inputShell.actions : null,
            inputState: inputShell || null
          };
        }
      }, RecallBanner)
    );
    if (typeof d1 === "function") disposers.push(d1);

    // 4. 注册 Row 配置页
    const d2 = ctx.slots.inject("plugins.row.config", () =>
      ctx.slots.register(
        { name: "plugins.row.config", key: "dsh-easyrewrite#recall" },
        (p) => React.createElement(RecallSettingsPage, p)
      )
    );
    if (typeof d2 === "function") disposers.push(d2);
  }

  return () => {
    for (let i = 0; i < disposers.length; i++) disposers[i]();
  };
}
