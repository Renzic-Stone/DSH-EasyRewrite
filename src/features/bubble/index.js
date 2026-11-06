import * as React from "react";
import { useUILocaleDict } from "../../core/i18n.js";
import {
  rewriteOnClick,
  editOffShowRecall,
  setBool,
  setSetting
} from "../../core/constants.js";
import { editWidthMode, editWidthCustom } from "./width.js";
import { createSettingsStyles } from "../../core/ui-settings.js";
import { UserBubbleView } from "./view.js";
import { injectThemeStyle } from "./theme.js";
import { createModelSel, getModelDirectories } from "../../core/services.js";
import { invokeOpenSession } from "../../core/session.js";
import { log } from "../../core/log.js";

export function BubbleSettingsPage(props) {
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
    inputStyle,
    disabledInputStyle,
    switchRow,
    segmentedGroup
  } = styles;

  const [rewrite, setRewrite] = React.useState(rewriteOnClick());
  const [showRecall, setShowRecall] = React.useState(editOffShowRecall());
  const [widthMode, setWidthMode] = React.useState(editWidthMode());
  const [customW, setCustomW] = React.useState(String(editWidthCustom()));

  if (props && props.view === "summary") {
    return L.rowBubbleDesc || "支持原地点击气泡编辑、调整编辑框宽度、图片拖入与附件保留。";
  }

  return React.createElement("div", {
    style: Object.assign({}, bodyStyle, { margin: 0, borderTop: "none", padding: "12px 16px" }),
    "data-dsh-easyrewrite": "bubble-settings"
  },
    React.createElement("div", { style: sectionStyle },
      React.createElement("span", { style: groupTitleStyle }, L.rowBubbleTitle || L.sectionEdit),
      switchRow(L.rewrite, rewrite, (v) => {
        setRewrite(v);
        setBool("dsh-easyrewrite:rewriteOnClick", v);
      }),
      switchRow(L.editOffShowRecall, showRecall, (v) => {
        setShowRecall(v);
        setBool("dsh-easyrewrite:editOffShowRecall", v);
      }, rewrite ? L.lockedHint : null, rewrite),
      React.createElement("div", { style: groupStyle },
        React.createElement("span", { style: labelStyle }, L.editWidth),
        segmentedGroup([
          ["compact", L.wCompact],
          ["standard", L.wStandard],
          ["extended", L.wExtended],
          ["custom", L.wCustom]
        ], widthMode, (v) => {
          setWidthMode(v);
          setSetting("dsh-easyrewrite:editWidth", v);
        }),
        React.createElement("div", { style: rowStyle },
          React.createElement("span", { style: labelStyle }, L.customWidth),
          React.createElement("input", {
            type: "number",
            min: 100,
            max: 1200,
            style: widthMode === "custom" ? inputStyle : disabledInputStyle,
            disabled: widthMode !== "custom",
            placeholder: L.placeholderCustom,
            value: customW,
            onChange: (e) => {
              setCustomW(e.target.value);
              const num = parseInt(e.target.value, 10);
              if (!isNaN(num) && num >= 100 && num <= 1200) {
                setSetting("dsh-easyrewrite:editWidthCustom", String(num));
              }
            }
          })
        )
      )
    ),
    React.createElement("span", { style: Object.assign({}, hintStyle, { marginTop: "8px" }) }, L.instant)
  );
}

export function registerBubble(ctx) {
  const disposers = [];
  const styleTag = injectThemeStyle();
  const modelSel = createModelSel(ctx);

  // 1. 注册 conversation.chat.node 拦截气泡
  if (ctx && ctx.slots && typeof ctx.slots.inject === "function") {
    const d1 = ctx.slots.inject("conversation.chat.node", () =>
      ctx.slots.register({
        name: "conversation.chat.node",
        key: "user",
        priority: -1,
        inject: (sessionId) => {
          let inputShell2 = null;
          try {
            if (sessionId && ctx.sessions && typeof ctx.sessions.scope === "function") {
              const scope2 = ctx.sessions.scope(sessionId);
              const conv2 = (scope2 && typeof scope2.get === "function" ? scope2.get("conversation") : null) || ctx.conversation;
              if (conv2 && conv2.input && typeof conv2.input.for === "function") {
                inputShell2 = conv2.input.for(scope2);
              }
            }
          } catch (eSh2) { inputShell2 = null; }
          const resolvedActions2 = (inputShell2 && inputShell2.actions)
            ? inputShell2.actions
            : (inputShell2 && (typeof inputShell2.setDraft === "function" || typeof inputShell2.submit === "function") ? inputShell2 : null);
          const injected2 = {
            openSession: (id) => invokeOpenSession(ctx, id),
            ctxWorkspaces: ctx.workspaces,
            ctxSessions: ctx.sessions,
            modelSel,
            modelDirectories: ctx.modelDirectories || getModelDirectories(),
            inputState: inputShell2,
            restoreSession: (id) => {
              return fetch("/bubble/unarchive", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ sessionId: id }),
                keepalive: true
              }).then((r) => r.json()).then((d) => {
                log("debug", "reset", "恢复完成（unarchive）", { sessionId: id, ok: !!(d && d.ok) });
                return !!(d && d.ok);
              }).catch(() => false);
            }
          };
          if (resolvedActions2) injected2.inputActions = resolvedActions2;
          return injected2;
        }
      }, UserBubbleView)
    );
    if (typeof d1 === "function") disposers.push(d1);

    // 2. 注册 Row 配置页
    const d2 = ctx.slots.inject("plugins.row.config", () =>
      ctx.slots.register(
        { name: "plugins.row.config", key: "dsh-easyrewrite#bubble" },
        BubbleSettingsPage
      )
    );
    if (typeof d2 === "function") disposers.push(d2);
  }

  return () => {
    for (let i = 0; i < disposers.length; i++) disposers[i]();
    if (typeof window !== "undefined" && typeof window.__dshEasyRewriteCardDragDispose === "function") {
      try { window.__dshEasyRewriteCardDragDispose(); } catch (e) {}
    }
    if (styleTag && styleTag.parentNode) styleTag.parentNode.removeChild(styleTag);
  };
}
