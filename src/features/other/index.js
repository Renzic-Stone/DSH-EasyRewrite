import * as React from "react";
import { useUILocaleDict } from "../../core/i18n.js";
import {
  draftConflictMode,
  messagePreviewSize,
  setSetting,
  getBool,
  setBool
} from "../../core/constants.js";
import { createSettingsStyles } from "../../core/ui-settings.js";

export function OtherSettingsPage(props) {
  const L = useUILocaleDict();
  const styles = createSettingsStyles();
  const {
    bodyStyle,
    sectionStyle,
    groupTitleStyle,
    groupStyle,
    labelStyle,
    hintStyle,
    switchRow,
    segmentedGroup
  } = styles;

  const [previewSize, setPreviewSize] = React.useState(messagePreviewSize());
  const [conflict, setConflict] = React.useState(draftConflictMode());
  const [debugOn, setDebugOn] = React.useState(getBool("dsh-easyrewrite:debug", false));

  if (props && props.view === "summary") {
    return L.rowOtherDesc || "消息预览大小外观（小/放大）、草稿回填冲突模式配置及底层辅助选项。";
  }

  return React.createElement("div", {
    style: Object.assign({}, bodyStyle, { margin: 0, borderTop: "none", padding: "12px 16px" }),
    "data-dsh-easyrewrite": "other-settings"
  },
    React.createElement("div", { style: sectionStyle },
      React.createElement("span", { style: groupTitleStyle }, L.rowOtherTitle || "外观与辅助设置"),
      // 消息预览大小：小（收为紧凑小方框，默认） vs 放大（图片放大呈现官方高度 + 大文件卡片）
      React.createElement("div", { style: groupStyle },
        React.createElement("span", { style: labelStyle }, L.messagePreviewSize),
        segmentedGroup([
          ["small", L.previewSizeSmall],
          ["large", L.previewSizeLarge]
        ], (previewSize === "large" || previewSize === "standard") ? "large" : "small", (v) => {
          setPreviewSize(v);
          setSetting("dsh-easyrewrite:messagePreviewSize", v);
        }),
        React.createElement("span", { style: hintStyle }, (previewSize === "large" || previewSize === "standard") ? L.previewSizeHintLarge : L.previewSizeHintSmall)
      ),
      React.createElement("div", { style: groupStyle },
        React.createElement("span", { style: labelStyle }, L.conflictMode),
        segmentedGroup([
          ["overwrite", L.conflictOverwriteShort],
          ["merge", L.conflictMergeShort]
        ], conflict, (v) => {
          setConflict(v);
          setSetting("dsh-easyrewrite:conflictMode", v);
        }),
        React.createElement("span", { style: hintStyle }, conflict === "merge" ? L.conflictMerge : L.conflictOverwrite)
      ),
      switchRow("开发者调试日志 (Console Debug)", debugOn, (v) => {
        setDebugOn(v);
        setBool("dsh-easyrewrite:debug", v);
      }, "开启后在浏览器控制台打印详细调试日志及挂载调参接口")
    ),
    React.createElement("span", { style: Object.assign({}, hintStyle, { marginTop: "8px" }) }, L.instant)
  );
}

export function registerOther(ctx) {
  const disposers = [];
  if (ctx && ctx.slots && typeof ctx.slots.inject === "function") {
    const d1 = ctx.slots.inject("plugins.row.config", () =>
      ctx.slots.register(
        { name: "plugins.row.config", key: "dsh-easyrewrite#other" },
        OtherSettingsPage
      )
    );
    if (typeof d1 === "function") disposers.push(d1);
  }
  return () => {
    for (let i = 0; i < disposers.length; i++) disposers[i]();
  };
}
