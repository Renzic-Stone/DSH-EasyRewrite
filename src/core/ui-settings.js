import * as React from "react";
import { IconCheckOutline } from "./icons.js";

export function createSettingsStyles() {
      var cardStyle = {
        border: "1px solid var(--dsw-alias-border-l2)",
        background: "var(--dsw-alias-bg-layer-3)",
        borderRadius: "12px",
        listStyle: "none",
        transition: "border-color .16s, background .16s"
      };
      var cardOpenStyle = { background: "var(--dsw-alias-bg-layer-2)", borderColor: "var(--dsw-alias-label-dimmed)" };
      var headStyle = {
        appearance: "none",
        width: "100%",
        font: "inherit",
        color: "inherit",
        textAlign: "left",
        cursor: "pointer",
        background: "transparent",
        border: "none",
        borderRadius: "12px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "14px 16px"
      };
      var headTextStyle = { display: "flex", flexDirection: "column", flex: "1", minWidth: "0", gap: "4px" };
      var titleStyle = { color: "var(--dsw-alias-label-primary)", fontSize: "15px", fontWeight: 600, lineHeight: "1.4" };
      var subStyle = { color: "var(--dsw-alias-label-tertiary)", fontSize: "13px", lineHeight: "1.5" };
      var chevronStyle = { color: "var(--dsw-alias-label-tertiary)", flex: "none", transition: "transform .16s", transform: "rotate(90deg)" };
      var chevronOpenStyle = { transform: "rotate(270deg)" };
      var bodyStyle = {
        borderTop: "1px solid var(--dsw-alias-border-l2)",
        margin: "0 16px",
        paddingTop: "14px",
        paddingBottom: "8px",
        display: "flex",
        flexDirection: "column",
        gap: "16px"
      };
      // 大项分组：组内 10px，组间 16px（bodyStyle gap）；每级缩进 4 空格（16px）
      var sectionStyle = { display: "flex", flexDirection: "column", gap: "10px", paddingLeft: "16px" };
      var groupTitleStyle = {
        fontSize: "14px",
        fontWeight: 600,
        color: "var(--dsw-alias-label-primary)",
        letterSpacing: "0.02em",
        lineHeight: "1.6"
      };
      var rowStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingLeft: "16px" };
      var labelStyle = { fontSize: "13px", color: "var(--dsw-alias-label-primary)" };
      var hintStyle = { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)" };
      var groupStyle = { display: "flex", flexDirection: "column", gap: "6px", paddingLeft: "16px" };
      var inputStyle = {
        width: "90px",
        border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
        borderRadius: "8px",
        padding: "4px 8px",
        fontSize: "13px",
        background: "var(--dsw-alias-bg-base)",
        color: "var(--dsw-alias-label-primary)"
      };
      var disabledInputStyle = Object.assign({}, inputStyle, { opacity: 0.45, cursor: "not-allowed" });
      function switchRow(label, value, onChange, extraHint, disabled) {
        // 圆形勾选框：选中 = 白底黑勾（与确认胶囊同设计语言）；未选中 = 灰色圆环
        var checkSize = 20;
        var checkStyle = {
          width: checkSize,
          height: checkSize,
          borderRadius: "50%",
          border: "2px solid " + (value ? "#ffffff" : "var(--dsw-alias-border-l2, rgba(128,128,128,0.45))"),
          background: value ? "#ffffff" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: value ? "#000000" : "transparent",
          fontSize: "13px",
          lineHeight: "13px",
          cursor: "pointer",
          flex: "none",
          margin: "0 2px",
          transition: "border-color .15s, background .15s, color .15s",
          userSelect: "none",
          boxSizing: "border-box"
        };
        return React.createElement("div", {
          style: Object.assign({}, rowStyle, disabled ? { opacity: 0.45, cursor: "not-allowed" } : null),
          "data-dsh-easyrewrite": "switch-row",
          title: disabled ? (extraHint || "") : undefined
        },
          React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "2px", flex: "1", minWidth: "0" } },
            React.createElement("span", { style: labelStyle }, label),
            extraHint ? React.createElement("span", { style: hintStyle }, extraHint) : null
          ),
          React.createElement("div", {
            role: "checkbox",
            "aria-checked": !!value,
            "aria-disabled": disabled || undefined,
            style: Object.assign({}, checkStyle, disabled ? { cursor: "not-allowed" } : null),
            onClick: function (e) { e.stopPropagation(); if (disabled) return; onChange(!value); }
          }, value ? React.createElement(IconCheckOutline, null) : null)
        );
      }
      // Apple 风格分段控件：灰色药丸长条 + 白色小药丸高亮当前项（滑动过渡，主题自适应）
      function segmentedGroup(options, value, onChange) {
        var n = options.length;
        var idx = 0;
        for (var i = 0; i < n; i++) { if (options[i][0] === value) { idx = i; break; } }
        var segStyle = {
          position: "relative",
          display: "flex",
          background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))",
          borderRadius: "999px",
          padding: "2px"
        };
        var thumbStyle = {
          position: "absolute",
          top: "2px",
          left: "calc(" + idx + " * (100% - 4px) / " + n + ")",
          width: "calc((100% - 4px) / " + n + ")",
          height: "calc(100% - 4px)",
          background: "var(--dsw-alias-bg-layer-3, #ffffff)",
          borderRadius: "999px",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.12)",
          transition: "left .18s ease",
          zIndex: 1
        };
        return React.createElement("div", { style: segStyle, role: "radiogroup" },
          React.createElement("div", { style: thumbStyle, "data-dsh-easyrewrite": "seg-thumb" }),
          options.map(function (opt) {
            var sel = value === opt[0];
            return React.createElement("div", {
              key: opt[0],
              role: "radio",
              "aria-checked": sel,
              style: {
                position: "relative",
                zIndex: 2,
                flex: "1",
                padding: "3px 10px",
                textAlign: "center",
                fontSize: "13px",
                lineHeight: "20px",
                cursor: "pointer",
                borderRadius: "999px",
                color: sel ? "var(--dsw-alias-label-primary)" : "var(--dsw-alias-label-secondary)",
                transition: "color .15s",
                whiteSpace: "nowrap",
                userSelect: "none"
              },
              onClick: function () { onChange(opt[0]); }
            }, opt[1]);
          })
        );
      }

  return {
    cardStyle,
    cardOpenStyle,
    headStyle,
    headTextStyle,
    titleStyle,
    subStyle,
    chevronStyle,
    chevronOpenStyle,
    bodyStyle,
    sectionStyle,
    groupTitleStyle,
    rowStyle,
    labelStyle,
    hintStyle,
    groupStyle,
    inputStyle,
    disabledInputStyle,
    switchRow,
    segmentedGroup
  };
}
