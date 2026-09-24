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

  // 1. 注册 conversation.chat.node 拦截气泡
  if (ctx && ctx.slots && typeof ctx.slots.inject === "function") {
    const d1 = ctx.slots.inject("conversation.chat.node", () =>
      ctx.slots.register({ name: "conversation.chat.node", order: 10 }, UserBubbleView)
    );
    if (typeof d1 === "function") disposers.push(d1);

    // 2. 注册 Row 配置页
    const d2 = ctx.slots.inject("plugins.row.config", () =>
      ctx.slots.register(
        { name: "plugins.row.config", key: "dsh-easyrewrite#bubble" },
        (p) => React.createElement(BubbleSettingsPage, p)
      )
    );
    if (typeof d2 === "function") disposers.push(d2);
  }

  return () => {
    for (let i = 0; i < disposers.length; i++) disposers[i]();
    if (styleTag && styleTag.parentNode) styleTag.parentNode.removeChild(styleTag);
  };
}
