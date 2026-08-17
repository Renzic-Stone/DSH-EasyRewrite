/**
 * dsh-bubble-edit — browser half（Part 2.1）。
 *
 * 本文件是**源码模板**：图标以占位符 __DASH_EDIT_ICON__ / __DASH_RECALL_ICON__ 标记，
 * 由 build.mjs 读取 assets/*.png 内联为 data URL 后生成 lib/client.js。
 * 改图标：替换 assets/edit.png、assets/recall.png → 执行 npm run build。
 */
window.__ModuleLoader__.load({
  id: "dsh-bubble-edit",
  factory: function (require) {
    var React = require("react");
    var Primitives = require("@deepseek-ai/dsh-client-ui-primitives");

    var NS = "dsh-bubble-edit";

    /** 操作区图标（构建期内联，自包含） */
    var ICONS = {
      edit: "data:image/png;base64,__DASH_EDIT_ICON__",
      recall: "data:image/png;base64,__DASH_RECALL_ICON__"
    };

    function extractText(content) {
      var parts = [];
      if (Array.isArray(content)) {
        for (var i = 0; i < content.length; i++) {
          var b = content[i];
          if (b && b.type === "text" && typeof b.text === "string") parts.push(b.text);
        }
      }
      return parts.join("\n");
    }

    function iconImg(src, alt) {
      return React.createElement("img", {
        src: src,
        alt: alt,
        width: 18,
        height: 18,
        style: { display: "block" }
      });
    }

    function actionButton(title, ariaLabel, onClick, children) {
      return React.createElement("button", {
        type: "button",
        title: title,
        "aria-label": ariaLabel,
        style: {
          border: "none",
          background: "transparent",
          cursor: "pointer",
          width: 28,
          height: 28,
          padding: 0,
          borderRadius: "8px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center"
        },
        onMouseEnter: function (e) { e.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))"; },
        onMouseLeave: function (e) { e.currentTarget.style.background = "transparent"; },
        onClick: onClick
      }, children);
    }

    /** 复制键：官方 IconCopyOutline16，点击复制消息原文（clipboard，带成功反馈）。
     * 注意：复制键保持原始小尺寸（14px 图标），不随撤回/编辑的 1.3 倍放大。 */
    function CopyButton({ text }) {
      var copied = React.useState(false)[0];
      var setCopied = React.useState(false)[1];
      function copy() {
        var done = function () { setCopied(true); setTimeout(function () { setCopied(false); }, 1500); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text); done(); });
        } else { legacyCopy(text); done(); }
      }
      return React.createElement("button", {
        type: "button",
        title: copied ? "已复制" : "复制",
        "aria-label": "复制",
        style: {
          border: "none",
          background: "transparent",
          cursor: "pointer",
          padding: "3px",
          borderRadius: "8px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center"
        },
        onMouseEnter: function (e) { e.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))"; },
        onMouseLeave: function (e) { e.currentTarget.style.background = "transparent"; },
        onClick: function (e) { e.stopPropagation(); copy(); }
      }, copied
        ? React.createElement(Primitives.IconCheckOutline16, { size: 14 })
        : React.createElement(Primitives.IconCopyOutline16, { size: 14 }));
    }

    /** clipboard API 不可用时的回退复制。 */
    function legacyCopy(text) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e) { /* ignore */ }
      document.body.removeChild(ta);
    }

    function UserBubbleView(props) {
      var node = props.node;
      var data = node && node.data ? node.data : {};
      var text = extractText(data.content);

      var rowStyle = { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", padding: "2px 0" };
      var bubbleStyle = {
        maxWidth: "min(80%, var(--dsh-chat-content-width, 748px))",
        background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.12))",
        borderRadius: "14px",
        padding: "8px 14px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontSize: "14px",
        lineHeight: "22px",
        color: "var(--dsw-alias-label-primary, inherit)"
      };
      var actionsStyle = { display: "flex", gap: "2px" };

      return React.createElement(
        "div", { style: rowStyle, "data-dsh-bubble-edit": "user" },
        React.createElement(
          "div", { style: bubbleStyle },
          text || "（空消息）"
        ),
        React.createElement(
          "div", { style: actionsStyle },
          actionButton("撤回", "撤回", function (e) { e.stopPropagation(); console.info("[dsh-bubble-edit] recall clicked (todo)"); },
            iconImg(ICONS.recall, "撤回")),
          actionButton("编辑", "编辑", function (e) { e.stopPropagation(); console.info("[dsh-bubble-edit] edit clicked (todo)"); },
            iconImg(ICONS.edit, "编辑")),
          React.createElement(CopyButton, { text: text })
        )
      );
    }

    /** 主题自适应样式：深色模式（body[data-ds-dark-theme]，rc.6 已确认标记）下图标反白。 */
    function injectThemeStyle() {
      var id = "dsh-bubble-edit-theme";
      if (document.querySelector("style[data-plugin=\"" + id + "\"]") !== null) return null;
      var tag = document.createElement("style");
      tag.dataset.plugin = id;
      tag.textContent =
        "[data-dsh-bubble-edit] img{transition:filter .15s}" +
        "body[data-ds-dark-theme] [data-dsh-bubble-edit] img{filter:invert(1)}";
      document.head.appendChild(tag);
      return tag;
    }

    function apply(ctx) {
      ctx.effect(function () {
        var disposers = [];
        var styleTag = injectThemeStyle();
        console.info("[dsh-bubble-edit] client half active (part2.1)");
        var d = ctx.slots.inject("conversation.chat.node", function () {
          return ctx.slots.register({
            name: "conversation.chat.node",
            key: "user",
            priority: -1
          }, UserBubbleView);
        });
        if (typeof d === "function") disposers.push(d);
        return function () {
          for (var i = 0; i < disposers.length; i++) disposers[i]();
          if (styleTag !== null) styleTag.remove();
          console.info("[dsh-bubble-edit] client half unloaded");
        };
      }, "dsh-bubble-edit: UserBubbleView overlay");
    }

    return { name: "dsh-bubble-edit", inject: ["slots"], apply: apply };
  }
});
