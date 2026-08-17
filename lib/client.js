/**
 * dsh-bubble-edit — browser half（骨架）。
 *
 * 当前：最小可加载占位（生命周期日志）。后续 part 依次加入：
 *  - UserBubbleView（覆盖 conversation.chat.node user keyed 渲染器）
 *  - 撤回流程（确认胶囊 / 回填 / 「正在修改」条 / 三视觉模式 / 发送钩子）
 *  - 编辑流程（三档宽度 / 取消确定）
 *  - < X > 版本翻页器 + 设置页
 */
window.__ModuleLoader__.load({
  id: "dsh-bubble-edit",
  factory: function (require) {
    function apply(ctx) {
      ctx.effect(function () {
        console.info("[dsh-bubble-edit] client half loaded (skeleton)");
        return function () {
          console.info("[dsh-bubble-edit] client half unloaded");
        };
      }, "dsh-bubble-edit: lifecycle log");
    }
    return { name: "dsh-bubble-edit", inject: [], apply: apply };
  }
});
