
import * as React from "react";
import { formatClock } from "../../core/ui.js";
import { useUILocaleDict } from "../../core/i18n.js";

    function ConfirmCapsule({ text, onConfirm, onCancel }) {
      var L = useUILocaleDict();
      var capsuleStyle = {
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        background: "var(--dsw-alias-bg-l2, rgba(128,128,128,0.14))",
        borderRadius: "999px",
        padding: "6px 10px 6px 16px",
        fontSize: "12px",
        lineHeight: "20px",
        color: "var(--dsw-alias-label-secondary)"
      };
      var pillBtnStyle = {
        border: "none",
        background: "#ffffff",
        color: "#000000",
        borderRadius: "999px",
        padding: "3px 9px",
        fontSize: "12px",
        lineHeight: "18px",
        cursor: "pointer",
        whiteSpace: "nowrap"
      };
      return React.createElement(
        "div", { style: capsuleStyle, "data-dsh-easyrewrite": "confirm-capsule" },
        React.createElement("span", null, text),
        React.createElement("button", { type: "button", style: pillBtnStyle, onClick: function (e) { e.stopPropagation(); onConfirm(); } }, L.confirm),
        React.createElement("button", { type: "button", style: pillBtnStyle, onClick: function (e) { e.stopPropagation(); onCancel(); } }, L.cancel)
      );
    }


export { ConfirmCapsule };
