/**
 * dsh-bubble-edit — browser half（Part 2：UserBubbleView 最小覆盖）。
 *
 * 已实现：
 *  - 覆盖 conversation.chat.node keyed 槽的 user 渲染器（priority:-1，机制已验证）
 *  - 气泡显示用户消息文本（右侧对齐，官方令牌变量）
 *  - 操作区占位：「✏️ 编辑」「↶ 撤回」按钮（点击仅日志，行为后续 part 接入）
 *
 * 技术要点（rc.6 已验证）：
 *  - seed 词表提供 require('react') / '@deepseek-ai/dsh-client-ui-slots' /
 *    '@deepseek-ai/dsh-client-ui-primitives' 等 → 官方 React 单副本 + 官方组件复用。
 */
window.__ModuleLoader__.load({
  id: "dsh-bubble-edit",
  factory: function (require) {
    var React = require("react");

    var NS = "dsh-bubble-edit";

    /** 取消息 content blocks 中的文本（Part 2 最小版：仅拼接 text block）。 */
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

    /** 用户消息气泡（显示态）+ 操作区占位。后续 part：编辑态/确认胶囊/撤回流程。 */
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
      var actionsStyle = { display: "flex", gap: "6px" };
      var btnStyle = {
        border: "none",
        background: "transparent",
        color: "var(--dsw-alias-label-secondary)",
        fontSize: "12px",
        cursor: "pointer",
        padding: "2px 8px",
        borderRadius: "8px"
      };

      return React.createElement(
        "div", { style: rowStyle, "data-dsh-bubble-edit": "user" },
        React.createElement(
          "div", { style: bubbleStyle },
          text || "（空消息）"
        ),
        React.createElement(
          "div", { style: actionsStyle },
          React.createElement("button", {
            type: "button",
            style: btnStyle,
            title: "编辑（占位）",
            onClick: function (e) { e.stopPropagation(); console.info("[dsh-bubble-edit] edit clicked (todo)"); }
          }, "✏️ 编辑"),
          React.createElement("button", {
            type: "button",
            style: btnStyle,
            title: "撤回（占位）",
            onClick: function (e) { e.stopPropagation(); console.info("[dsh-bubble-edit] recall clicked (todo)"); }
          }, "↶ 撤回")
        )
      );
    }

    function apply(ctx) {
      ctx.effect(function () {
        var disposers = [];
        console.info("[dsh-bubble-edit] client half active (part2)");
        // 覆盖官方 user 渲染器（keyed 槽 priority 抢占，rc.6 已验证）
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
          console.info("[dsh-bubble-edit] client half unloaded");
        };
      }, "dsh-bubble-edit: UserBubbleView overlay");
    }

    return { name: "dsh-bubble-edit", inject: ["slots"], apply: apply };
  }
});
