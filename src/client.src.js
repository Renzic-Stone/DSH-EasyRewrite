/**
 * dsh-easyrewrite — browser half（Part 2.1）。
 *
 * 本文件是**源码模板**：图标以占位符 __DASH_EDIT_ICON__ / __DASH_RECALL_ICON__ 标记，
 * 由 build.mjs 读取 assets/*.png 内联为 data URL 后生成 lib/client.js。
 * 改图标：替换 assets/edit.png、assets/recall.png → 执行 npm run build。
 */
window.__ModuleLoader__.load({
  id: "dsh-easyrewrite",
  factory: function (require) {
    var React = require("react");
    var Primitives = require("@deepseek-ai/dsh-client-ui-primitives");

    var NS = "dsh-easyrewrite";

    /** 统一日志：默认静默（仅上报 host 落盘）；调试模式（localStorage dsh-easyrewrite:debug=1）时打印控制台。 */
    function debugEnabled() {
      try { return localStorage.getItem("dsh-easyrewrite:debug") === "1"; } catch (e) { return false; }
    }
    function log(level, tag, message, data) {
      try {
        if (debugEnabled()) {
          var prefix = "[dsh-easyrewrite][" + level + "] " + (tag ? "[" + tag + "] " : "");
          if (level === "error") console.error(prefix + message, data !== undefined ? data : "");
          else if (level === "warn") console.warn(prefix + message, data !== undefined ? data : "");
          else console.info(prefix + message, data !== undefined ? data : "");
        }
        try {
          fetch("/bubble/log", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ level: level, tag: tag, message: message, data: data !== undefined ? data : null }),
            keepalive: true
          }).catch(function () { /* 静默 */ });
        } catch (e) { /* 静默 */ }
      } catch (e) { /* 静默 */ }
    }

    /** 操作区图标（构建期内联，自包含） */
    var ICONS = {
      edit: "data:image/png;base64,__DASH_EDIT_ICON__",
      recall: "data:image/png;base64,__DASH_RECALL_ICON__"
    };

    // ---------- 设置读取（localStorage；设置页 UI 在 M3 提供） ----------
    var SETTING_KEYS = {
      conflictMode: "dsh-easyrewrite:conflictMode",   // "overwrite" | "merge"
      visualMode: "dsh-easyrewrite:visualMode"        // "minimal" | "simple" | "info"
    };
    function getSetting(key, def) {
      try { var v = localStorage.getItem(key); return v === null ? def : v; } catch (e) { return def; }
    }
    function draftConflictMode() { return getSetting(SETTING_KEYS.conflictMode, "overwrite"); }
    function recallVisualMode() { return getSetting(SETTING_KEYS.visualMode, "simple"); }

    // ---------- pending store（按会话；内存缓存 + localStorage 持久化 + 订阅） ----------
    var PENDING_PREFIX = "dsh-easyrewrite:pending:";
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

    /**
     * 「正在修改」条：**注入到输入框内部、文本输入位置上方**（textarea 正前方）。
     * 组成：灰色分割线（上边线）+ 左上「正在修改」标签 + 右上圆形 ×。
     * 输入框随条自然向上扩展一点，文本位置不变；× = 取消撤回（恢复原草稿）。
     * 纯 DOM 注入（[data-input-scroll] 为官方输入区稳定标记），卸载时移除。
     */
    function RecallBanner(props) {
      var sessionId = props.sessionId;
      var pending = usePending(sessionId);
      var active = pending && pending.type === "recall";

      React.useEffect(function () {
        if (!active) return;
        // 注意：textarea 是 absolute 定位（覆盖在 mirror 上），不能插进其父容器；
        // 条注入到输入滚动区（[data-input-scroll]）正前方——卡片内部、文本输入区上方，
        // 正常流布局不重叠，输入卡片随之向上扩展、文本位置不变。
        var scrollEl = document.querySelector("[data-input-scroll]");
        if (!scrollEl || !scrollEl.parentNode) return;
        var bar = document.createElement("div");
        bar.setAttribute("data-dsh-easyrewrite", "recall-bar");
        // 分割线左右留空（margin 与输入文本区对齐）；字与 × 相对分割线端点再内收（padding 10px）
        // 内容靠上（相对分割线留出下间距）；标签灰色药丸底；× 灰色圆形底（hover 高亮见注入样式）
        bar.style.cssText = "display:flex;align-items:center;gap:10px;margin:0 16px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,0.25));padding:2px 6px 12px;";
        var label = document.createElement("span");
        // 标签药丸只包裹文字（内容宽度）；透明 spacer 撑开剩余空间把 × 推到最右
        label.style.cssText = "font-size:14px;color:var(--dsw-alias-label-secondary);line-height:22px;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,0.12));border-radius:999px;padding:1px 12px;";
        var spacer = document.createElement("div");
        spacer.style.cssText = "flex:1;";
        label.textContent = "正在修改";
        var xBtn = document.createElement("button");
        xBtn.type = "button";
        xBtn.title = "取消撤回";
        xBtn.setAttribute("aria-label", "取消撤回");
        xBtn.className = "dbe-recall-x";
        xBtn.style.cssText = "border:none;cursor:pointer;width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary);font-size:18px;line-height:18px;padding:0;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,0.12));";
        xBtn.textContent = "×";
        xBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          var ia = props.inputActions;
          if (ia && typeof ia.setDraft === "function" && typeof pending.originalDraft === "string") {
            ia.setDraft(pending.originalDraft); // 恢复输入框原草稿（覆盖/合并统一恢复）
          }
          writePending(sessionId, null);
          log("info", "recall", "pending cancelled（恢复原草稿）");
        });
        bar.appendChild(label);
        bar.appendChild(spacer);
        bar.appendChild(xBtn);
        scrollEl.parentNode.insertBefore(bar, scrollEl);
        return function () { if (bar.parentNode) bar.parentNode.removeChild(bar); };
      }, [active, sessionId, pending]);

      // ---- 后续 context 隐藏（minimal/simple 模式）：DOM 层隐藏本行之后的所有内容行 ----
      var hiddenRows = React.useRef(new Set());
      function applyHideAfter(list, targetKey) {
        var rows = list.querySelectorAll("[data-chat-anchor-key]");
        var started = false;
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          if (!started) {
            if (row.dataset && row.dataset.chatAnchorKey === targetKey) { started = true; }
            continue;
          }
          if (!hiddenRows.current.has(row)) {
            row.style.display = "none";
            hiddenRows.current.add(row);
          }
        }
      }
      function restoreHiddenRows() {
        hiddenRows.current.forEach(function (el) { el.style.display = ""; });
        hiddenRows.current.clear();
      }
      React.useEffect(function () {
        if (!active || !pending) return;
        var mode = pending.visualMode || "minimal";
        if (mode !== "minimal" && mode !== "simple") return; // info 模式不隐藏后续
        var list = document.querySelector("[data-chat-flow]");
        if (!list) return;
        applyHideAfter(list, pending.targetKey);
        var mo = new MutationObserver(function () { applyHideAfter(list, pending.targetKey); });
        mo.observe(list, { childList: true, subtree: true });
        return function () { mo.disconnect(); restoreHiddenRows(); };
      }, [active, pending, sessionId]);

      // ---- 发送钩子：pending 存在时拦截 Enter 与发送按钮，先真正撤回再发送 ----
      function findPrimaryButton() {
        var card = document.querySelector("[data-composer-card]");
        if (!card) return null;
        var btns = card.querySelectorAll("button[aria-label]");
        for (var i = 0; i < btns.length; i++) {
          // 官方文案：zh "发送消息"/"停止…"；en "Send message"/"Stop…" → 子串匹配更稳
          var al = (btns[i].getAttribute("aria-label") || "").toLowerCase();
          if (al.indexOf("发送") !== -1 || al.indexOf("send") !== -1 || al.indexOf("停止") !== -1 || al.indexOf("stop") !== -1) return btns[i];
        }
        return null;
      }
      function doRecallThenSend(p) {
        var sid = props.sessionId;
        // 读取输入框当前文本（用户可能已修改）：resume 发送的是修改后的内容
        var sendText = p.draftText;
        try {
          var ta = document.querySelector("[data-input-scroll] textarea");
          if (ta && typeof ta.value === "string" && ta.value !== "") sendText = ta.value;
        } catch (e) { /* ignore */ }
        log("info", "recall", "发送内容（修改后）", { sendText: sendText.slice(0, 100) });
        fetch("/bubble/recall", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: sid, targetSeq: p.targetSeq })
        }).then(function (resp) { return resp.json(); }).then(async function (data) {
          if (!data || !data.ok) {
            var errText = (data && data.error) || "unknown";
            var msg = (data && data.message) || "";
            log("warn", "recall", "撤回失败（发送中止）", { error: errText, message: msg });
            return;
          }
          // 1) 官方 client fork：child 进入会话列表（可打开）+ 继承原标题
          var newId = null;
          try {
            newId = await props.ctxSessions.fork({ sessionId: sid, atSeq: data.boundary });
          } catch (e) {
            log("error", "recall", "fork 失败（发送中止）", { err: String(e && e.message ? e.message : e) });
            return;
          }
          writePending(sid, null);
          try { localStorage.setItem("dsh-easyrewrite:resume-send:" + newId, JSON.stringify({ draftText: sendText })); } catch (e) { /* ignore */ }
          // 2) 无痕替换：归档原会话 → 打开新会话
          var archived = false;
          try {
            if (typeof props.ctxWorkspaces !== "undefined" && typeof props.ctxWorkspaces.archiveSession === "function") {
              props.ctxWorkspaces.archiveSession(sid);
              archived = true;
            }
          } catch (e) { log("warn", "recall", "归档原会话失败", { err: String(e && e.message ? e.message : e) }); }
          log("info", "recall", "撤回完成：归档原会话 + 打开新会话", { newId: newId, archived: archived });
          if (typeof props.openSession === "function") props.openSession(newId);
        }).catch(function (err) {
          log("error", "recall", "撤回请求失败（发送中止）", { err: String(err && err.message ? err.message : err) });
        });
      }
      React.useEffect(function () {
        if (!active || !pending) return;
        var p = pending;
        function onKeyDownCapture(e) {
          if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
          var ta = document.querySelector("[data-input-scroll] textarea");
          if (!ta || e.target !== ta) return;
          e.preventDefault();
          e.stopPropagation();
          doRecallThenSend(p);
        }
        function onClickCapture(e) {
          var btn = findPrimaryButton();
          if (!btn || !btn.contains(e.target)) return;
          e.preventDefault();
          e.stopPropagation();
          doRecallThenSend(p);
        }
        document.addEventListener("keydown", onKeyDownCapture, true);
        document.addEventListener("click", onClickCapture, true);
        return function () {
          document.removeEventListener("keydown", onKeyDownCapture, true);
          document.removeEventListener("click", onClickCapture, true);
        };
      }, [active, sessionId, pending]);

      // ---- 恢复发送：切换到新会话后，回填草稿并自动提交 ----
      var resumeKey = "dsh-easyrewrite:resume-send:" + sessionId;
      React.useEffect(function () {
        var raw = null;
        try { raw = localStorage.getItem(resumeKey); } catch (e) { /* ignore */ }
        if (!raw) return;
        var r = null;
        try { r = JSON.parse(raw); } catch (e) { /* ignore */ }
        try { localStorage.removeItem(resumeKey); } catch (e) { /* ignore */ }
        if (!r || typeof r.draftText !== "string") return;
        var ia = props.inputActions;
        if (ia && typeof ia.setDraft === "function" && typeof ia.submit === "function") {
          ia.setDraft(r.draftText);
          log("info", "recall", "resume：回填草稿并自动发送", { sessionId: sessionId });
          setTimeout(function () { try { ia.submit(); } catch (e) { log("error", "recall", "自动发送失败（resume）", { err: String(e && e.message ? e.message : e) }); } }, 60);
        }
      }, [sessionId, resumeKey]);

      return null; // 纯 DOM 注入，槽位不渲染内容
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

    /**
     * 编辑宽度三档（localStorage dsh-easyrewrite:editWidth；默认 wrap）：
     *  - bubble：从气泡原宽起步（不主动改变气泡大小），随打字横向扩展
     *  - wrap：从适中宽度（360px）起步，随打字扩展到 748px
     *  - composer：固定 748px 顶到头（等同输入框区域）
     * 字符宽度估算：最长行字符数 × 8px（中文 14 / 英文 7 的折中）+ padding 28。
     */
    function editWidthFor(mode, text, initW) {
      if (mode === "composer") return 748;
      var longest = 0;
      var lines = String(text || "").split("\n");
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].length > longest) longest = lines[i].length;
      }
      var contentW = Math.min(longest * 8 + 28, 748);
      var base = mode === "bubble" ? (initW || 240) : 360;
      return Math.max(base, contentW);
    }
    function editWidthMode() {
      try { return localStorage.getItem("dsh-easyrewrite:editWidth") || "wrap"; } catch (e) { return "wrap"; }
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
    var STAT_ONLY_USER_KEY = "dsh-easyrewrite:statOnlyUser";
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
        "div", { style: capsuleStyle, "data-dsh-easyrewrite": "confirm-capsule" },
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

      // 灰字气泡的原文预览展开态（simple/info 模式点击切换）
      var previewState = React.useState(false);
      var showPreview = previewState[0];
      var setShowPreview = previewState[1];

      // 编辑态（气泡 rewrite）：textarea 内容 + 是否编辑中；pending{type:"edit"} 持久化支持跨会话/刷新恢复
      var editState = React.useState(false);
      var editing = editState[0];
      var setEditing = editState[1];
      var editTextState = React.useState("");
      var editText = editTextState[0];
      var setEditText = editTextState[1];
      var bubbleInitState = React.useState(0); // bubble 档：进入编辑时气泡原宽
      var bubbleInitW = bubbleInitState[0];
      var isEditPending = pending && pending.type === "edit" && pending.targetKey === myKey;
      React.useEffect(function () {
        if (isEditPending && !editing) {
          setEditing(true);
          setEditText(pending.draftText);
        }
      }, [isEditPending]);

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
        log("warn", "count", "会话快照读取失败（数量显示 0）", { err: String(err && err.message ? err.message : err) });
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
        log("info", "debug", "snapshot debug", diag);
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

      // 撤回待定且为本消息：按视觉模式显示（数据未变，仅显示层）
      var pendingMine = pending && pending.type === "recall" && pending.targetKey === myKey;
      if (pendingMine && pending.visualMode !== "simple" && pending.visualMode !== "info") {
        return null; // 极简：气泡无痕隐藏
      }
      if (pendingMine) {
        // 简单/信息：气泡保留，文字变灰「正在修改此处文本」；点击展开/收起灰色原文预览
        var grayBubbleStyle = {
          maxWidth: "min(80%, var(--dsh-chat-content-width, 748px))",
          background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.10))",
          borderRadius: "14px",
          padding: "8px 14px",
          fontSize: "14px",
          lineHeight: "22px",
          cursor: "pointer",
          color: "var(--dsw-alias-label-tertiary)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word"
        };
        var previewStyle = {
          marginTop: "4px",
          color: "var(--dsw-alias-label-tertiary)",
          fontSize: "13px",
          lineHeight: "20px",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word"
        };
        return React.createElement(
          "div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", padding: "2px 0" }, "data-dsh-easyrewrite": "user-pending" },
          React.createElement(
            "div", {
              style: grayBubbleStyle,
              title: showPreview ? "收起" : "查看原文",
              onClick: function (e) { e.stopPropagation(); setShowPreview(!showPreview); }
            },
            showPreview
              ? React.createElement("div", { style: previewStyle }, text || "（空消息）")
              : "正在修改此处文本"
          )
        );
      }

      // ---------- 编辑态（气泡 rewrite） ----------
      function enterEdit(initWidth) {
        if (pending) { log("warn", "edit", "已有待处理操作（单待定约束），请先处理"); return; }
        var realSeq = (data && typeof data.seq === "number") ? data.seq : anchorSeq;
        writePending(sessionId, { type: "edit", targetKey: myKey, targetSeq: realSeq, draftText: text, updatedAt: Date.now() });
        if (initWidth && initWidth > 0) bubbleInitState[1](initWidth);
        setEditing(true);
        setEditText(text);
        log("info", "edit", "进入编辑态", { sessionId: sessionId, targetSeq: realSeq, initW: initWidth });
      }
      function cancelEdit() {
        if (isEditPending) writePending(sessionId, null);
        setEditing(false);
        log("info", "edit", "编辑取消（原样不变）");
      }
      function confirmEdit() {
        // 4a 占位：真正截断重发在 4b 实现
        log("info", "edit", "确定（编辑重发逻辑待 4b）", { draft: editText.slice(0, 80) });
        if (isEditPending) writePending(sessionId, null);
        setEditing(false);
      }
      function onBubbleClick(e) {
        if (editing || confirming) return;
        var sel = window.getSelection && window.getSelection();
        if (sel && typeof sel.toString === "function" && sel.toString().length > 0) return; // 有选区不进入
        if (e.target && typeof e.target.closest === "function" && e.target.closest("a")) return; // 点链接不进入
        enterEdit(e.currentTarget ? e.currentTarget.offsetWidth : 0);
      }
      if (editing) {
        var editMode = editWidthMode();
        var editBoxW = editWidthFor(editMode, editText, bubbleInitW);
        var lineCount = (editText.match(/\n/g) || []).length + 1;
        var taRows = Math.max(3, Math.min(10, lineCount));
        var editBoxStyle = {
          width: "100%",
          maxWidth: editBoxW,
          boxSizing: "border-box",
          background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.12))",
          borderRadius: "14px",
          padding: "8px 14px",
          display: "flex",
          flexDirection: "column",
          gap: "6px"
        };
        var taStyle = {
          width: "100%",
          border: "none",
          outline: "none",
          background: "transparent",
          resize: "none",
          font: "inherit",
          fontSize: "14px",
          lineHeight: "22px",
          color: "var(--dsw-alias-label-primary)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          minHeight: "44px",
          maxHeight: "240px",
          overflowY: "auto"
        };
        var btnRowStyle = { display: "flex", justifyContent: "flex-end", gap: "8px" };
        var primaryBtnStyle = {
          border: "none",
          background: "var(--dsw-static-deepseek-500, #4d6bfe)",
          color: "#ffffff",
          borderRadius: "999px",
          padding: "4px 16px",
          fontSize: "13px",
          cursor: "pointer"
        };
        var ghostBtnStyle = {
          border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
          background: "transparent",
          color: "var(--dsw-alias-label-secondary)",
          borderRadius: "999px",
          padding: "4px 16px",
          fontSize: "13px",
          cursor: "pointer"
        };
        return React.createElement(
          "div", { style: rowStyle, "data-dsh-easyrewrite": "user-editing" },
          React.createElement(
            "div", { style: editBoxStyle },
            React.createElement("textarea", {
              value: editText,
              rows: taRows,
              autoFocus: true,
              placeholder: "（空消息）",
              style: taStyle,
              onChange: function (e) { setEditText(e.target.value); },
              onKeyDown: function (e) {
                if (e.key === "Escape") { e.stopPropagation(); cancelEdit(); }
                else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); confirmEdit(); }
              }
            }),
            React.createElement(
              "div", { style: btnRowStyle },
              React.createElement("button", { type: "button", style: ghostBtnStyle, onClick: function (e) { e.stopPropagation(); cancelEdit(); } }, "取消"),
              React.createElement("button", { type: "button", style: primaryBtnStyle, onClick: function (e) { e.stopPropagation(); confirmEdit(); } }, "确定")
            )
          ),
          React.createElement(
            "div", { style: actionsStyle },
            actionButton("撤回", "撤回", function (e) {
              e.stopPropagation();
              // 编辑态直接转撤回：丢弃编辑草稿 → 确认胶囊
              if (isEditPending) writePending(sessionId, null);
              setEditing(false);
              setConfirming(true);
            }, iconImg(ICONS.recall, "撤回"))
          )
        );
      }

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
        "div", { style: rowStyle, "data-dsh-easyrewrite": "user", "data-time-hover-root": true },
        React.createElement(
          "div", { style: bubbleStyle, onClick: onBubbleClick, title: "点击编辑" },
          text || "（空消息）"
        ),
        confirming
          ? React.createElement(ConfirmCapsule, {
              text: afterCount === 0 ? "是否撤回这条消息？" : (onlyUser ? "撤回这条消息及其后 " + afterCount + " 条提问？" : "撤回这条消息及其后 " + afterCount + " 条内容？"),
              onConfirm: function () {
                setConfirming(false);
                // 惰性提交：此刻只记录 pending + 回填输入框，真正修改发生在「发送」时
                // 注意：anchorSeq 对窗口外历史消息会退化，必须用 node.data.seq（UserMessageNode 的真实事件 seq）
                var conflictMode = draftConflictMode();
                var visualMode = recallVisualMode();
                var realSeq = (data && typeof data.seq === "number") ? data.seq : anchorSeq;
                writePending(sessionId, {
                  type: "recall",
                  targetKey: myKey,
                  targetSeq: realSeq,
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
                log("info", "recall", "pending set（发送时执行真正撤回）", { sessionId: sessionId, targetSeq: realSeq, mode: conflictMode, visual: visualMode });
              },
              onCancel: function () { setConfirming(false); }
            })
          : React.createElement(
              "div", { style: actionsStyle },
              React.createElement("span", { className: "dbe-time", style: timeStyle }, formatClock(msgTime)),
              actionButton("撤回", "撤回", function (e) {
                e.stopPropagation();
                if (pending && pending.type === "recall") {
                  log("warn", "recall", "已有待处理撤回（单待定约束）");
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
      var id = "dsh-easyrewrite-theme";
      if (document.querySelector("style[data-plugin=\"" + id + "\"]") !== null) return null;
      var tag = document.createElement("style");
      tag.dataset.plugin = id;
      tag.textContent =
        "[data-dsh-easyrewrite] img{transition:filter .15s}" +
        "body[data-ds-dark-theme] [data-dsh-easyrewrite] img{filter:invert(1)}" +
        "@media (hover:hover){[data-dsh-easyrewrite][data-time-hover-root] .dbe-time{opacity:0;transition:opacity 80ms}" +
        "[data-dsh-easyrewrite][data-time-hover-root]:hover .dbe-time,[data-dsh-easyrewrite][data-time-hover-root]:focus-within .dbe-time{opacity:1}}" +
        "[data-dsh-easyrewrite=\"recall-bar\"] .dbe-recall-x:hover{background:var(--dsw-alias-interactive-bg-active,rgba(128,128,128,0.24));color:var(--dsw-alias-label-primary)}";
      document.head.appendChild(tag);
      return tag;
    }

    function apply(ctx) {
      ctx.effect(function () {
        var disposers = [];
        var styleTag = injectThemeStyle();
        log("info", "lifecycle", "client half active");
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
            id: "dsh-easyrewrite-recall-banner",
            order: -10,
            inject: function () {
              return {
                openSession: function (id) { ctx.sessions.open(id); },
                ctxWorkspaces: ctx.workspaces,
                ctxSessions: ctx.sessions
              };
            }
          }, RecallBanner);
        });
        if (typeof d3 === "function") disposers.push(d3);
        return function () {
          for (var i = 0; i < disposers.length; i++) disposers[i]();
          if (styleTag !== null) styleTag.remove();
          log("info", "lifecycle", "client half unloaded");
        };
      }, "dsh-easyrewrite: UserBubbleView overlay");
    }

    return { name: "dsh-easyrewrite", inject: ["slots", "sessions", "workspaces"], apply: apply };
  }
});
