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

    // ---------- 设置读取（localStorage；设置页 UI 在 M3 提供） ----------
    var SETTING_KEYS = {
      conflictMode: "dsh-bubble-edit:conflictMode",   // "overwrite" | "merge"
      visualMode: "dsh-bubble-edit:visualMode"        // "minimal" | "simple" | "info"
    };
    function getSetting(key, def) {
      try { var v = localStorage.getItem(key); return v === null ? def : v; } catch (e) { return def; }
    }
    function draftConflictMode() { return getSetting(SETTING_KEYS.conflictMode, "overwrite"); }
    function recallVisualMode() { return getSetting(SETTING_KEYS.visualMode, "minimal"); }

    // ---------- pending store（按会话；内存缓存 + localStorage 持久化 + 订阅） ----------
    var PENDING_PREFIX = "dsh-bubble-edit:pending:";
    var pendingCache = {};
    var pendingListeners = [];
    function loadPendingFromStorage(sessionId) {
      try { var raw = localStorage.getItem(PENDING_PREFIX + sessionId); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    }
    function readPending(sessionId) {
      if (!(sessionId in pendingCache)) pendingCache[sessionId] = loadPendingFromStorage(sessionId);
      return pendingCache[sessionId];
    }
    function writePending(sessionId, p) {
      pendingCache[sessionId] = p;
      try {
        if (p === null) localStorage.removeItem(PENDING_PREFIX + sessionId);
        else localStorage.setItem(PENDING_PREFIX + sessionId, JSON.stringify(p));
      } catch (e) { /* ignore */ }
      var ls = pendingListeners.slice();
      for (var i = 0; i < ls.length; i++) { try { ls[i](); } catch (e) { /* ignore */ } }
    }
    function subscribePending(fn) {
      pendingListeners.push(fn);
      return function () { var i = pendingListeners.indexOf(fn); if (i !== -1) pendingListeners.splice(i, 1); };
    }
    function usePending(sessionId) {
      return React.useSyncExternalStore(subscribePending, function () { return readPending(sessionId); });
    }

    /** 「正在修改」条：输入框上方的 dock 条（灰分割线 + 左上标签 + 右上圆形×）。 */
    function RecallBanner(props) {
      var sessionId = props.sessionId;
      var pending = usePending(sessionId);
      if (!pending || pending.type !== "recall") return null;
      function cancel() {
        var ia = props.inputActions;
        if (ia && typeof ia.setDraft === "function" && typeof pending.originalDraft === "string") {
          ia.setDraft(pending.originalDraft); // 恢复输入框原草稿（覆盖/合并统一恢复）
        }
        writePending(sessionId, null);
        console.info("[dsh-bubble-edit] recall cancelled (恢复原草稿)");
      }
      var barStyle = {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        width: "100%",
        borderTop: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
        paddingTop: "6px",
        marginTop: "2px"
      };
      var labelStyle = { fontSize: "12px", color: "var(--dsw-alias-label-secondary)", flex: "1", lineHeight: "18px" };
      var xStyle = {
        border: "none",
        background: "transparent",
        cursor: "pointer",
        width: 20,
        height: 20,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--dsw-alias-label-secondary)",
        fontSize: "15px",
        lineHeight: "15px",
        padding: 0
      };
      return React.createElement(
        "div", { style: barStyle, "data-dsh-bubble-edit": "recall-banner" },
        React.createElement("span", { style: labelStyle }, "正在修改"),
        React.createElement("button", {
          type: "button",
          title: "取消撤回",
          "aria-label": "取消撤回",
          style: xStyle,
          onClick: function (e) { e.stopPropagation(); cancel(); }
        }, "×")
      );
    }

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

    function iconImg(src, alt, size) {
      var s = size || 18;
      return React.createElement("img", {
        src: src,
        alt: alt,
        width: s,
        height: s,
        style: { display: "block" }
      });
    }

    function actionButton(title, ariaLabel, onClick, children) {
      var bs = 34;
      return React.createElement("button", {
        type: "button",
        title: title,
        "aria-label": ariaLabel,
        style: {
          border: "none",
          background: "transparent",
          cursor: "pointer",
          width: bs,
          height: bs,
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

    /** 时间格式化（对齐官方 formatMessageClock）：今天 HH:MM；同年 M/D HH:MM；跨年 Y/M/D HH:MM。 */
    function pad2(n) { return n < 10 ? "0" + n : "" + n; }
    function formatClock(time) {
      if (typeof time !== "number" || !isFinite(time)) return "";
      var d = new Date(time);
      var n = new Date();
      var clock = pad2(d.getHours()) + ":" + pad2(d.getMinutes());
      if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) return clock;
      if (d.getFullYear() === n.getFullYear()) return (d.getMonth() + 1) + "/" + d.getDate() + " " + clock;
      return d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate() + " " + clock;
    }

    /**
     * 统计当前消息之后的内容条数。
     * seqField: "seq"（legacy nodes）或 "anchorSeq"（chat store）。
     * onlyUser: 仅统计用户提问消息（kind === "user"），即「撤回提示统计仅包含用户提问语句」开关。
     */
    function countContentAfter(nodes, anchorSeq, seqField, onlyUser) {
      var field = seqField || "seq";
      var n = 0;
      if (!Array.isArray(nodes)) return n;
      for (var i = 0; i < nodes.length; i++) {
        var nd = nodes[i];
        if (nd === null || typeof nd !== "object") continue;
        var s = nd[field];
        if (typeof s !== "number" || s <= anchorSeq) continue;
        if (nd.kind === "turn-tail") continue;
        if (onlyUser && nd.kind !== "user") continue;
        n++;
      }
      return n;
    }

    /** 「撤回提示统计仅包含用户提问语句」开关（默认开）。设置页 UI 在 M3 提供，当前经 localStorage 读取。 */
    var STAT_ONLY_USER_KEY = "dsh-bubble-edit:statOnlyUser";
    function statOnlyUser() {
      try { return localStorage.getItem(STAT_ONLY_USER_KEY) !== "0"; }
      catch (e) { return true; }
    }

    /**
     * 行内确认胶囊（撤回确认）：长条形灰色胶囊，直接包裹文本 + 白底黑字「确定」「取消」小胶囊按钮。
     * 位置：原用户气泡下方（撤回/复制键位置）；按钮与胶囊边框间距按 dsh 间距规范（gap 8px / padding 6px 10px）。
     */
    function ConfirmCapsule({ text, onConfirm, onCancel }) {
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
        "div", { style: capsuleStyle, "data-dsh-bubble-edit": "confirm-capsule" },
        React.createElement("span", null, text),
        React.createElement("button", { type: "button", style: pillBtnStyle, onClick: function (e) { e.stopPropagation(); onConfirm(); } }, "确定"),
        React.createElement("button", { type: "button", style: pillBtnStyle, onClick: function (e) { e.stopPropagation(); onCancel(); } }, "取消")
      );
    }

    /** 复制键：官方 IconCopyOutline16，点击复制消息原文（clipboard，带成功反馈）。
     * 注意：复制键保持原始小尺寸（14px 图标），不随撤回/编辑的 1.3 倍放大。 */
    function CopyButton({ text }) {
      var copyState = React.useState(false);
      var copied = copyState[0];
      var setCopied = copyState[1];
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
          width: 34,
          height: 34,
          padding: 0,
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

      var sessionId = props.sessionId;
      var myKey = node && typeof node.key === "string" ? node.key : "";
      var pending = usePending(sessionId);

      // 撤回确认态：true 时操作区替换为行内确认胶囊（惰性提交——确认只是本地态，真正修改在发送时）
      var confirmState = React.useState(false);
      var confirming = confirmState[0];
      var setConfirming = confirmState[1];

      // 渲染期读取输入框草稿（存 ref 供确认时使用）
      var draftRef = React.useRef("");
      var inputState = typeof props.useInput === "function" ? props.useInput(function (s) { return s; }) : null;
      if (inputState) draftRef.current = inputState.draft;

      // 统计该消息之后的内容条数（x 条内容）——防御式读取：任何异常都不影响气泡渲染
      var anchorSeq = node && typeof node.anchorSeq === "number" ? node.anchorSeq : (node && typeof node.seq === "number" ? node.seq : 0);
      var afterCount = 0;
      var onlyUser = statOnlyUser();
      try {
        // 注意：useSession 必须传 selector（官方 bindSnapshotSelector 契约），无参调用会崩
        var snapshot = typeof props.useSession === "function" ? props.useSession(function (s) { return s; }) : null;
        if (snapshot) {
          // 主路径：chat.order（权威渲染顺序）+ 当前节点 key
          if (snapshot.chat && Array.isArray(snapshot.chat.order) && snapshot.chat.nodes && typeof snapshot.chat.nodes.get === "function") {
            var order = snapshot.chat.order;
            var myKey = node && typeof node.key === "string" ? node.key : "";
            var myIdx = order.indexOf(myKey);
            if (myIdx !== -1) {
              for (var k = myIdx + 1; k < order.length; k++) {
                var afterNode = snapshot.chat.nodes.get(order[k]);
                if (!afterNode || afterNode.kind === "turn-tail") continue;
                if (onlyUser && afterNode.kind !== "user") continue;
                afterCount++;
              }
            }
          }
          // 回退路径 1：legacy 顶层 nodes（seq）
          if (afterCount === 0 && Array.isArray(snapshot.nodes)) {
            afterCount = countContentAfter(snapshot.nodes, anchorSeq, "seq", onlyUser);
          }
          // 回退路径 2：chat store values（anchorSeq）
          if (afterCount === 0 && snapshot.chat && snapshot.chat.nodes && typeof snapshot.chat.nodes.values === "function") {
            afterCount = countContentAfter(snapshot.chat.nodes.values(), anchorSeq, "anchorSeq", onlyUser);
          }
        }
      } catch (err) {
        console.warn("[dsh-bubble-edit] 会话快照读取失败（数量显示 0）：", err);
      }
      // 一次性诊断（数量显示 0 时用于定位数据源）
      if (!window.__dshBubbleEditDebug) {
        window.__dshBubbleEditDebug = true;
        var diag = {
          hasUseSession: typeof props.useSession,
          hasSnapshot: !!snapshot,
          orderLen: snapshot && snapshot.chat && Array.isArray(snapshot.chat.order) ? snapshot.chat.order.length : -1,
          nodeKey: node && typeof node.key === "string" ? node.key : "(none)",
          myIdx: snapshot && snapshot.chat && Array.isArray(snapshot.chat.order) ? snapshot.chat.order.indexOf(node && typeof node.key === "string" ? node.key : "") : -2,
          nodesLen: snapshot && Array.isArray(snapshot.nodes) ? snapshot.nodes.length : -1,
          chatValuesLen: snapshot && snapshot.chat && snapshot.chat.nodes && typeof snapshot.chat.nodes.values === "function" ? snapshot.chat.nodes.values().length : -1,
          anchorSeq: anchorSeq
        };
        console.info("[dsh-bubble-edit] snapshot debug:", JSON.stringify(diag));
      }

      // 发送时间（hover 显示，对齐官方 data-time-hover-root 机制）
      var msgTime = data && typeof data.time === "number" ? data.time : (typeof node.time === "number" ? node.time : 0);

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
      var actionsStyle = { display: "flex", gap: "2px", alignItems: "center" };

      // 极简视觉模式：本消息处于撤回待定 → 无痕隐藏（数据未变，仅显示层）
      if (pending && pending.type === "recall" && pending.targetKey === myKey && pending.visualHide) return null;

      var timeStyle = {
        color: "var(--dsw-alias-label-tertiary)",
        whiteSpace: "nowrap",
        fontSize: "14px",
        lineHeight: "24px",
        display: "inline-flex",
        alignItems: "center",
        height: 28,
        paddingRight: "4px"
      };

      return React.createElement(
        "div", { style: rowStyle, "data-dsh-bubble-edit": "user", "data-time-hover-root": true },
        React.createElement(
          "div", { style: bubbleStyle },
          text || "（空消息）"
        ),
        confirming
          ? React.createElement(ConfirmCapsule, {
              text: afterCount === 0 ? "是否撤回这条消息？" : (onlyUser ? "撤回这条消息及其后 " + afterCount + " 条提问？" : "撤回这条消息及其后 " + afterCount + " 条内容？"),
              onConfirm: function () {
                setConfirming(false);
                // 惰性提交：此刻只记录 pending + 回填输入框，真正修改发生在「发送」时（发送钩子，下一步实现）
                var conflictMode = draftConflictMode();
                var visualMode = recallVisualMode();
                writePending(sessionId, {
                  type: "recall",
                  targetKey: myKey,
                  targetSeq: anchorSeq,
                  draftText: text,
                  originalDraft: draftRef.current,
                  conflictMode: conflictMode,
                  visualMode: visualMode,
                  visualHide: visualMode === "minimal",
                  updatedAt: Date.now()
                });
                var ia = props.inputActions;
                if (ia && typeof ia.setDraft === "function") {
                  var nextDraft = (conflictMode === "merge" && draftRef.current !== "") ? draftRef.current + "\n" + text : text;
                  ia.setDraft(nextDraft);
                }
                console.info("[dsh-bubble-edit] recall pending set（发送时执行真正撤回）");
              },
              onCancel: function () { setConfirming(false); }
            })
          : React.createElement(
              "div", { style: actionsStyle },
              React.createElement("span", { className: "dbe-time", style: timeStyle }, formatClock(msgTime)),
              actionButton("撤回", "撤回", function (e) {
                e.stopPropagation();
                if (pending && pending.type === "recall") {
                  console.info("[dsh-bubble-edit] 已有待处理撤回（单待定约束），请先取消或发送");
                  return;
                }
                setConfirming(true);
              },
                iconImg(ICONS.recall, "撤回")),
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
        "body[data-ds-dark-theme] [data-dsh-bubble-edit] img{filter:invert(1)}" +
        "@media (hover:hover){[data-dsh-bubble-edit][data-time-hover-root] .dbe-time{opacity:0;transition:opacity 80ms}" +
        "[data-dsh-bubble-edit][data-time-hover-root]:hover .dbe-time,[data-dsh-bubble-edit][data-time-hover-root]:focus-within .dbe-time{opacity:1}}";
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
        // 「正在修改」条：输入框上方 dock
        var d3 = ctx.slots.inject("conversation.input.dock", function () {
          return ctx.slots.register({
            name: "conversation.input.dock",
            id: "dsh-bubble-edit-recall-banner",
            order: -10
          }, RecallBanner);
        });
        if (typeof d3 === "function") disposers.push(d3);
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
