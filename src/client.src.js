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
      try { if (localStorage.getItem("dsh-easyrewrite:debug") === "1") return true; } catch (e) { /* ignore */ }
      try { return /\?dsh-er-debug/.test(location.search || ""); } catch (e) { return false; }
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
    function setSetting(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* ignore */ } }
    function getBool(key, def) { return getSetting(key, def ? "1" : "0") !== "0"; }
    function setBool(key, v) { setSetting(key, v ? "1" : "0"); }
    function draftConflictMode() { return getSetting(SETTING_KEYS.conflictMode, "overwrite"); }
    function recallVisualMode() { return getSetting(SETTING_KEYS.visualMode, "simple"); }
    // 行为开关（设置页控制）
    function rewriteOnClick() { return getBool("dsh-easyrewrite:rewriteOnClick", true); }
    function editOffShowRecall() { return getBool("dsh-easyrewrite:editOffShowRecall", true); }
    function recallConfirmEnabled() { return getBool("dsh-easyrewrite:recallConfirm", true); }

    // ---------- 版本家族（< X > 翻页器）：派生自官方 parentId lineage（review #6 删 localStorage 自建树） ----------
    // 官方 fork：host 写 meta.parentSession，client upsert summary.parentSessionId；
    // 投影层 projectList 把它映射为 byId[].parentId（并带 origin 字段，origin==="subagent" 为子代理会话，排除）。
    // 归档会话仍在 sessions.list——家族关系天然持久，无需自建存储。
    function sessionLineageRoot(byId, id) {
      var cur = id, guard = 0;
      while (guard++ < 64) {
        var s = byId[cur];
        var p = s && s.parentId;
        if (p === void 0 || !byId[p]) return cur; // 父不在列表 → 当前即 root
        cur = p;
      }
      return cur;
    }
    /** 派生版本家族：{rootId, versions[](深度升序=fork 时间序，updatedAt 次序), index}；子代理排除。 */
    function familyOfSession(sessionId, ctxSessions) {
      try {
        if (!ctxSessions || !ctxSessions.list || typeof ctxSessions.list.getSnapshot !== "function") return null;
        var snap = ctxSessions.list.getSnapshot();
        if (!snap || !snap.byId || !snap.byId[sessionId]) return null;
        var ids = Array.isArray(snap.ids) ? snap.ids : [];
        // 深度表：parentId 链深度（root=0）——深度升序=旧 append/fork 序且稳定（updatedAt 是活动时间，root 续聊会漂移）
        var depth = {};
        for (var pass = 0; pass < 64; pass++) {
          var changed = false;
          for (var i = 0; i < ids.length; i++) {
            var id0 = ids[i];
            if (depth[id0] !== void 0) continue;
            var s0 = snap.byId[id0];
            if (!s0) continue;
            var p0 = s0.parentId;
            if (p0 === void 0 || !snap.byId[p0]) { depth[id0] = 0; changed = true; }
            else if (depth[p0] !== void 0) { depth[id0] = depth[p0] + 1; changed = true; }
          }
          if (!changed) break;
        }
        var root = sessionLineageRoot(snap.byId, sessionId);
        var versions = [];
        for (var j = 0; j < ids.length; j++) {
          var id = ids[j];
          var sj = snap.byId[id];
          if (sj && sj.origin === "subagent") continue; // 子代理会话不入家族
          if (sj && sj.blank) continue; // 旧树语义对齐：blank 顶替会话不入家族
          if (depth[id] === void 0) continue;
          var cur = id, g2 = 0, ok = false;
          while (g2++ < 64) {
            if (cur === root) { ok = true; break; }
            var s5 = snap.byId[cur];
            var pp = s5 && s5.parentId;
            if (pp === void 0 || !snap.byId[pp] || depth[pp] === void 0) break;
            cur = pp;
          }
          if (ok) versions.push(id);
        }
        if (versions.indexOf(sessionId) < 0) versions.unshift(sessionId);
        versions.sort(function (a, b) {
          var da = depth[a] !== void 0 ? depth[a] : 999;
          var db = depth[b] !== void 0 ? depth[b] : 999;
          if (da !== db) return da - db;
          var sa = snap.byId[a] || {}, sb = snap.byId[b] || {};
          var ta = sa.updatedAt || 0, tb = sb.updatedAt || 0;
          if (ta !== tb) return ta - tb;
          return a < b ? -1 : a > b ? 1 : 0;
        });
        var index = versions.indexOf(sessionId);
        return { rootId: root, versions: versions, index: index >= 0 ? index : 0 };
      } catch (e) { log("warn", "pager", "lineage 派生失败", { sessionId: sessionId, err: String(e && e.message ? e.message : e) }); return null; }
    }
    /** 全部家族（设置卡恢复入口）：按 root 去重，仅列 ≥2 版本的真家族。 */
    function listVersionFamilies(ctxSessions) {
      try {
        if (!ctxSessions || !ctxSessions.list) return [];
        var snap = ctxSessions.list.getSnapshot();
        if (!snap || !snap.byId) return [];
        var seen = {};
        var out = [];
        var ids = Array.isArray(snap.ids) ? snap.ids : [];
        for (var i = 0; i < ids.length; i++) {
          var root = sessionLineageRoot(snap.byId, ids[i]);
          if (seen[root]) continue;
          seen[root] = true;
          var fam = familyOfSession(ids[i], ctxSessions);
          if (fam && fam.versions.length >= 2) out.push(fam);
        }
        return out;
      } catch (e) { return []; }
    }
    
// ---------- 滚动锚定：已交还官方 chatScrollPositions（按会话原生保存/恢复滚动位，review #4 删自建轮子） ----------

    // ---------- 撤回快捷键（默认 Ctrl+Z；可录制；输入框未聚焦且最近一条为用户消息时生效） ----------
    var HOTKEY_KEY = "dsh-easyrewrite:hotkey";
    var HOTKEY_ENABLED_KEY = "dsh-easyrewrite:hotkeyEnabled";
    var hotkeyCaptureActive = false; // 录制期间屏蔽全局触发
    /** 总开关（默认关——与其他插件快捷键不打架；Beta 功能）。 */
    function hotkeyEnabledSetting() {
      return getBool(HOTKEY_ENABLED_KEY, false);
    }
    function setHotkeyEnabledSetting(v) {
      setBool(HOTKEY_ENABLED_KEY, v);
    }
    /** 当前键位：未设置时返回空串（无默认快捷键）。 */
    function hotkeySetting() {
      try {
        var v = localStorage.getItem(HOTKEY_KEY);
        if (v && /^((ctrl|meta|alt|shift)\+)+(key[a-z0-9]|digit[0-9]|f[0-9]{1,2}|arrow(left|right|up|down)|space|enter|escape|backspace|delete|tab|numpad[0-9]+)$/.test(v)) return v;
      } catch (e) { /* ignore */ }
      return "";
    }
    function setHotkeySetting(combo) {
      try { localStorage.setItem(HOTKEY_KEY, combo); } catch (e) { /* ignore */ }
    }
    /** 录制：把 keydown 事件转成组合键串（必须带修饰键；返回 null 表示无效）。 */
    function keydownCombo(e) {
      var parts = [];
      if (e.ctrlKey) parts.push("ctrl");
      if (e.metaKey) parts.push("meta");
      if (e.altKey) parts.push("alt");
      if (e.shiftKey) parts.push("shift");
      var code = String(e.code || "").toLowerCase();
      if (!code || code.indexOf("control") === 0 || code.indexOf("meta") === 0 || code.indexOf("alt") === 0 || code.indexOf("shift") === 0) return null;
      if (parts.length === 0) return null; // 必须至少一个修饰键
      parts.push(code);
      return parts.join("+");
    }
    /** 匹配：keydown 事件是否等于设置的组合键。 */
    function keydownMatches(e, combo) {
      if (!combo) return false;
      var parts = combo.split("+");
      var wantCtrl = parts.indexOf("ctrl") >= 0;
      var wantMeta = parts.indexOf("meta") >= 0;
      var wantAlt = parts.indexOf("alt") >= 0;
      var wantShift = parts.indexOf("shift") >= 0;
      if (String(e.code || "").toLowerCase() !== parts[parts.length - 1]) return false;
      if (!!e.ctrlKey !== wantCtrl) return false;
      if (!!e.metaKey !== wantMeta) return false;
      if (!!e.altKey !== wantAlt) return false;
      if (!!e.shiftKey !== wantShift) return false;
      return true;
    }
    /** 显示文本：ctrl+keyz → "Ctrl+Z"；meta+keyz → "⌘+Z"。 */
    function formatHotkey(combo) {
      if (!combo) return "";
      var parts = combo.split("+");
      var names = parts.slice(0, -1).map(function (p) {
        if (p === "ctrl") return "Ctrl";
        if (p === "meta") return "⌘";
        if (p === "alt") return "Alt";
        if (p === "shift") return "Shift";
        return p;
      });
      var code = parts[parts.length - 1] || "";
      var keyName = code;
      if (/^key[a-z]$/.test(code)) keyName = code.slice(3).toUpperCase();
      else if (/^digit[0-9]$/.test(code)) keyName = code.slice(5);
      else if (code === "arrowleft") keyName = "←";
      else if (code === "arrowright") keyName = "→";
      else if (code === "arrowup") keyName = "↑";
      else if (code === "arrowdown") keyName = "↓";
      else if (/^f([0-9]{1,2})$/.test(code)) keyName = code.toUpperCase();
      else if (/^numpad/.test(code)) keyName = code.slice(6);
      else if (code === "space") keyName = "Space";
      else if (code === "enter") keyName = "Enter";
      else if (code === "escape") keyName = "Esc";
      else if (code === "backspace") keyName = "Backspace";
      else if (code === "delete") keyName = "Del";
      else if (code === "tab") keyName = "Tab";
      else keyName = code.replace(/^key/, "").toUpperCase();
      return names.concat([keyName]).join("+");
    }

    // ---------- 编辑附件保留（M4 闭环）：历史图片附件 → 官方草稿附件 ----------
    // 流程：props.loadImage(ref) 取会话授权 URL → fetch → File → ctx.conversation.createDraftImages → inputActions.addImages
    async     function rebuildDraftAttachments(attachmentRefs, props, sessionId, recordPending) {
      var added = 0;
      if (!attachmentRefs || !Array.isArray(attachmentRefs) || attachmentRefs.length === 0) return added;
      try {
        var files = [];
        for (var i = 0; i < attachmentRefs.length; i++) {
          var ref = attachmentRefs[i];
          if (!ref || typeof ref.attachmentId !== "string") { log("warn", "attach", "附件引用缺 attachmentId", { i: i }); continue; }
          try {
            // 按需读官方缓存：resolveImage(旧会话 live 时) → URL → fetch blob → File（review #3 删除自建内存缓存层）
            var url = null;
            if (ctxConversationRef && typeof ctxConversationRef.resolveImage === "function") {
              url = await ctxConversationRef.resolveImage(sessionId, ref);
            } else if (typeof props.loadImage === "function") {
              url = await props.loadImage(ref);
            }
            if (!url) { log("warn", "attach", "resolveImage 返回空 URL", { attachmentId: ref.attachmentId }); continue; }
            var resp = await fetch(url);
            if (!resp.ok) { log("warn", "attach", "fetch 失败", { status: resp.status, url: String(url).slice(0, 80) }); continue; }
            var blob = await resp.blob();
            var name = typeof ref.name === "string" && ref.name ? ref.name : "attachment." + (ref.mediaType === "image/png" ? "png" : (ref.mediaType === "image/jpeg" || ref.mediaType === "image/jpg" ? "jpg" : "img"));
            // 写缓存，供后续重发复用
            files.push(new File([blob], name, { type: ref.mediaType || blob.type || "application/octet-stream" }));
            log("info", "attach", "已构造 File 并写缓存", { name: name, type: ref.mediaType || blob.type, size: blob.size });
          } catch (e) { log("warn", "attach", "重建单个附件失败", { attachmentId: ref.attachmentId, err: String(e && e.message ? e.message : e) }); }
        }
        if (files.length > 0 && ctxConversationRef && typeof ctxConversationRef.createDraftImages === "function" && typeof props.inputActions !== "undefined" && typeof props.inputActions.addImages === "function") {
          try {
            var images = ctxConversationRef.createDraftImages(files);
            if (images && images.length > 0) {
              var ids = images.map(function (img) { return img.id; });
              var addOk = props.inputActions.addImages(ids);
              if (recordPending) { for (var pi = 0; pi < ids.length; pi++) pendingAttachIds.push(ids[pi]); }
              log("info", "attach", "createDraftImages+addImages 成功", { count: images.length, addOk: addOk });
              added = images.length;
            } else {
              log("warn", "attach", "createDraftImages 返回空数组", { filesLen: files.length });
            }
          } catch (e2) {
            log("error", "attach", "createDraftImages 抛错（MIME 校验等）", { filesLen: files.length, err: String(e2 && e2.message ? e2.message : e2), types: files.map(function (f) { return f.type; }) });
          }
        } else {
          if (files.length === 0) log("warn", "attach", "无可重建文件（缓存未命中+resolveImage/fetch 均失败）", { refsLen: attachmentRefs.length });
          else log("warn", "attach", "缺 createDraftImages 或 addImages 能力", { hasCCI: !!(ctxConversationRef && typeof ctxConversationRef.createDraftImages === "function"), hasAdd: !!(props.inputActions && typeof props.inputActions.addImages === "function") });
        }
      } catch (e) { log("error", "attach", "rebuildDraftAttachments 外层异常", { err: String(e && e.message ? e.message : e) }); }
      return added;
    }
    // ---------- 图片桥接（review #3）：跨会话传递交官方全局 draftAttachments 单例，只记 imageIds ----------
    var pendingAttachIds = []; // 撤回确认时重建到输入框的图 id（× 取消时需移除）
    var latestInputImageIds = []; // 输入框当前图 id 镜像（UserBubbleView 渲染时喂入；发送时据此搬运）
        var ctxConversationRef = null; // apply 时注入 conversation 服务

    // ---------- 语义化版本比较（1.2.4 < 1.3.0；缺失段视为 0） ----------
    function versionGt(a, b) {
      var pa = String(a || "0").split(".").map(function (x) { return parseInt(x, 10) || 0; });
      var pb = String(b || "0").split(".").map(function (x) { return parseInt(x, 10) || 0; });
      var len = Math.max(pa.length, pb.length);
      for (var vi = 0; vi < len; vi++) {
        var av = pa[vi] || 0;
        var bv = pb[vi] || 0;
        if (av > bv) return true;
        if (av < bv) return false;
      }
      return false;
    }

    // ---------- pending store（按会话；内存缓存 + localStorage 持久化 + 订阅） ----------
    var PENDING_PREFIX = "dsh-easyrewrite:pending:";
    var pendingCache = {};
    var pendingListeners = [];
    // review M9：跨标签页同步——另一标签页写入/清除 pending 时刷新本地缓存并通知订阅者
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("storage", function (e) {
        try {
          if (!e.key || e.key.indexOf(PENDING_PREFIX) !== 0) return;
          pendingCache[e.key.slice(PENDING_PREFIX.length)] = null; // 强制重读
          for (var li = 0; li < pendingListeners.length; li++) {
            try { pendingListeners[li](); } catch (err) { /* ignore */ }
          }
        } catch (err) { /* ignore */ }
      });
    }
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
        if (p === null) {
          localStorage.removeItem(PENDING_PREFIX + sessionId);
          // 处理完成（发送/取消/编辑确定）→ 删除自动备份（无感）
          try {
            fetch("/bubble/backup/delete", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId: sessionId }),
              keepalive: true
            }).catch(function () { /* 静默 */ });
          } catch (e) { /* 静默 */ }
        } else {
          localStorage.setItem(PENDING_PREFIX + sessionId, JSON.stringify(p));
        }
      } catch (e) { /* 静默 */ }
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
      var L = useUILocaleDict();
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
        bar.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin:0 16px;padding:2px 6px 6px;";
        var label = document.createElement("span");
        // 标签药丸只包裹文字（内容宽度）；透明 spacer 撑开剩余空间把 × 推到最右
        label.style.cssText = "font-size:15.4px;color:var(--dsw-alias-label-secondary);line-height:24.2px;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,0.12));border-radius:999px;padding:1.1px 13.2px;";
        var spacer = document.createElement("div");
        spacer.style.cssText = "flex:1;";
        label.textContent = L.modifying;
        var xBtn = document.createElement("button");
        xBtn.type = "button";
        xBtn.title = L.cancelRecall;
        xBtn.setAttribute("aria-label", L.cancelRecall);
        xBtn.className = "dbe-recall-x";
        xBtn.style.cssText = "border:none;cursor:pointer;transform:translateY(-1px);width:26.4px;height:26.4px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary);font-size:19.8px;line-height:19.8px;padding:0;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,0.12));";
        xBtn.textContent = "×";
        xBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          var ia = props.inputActions;
          if (ia && typeof ia.setDraft === "function" && typeof pending.originalDraft === "string") {
            ia.setDraft(pending.originalDraft); // 恢复输入框原草稿（覆盖/合并统一恢复）
          }
          // 取消撤回：目标终态=仅保留用户确认前已有的图（preUserImageIds）；移除其余（重建的消息图等）
          try {
            var keepSet = {};
            var keepArr = Array.isArray(pending.preUserImageIds) ? pending.preUserImageIds : [];
            for (var kk = 0; kk < keepArr.length; kk++) keepSet[keepArr[kk]] = true;
            var curX = [];
            var sX = typeof props.useInput === "function" ? props.useInput(function (q) { return q; }) : null;
            if (sX && Array.isArray(sX.imageIds)) curX = sX.imageIds.slice();
            var removedAny = false;
            if (ia && typeof ia.removeImage === "function") {
              for (var ci = 0; ci < curX.length; ci++) {
                if (keepSet[curX[ci]]) continue;
                try { ia.removeImage(curX[ci]); removedAny = true; } catch (e3) { /* ignore */ }
              }
            }
            // 兜底：removeImage 不可用/无效 → pruneImages 只留应保留的
            if (!removedAny && curX.length > 0 && ia && typeof ia.pruneImages === "function") {
              try { ia.pruneImages(keepArr); } catch (e4) { /* ignore */ }
            }
            log("info", "recall", "× 清理完成", { before: curX.length, keep: keepArr.length });
          } catch (e2) { /* ignore */ }
          pendingAttachIds = [];
          writePending(sessionId, null);
          log("info", "recall", "pending cancelled（恢复原草稿+清除重建图片）");
        });
        bar.appendChild(label);
        bar.appendChild(spacer);
        bar.appendChild(xBtn);
        // 插入到最顶部：优先 composer card 的第一个子节点之前（官方 attachments 附件区上方）
        var cardEl = null;
        try { cardEl = document.querySelector('[data-composer-card="true"]') || null; } catch (e) { /* ignore */ }
        function placeBar() {
          try {
            var cEl = document.querySelector('[data-composer-card="true"]') || null;
            if (!cEl || !cEl.parentNode) return;
            // 统一外挂：card 之前（独立于对话框正上方），宽度动态=card 实际宽度 → 左右缘与输入卡片严格对齐
            // 样式统一用带图形态（无分界线）——不再按 hasImages 动态切换挂载点与边框
            if (bar.parentNode !== cEl.parentNode) cEl.parentNode.insertBefore(bar, cEl);
            var cr = cEl.getBoundingClientRect();
            bar.style.width = cr.width + "px";
            bar.style.boxSizing = "border-box";
          } catch (e) { /* ignore */ }
        }
        placeBar();
        // MutationObserver：官方重渲染 composer（如点击图片删除键）挤掉 bar 后自动复位，× 一直可用
        var mo = null;
        try {
          mo = new MutationObserver(function () { try { placeBar(); } catch (e) { /* ignore */ } });
          var obCard = cardEl || (document.querySelector('[data-composer-card="true"]') || null);
          if (obCard) mo.observe(obCard, { childList: true, subtree: true });
        } catch (e) { /* ignore */ }
        return function () {
          try { if (mo) mo.disconnect(); } catch (e) { /* ignore */ }
        var onWinResize = function () { try { placeBar(); } catch (e) { /* ignore */ } };
        window.addEventListener("resize", onWinResize);
          try { window.removeEventListener("resize", onWinResize); } catch (e4) { /* ignore */ } if (bar.parentNode) bar.parentNode.removeChild(bar);
        };
      }, [active, sessionId, pending]);

      // ---- 异常退出恢复：本地无 pending（缓存丢了/跨浏览器）且存在文件备份时，恢复草稿 ----
      // （正常路径：发送/× 时备份已删除，恢复永远不会覆盖用户当前状态）
      var backupRecovered = React.useRef({});
      React.useEffect(function () {
        if (backupRecovered.current[sessionId]) return;
        var local = readPending(sessionId);
        if (local) return; // 有网页缓存（localStorage）→ 用缓存，不查文件
        backupRecovered.current[sessionId] = true;
        try {
          fetch("/bubble/backup/read", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId: sessionId }),
            keepalive: true
          }).then(function (resp) { return resp.json(); }).then(function (data) {
            if (data && data.ok && data.pending) {
              // review M7：备份新鲜度校验——超过 24h 的备份视为陈旧（可能已被取消但删除未落地），不恢复
              var age = Date.now() - (typeof data.pending.updatedAt === "number" ? data.pending.updatedAt : 0);
              if (age > 24 * 3600 * 1000) {
                log("warn", "backup", "备份陈旧（>24h），跳过恢复", { sessionId: sessionId, ageMs: age });
                return;
              }
              writePending(sessionId, data.pending);
              if (data.pending.type === "recall" && props.inputActions && typeof props.inputActions.setDraft === "function") {
                props.inputActions.setDraft(data.pending.draftText); // 回填输入框
              }
              log("info", "backup", "异常退出恢复：从文件备份恢复草稿", { sessionId: sessionId, type: data.pending.type });
            }
          }).catch(function () { /* 静默 */ });
        } catch (e) { /* 静默 */ }
      }, [sessionId]);

      // ---- 草稿自动备份（无感）：pending 存在且超过 10s 后，每 5s 覆盖备份一次 ----
      React.useEffect(function () {
        if (!active || !pending) return;
        var lastBackup = 0;
        function backupNow() {
          try {
            fetch("/bubble/backup", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId: sessionId, pending: pending }),
              keepalive: true
            }).then(function (resp) {
              log("info", "backup", "自动备份完成", { sessionId: sessionId, status: resp.status });
            }).catch(function (e) {
              log("warn", "backup", "自动备份请求失败", { err: String(e && e.message ? e.message : e) });
            });
            lastBackup = Date.now();
          } catch (e) { /* 静默 */ }
        }
        var timer = setInterval(function () {
          var age = Date.now() - (pending.updatedAt || 0);
          // 第 10s 备份第一次（lastBackup=0 时条件自动成立），之后每 5s 覆盖备份一次
          if (age >= 10000 && Date.now() - lastBackup >= 5000) backupNow();
        }, 1000);
        return function () { clearInterval(timer); };
      }, [active, pending, sessionId]);

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
      // review M1：停止生成按钮（运行中主按钮文案切换）——不得劫持
      function isStopButton(btn) {
        if (!btn) return false;
        var al = (btn.getAttribute("aria-label") || "").toLowerCase();
        return al.indexOf("停止") !== -1 || al.indexOf("stop") !== -1;
      }
      // 撤回发送失败的可见提示：输入滚动区上方插入临时错误条（3.5s 自动移除）
      function showRecallError(text) {
        try {
          var scrollEl = document.querySelector("[data-input-scroll]");
          if (!scrollEl || !scrollEl.parentNode) return;
          var bar = document.createElement("div");
          bar.setAttribute("data-dsh-easyrewrite", "recall-error");
          bar.textContent = text;
          bar.style.cssText = "margin:0 16px;padding:4px 10px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error,#d9534f);background:var(--dsw-alias-bg-l2,rgba(128,128,128,0.08));border-radius:8px;";
          scrollEl.parentNode.insertBefore(bar, scrollEl);
          setTimeout(function () { try { if (bar.parentNode) bar.parentNode.removeChild(bar); } catch (e) { /* ignore */ } }, 3500);
        } catch (e) { /* ignore */ }
      }
      // review #7：client 直算撤回边界——倒序扫 targetSeq 之前最近的闭合 turn-tail，
      // atSeq = closing.finalNode.seq（与官方 fork(atSeq) 的 find(turn/end && seq>=atSeq) 恰好对齐）。
      // 判定树：命中 → {atSeq}；窗口内无且 hasMore=false → 真首条 {code:"no-boundary"}；
      // 窗口内无但 hasMore=true → 快照窗口外，{code:"host-fallback"} 走保留的 host 路由。
      function computeRecallBoundary(props, targetSeq) {
        try {
          if (typeof props.useSession !== "function") return null; // 无法本地判定 → host fallback
          var snapshot = props.useSession(function (s) { return s; });
          if (!snapshot || !snapshot.chat || !Array.isArray(snapshot.chat.order) || !snapshot.chat.nodes || typeof snapshot.chat.nodes.get !== "function") return null;
          var order = snapshot.chat.order;
          var tIdx = -1;
          for (var i = 0; i < order.length; i++) {
            var nd = snapshot.chat.nodes.get(order[i]);
            if (!nd || nd.kind !== "user") continue;
            var sq = nd.data && typeof nd.data.seq === "number" ? nd.data.seq : (typeof nd.anchorSeq === "number" ? nd.anchorSeq : -1);
            if (sq === targetSeq) { tIdx = i; break; }
          }
          if (tIdx === -1) return null; // 目标不在快照 → host fallback
          for (var k = tIdx - 1; k >= 0; k--) {
            var n2 = snapshot.chat.nodes.get(order[k]);
            if (!n2 || n2.kind !== "turn-tail") continue;
            var cl = n2.data && n2.data.closing;
            if (cl && cl.finalNode && typeof cl.finalNode.seq === "number") return { atSeq: cl.finalNode.seq };
            // closing 缺失（纯工具/无文本回合）→ 回退尾节点自身 seq（官方槽位同款 closing?.finalNode.seq ?? data.seq），
            // 跳过会把边界推得更早、整段误切
            if (n2.data && typeof n2.data.seq === "number") return { atSeq: n2.data.seq };
          }
          var hasMore = snapshot.chat.hasMore === true;
          return hasMore ? { code: "host-fallback" } : { code: "no-boundary" };
        } catch (e) {
          log("warn", "recall", "本地边界计算异常", { err: String(e && e.message ? e.message : e) });
          return null;
        }
      }

      var recallInFlight = false; // review M2：in-flight 锁，防 Enter/按钮并发重复 fork
      async function doRecallThenSend(p) {
        if (recallInFlight) return;
        recallInFlight = true;
        try {
          var sid = props.sessionId;
          // 读取输入框当前文本（用户可能已修改）：重置/重发都使用修改后的内容
          var sendText = p.draftText;
          try {
            var ta = document.querySelector("[data-input-scroll] textarea");
            if (ta && typeof ta.value === "string" && ta.value !== "") sendText = ta.value;
          } catch (e) { /* ignore */ }
          // 极限场景：首条消息（含截断会话首条）无前置边界 → 重置对话（不 fork），输入框内容带到新起点自动发送
          log("info", "reset", "首条判定命中 → 走 resetConversation", { targetKey: p.targetKey });
          if (isFirstUserMessage(props, p.targetKey)) {
            recallInFlight = false;
            resetConversation(sid, "edit", sendText, props);
            return;
          }
          // review L5：日志去内容化（只记长度，不落明文）
          log("info", "recall", "发送内容（修改后）", { sendLen: sendText.length });
          // review #7：client 直算边界（判定树），仅在快照无法判定时走保留的 host 路由 fallback
          var localB = computeRecallBoundary(props, p.targetSeq);
          var boundary = null;
          if (localB && localB.atSeq) {
            boundary = localB.atSeq;
            log("info", "recall", "本地边界就绪", { targetSeq: p.targetSeq, atSeq: boundary });
          } else if (localB && localB.code === "no-boundary") {
            // 真首条（窗口内无闭合回合且无更早历史）→ 重置对话
            log("info", "recall", "本地判定：无前置边界 → 重置对话");
            showRecallError(L.resetNotice);
            resetConversation(sid, "edit", sendText, props);
            return;
          } else {
            // host fallback（localB=null 或 host-fallback）
            log("info", "recall", "本地不可判定，走 host 路由", { mode: localB && localB.code });
            var resp = await fetch("/bubble/recall", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId: sid, targetSeq: p.targetSeq })
            });
            var data = await resp.json();
            if (!data || !data.ok) {
              var errCode = (data && data.error) || "unknown";
              log("warn", "recall", "撤回失败（发送中止）", { error: errCode });
              if (errCode === "turn-open" || errCode === "no-boundary") {
                showRecallError(L.resetNotice);
                resetConversation(sid, "edit", sendText, props);
              } else {
                showRecallError(L.errGeneric);
              }
              return;
            }
            boundary = data.boundary;
          }
          // 0) 撤回前收集（review #2/#3）：读镜像——UserBubbleView 渲染时已从官方 useInput 快照同步，
          //    覆盖确认时重建的图 + 用户手动加的图 − 用户删除的图（即发送瞬间的真实选择）。
          var imgIds = latestInputImageIds.slice();
          log("info", "attach", "撤回收集完成（镜像 imageIds）", { count: imgIds.length });
          // 1) 官方 client fork：child 进入会话列表（可打开）+ 继承原标题。
          //    官方 fork(atSeq) 即截断边界器；fork-unavailable 按原文子串分流：
    //    "has not completed the turn"=回合未结束→提示等待；"has no completed turn to fork from"=无前置边界→重置对话。
          var newId = null;
          try {
            newId = await props.ctxSessions.fork({ sessionId: sid, atSeq: boundary });
          } catch (e) {
            var em = String(e && e.message ? e.message : e);
            log("error", "recall", "fork 失败（发送中止）", { err: em });
            if (/has not completed the turn/i.test(em)) {
              showRecallError(L.turnOpenNotice || L.errGeneric); // 回合未结束：等待回复完成
            } else if (/has no completed turn to fork from/i.test(em)) {
              showRecallError(L.resetNotice);
              resetConversation(sid, "edit", sendText, props);
            } else {
              showRecallError(L.errGeneric);
            }
            return;
          }
          writePending(sid, null);
          // review M6：resume-send 带时间戳（30s TTL，防陈旧草稿幽灵自动发送）
          try { localStorage.setItem("dsh-easyrewrite:resume-send:" + newId, JSON.stringify({ draftText: sendText, t: Date.now(), imageIds: imgIds })); } catch (e) { /* ignore */ }
          // 2) 无痕替换：归档原会话 → 打开新会话
          var archived = false;
          try {
            if (typeof props.ctxWorkspaces !== "undefined" && typeof props.ctxWorkspaces.archiveSession === "function") {
              // review M8：await + catch，避免 unhandled rejection
              await Promise.resolve(props.ctxWorkspaces.archiveSession(sid)).catch(function () { /* ignore */ });
              archived = true;
            }
          } catch (e) { log("warn", "recall", "归档原会话失败", { err: String(e && e.message ? e.message : e) }); }
          log("info", "recall", "撤回完成：归档原会话 + 打开新会话", { newId: newId, archived: archived });
          if (typeof props.openSession === "function") props.openSession(newId);
        } catch (err) {
          log("error", "recall", "撤回请求失败（发送中止）", { err: String(err && err.message ? err.message : err) });
        } finally {
          recallInFlight = false;
        }
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
          if (isStopButton(btn)) return; // review M1：停止生成照常放行，不劫持
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
        // review M6：TTL 30 秒——过期（延迟打开/陈旧）不自动发送
        if (!r || typeof r.draftText !== "string") return;
        if (typeof r.t === "number" && Date.now() - r.t > 30000) { log("warn", "recall", "resume 过期（30s TTL），不自动发送", { sessionId: sessionId }); return; }
        var ia = props.inputActions;
        if (ia && typeof ia.setDraft === "function" && typeof ia.submit === "function") {
          ia.setDraft(r.draftText);
          log("info", "recall", "resume：回填草稿并自动发送", { sessionId: sessionId });
          var doSubmit = function () { setTimeout(function () { try { ia.submit(); } catch (e) { log("error", "recall", "自动发送失败（resume）", { err: String(e && e.message ? e.message : e) }); } }, 60); };
          // 图片桥接（review #3 简化版）：官方 draftAttachments 全局单例跨会话存活——
          // resume 直接 addImages(发送瞬间的 imageIds) 后 submit；消息内容完全由我们构造，无需校验。
          var savedIds = Array.isArray(r.imageIds) ? r.imageIds : [];
          if (savedIds.length > 0 && typeof ia.addImages === "function") {
            try { ia.addImages(savedIds); } catch (e) { log("warn", "attach", "addImages 异常（忽略，文字照发）", { err: String(e && e.message ? e.message : e) }); }
          }
          doSubmit();
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

    // 官方同款 contentParts：把消息 content 拆为 {text, images, rest}（图片附件用于渲染缩略图）
    function contentParts(content) {
      var texts = [];
      var images = [];
      var rest = [];
      if (Array.isArray(content)) {
        for (var i = 0; i < content.length; i++) {
          var b = content[i];
          if (b && b.type === "text" && typeof b.text === "string") texts.push(b.text);
          else if (b && b.type === "image" && b.attachment !== void 0) images.push({ attachment: b.attachment });
          else rest.push(b);
        }
      }
      return { text: texts.join(""), images: images, rest: rest };
    }

    // 渲染消息图片缩略图：直调官方 renderMessageImages（官方 ImageGallery：大图/宫格/lightbox/重试）。
    // 方法论 review #1：chat.node 注入必带该 prop，自绘 <img> 兜底属重复造轮子——已删；失败 warn 不静默。
    function renderMessageImagesCompat(images, props) {
      if (!images || images.length === 0) return null;
      if (!props || typeof props.renderMessageImages !== "function") {
        log("warn", "attach", "renderMessageImages prop 缺失（官方注入面变化？），图片无法渲染");
        return null;
      }
      try { return props.renderMessageImages({ images: images, align: "end" }); }
      catch (e) { log("warn", "attach", "官方图片渲染抛错", { err: String(e && e.message ? e.message : e) }); return null; }
    }

    function iconImg(src, alt, size) {
      var s = size || 18;
      return React.createElement("img", {
        src: src,
        alt: alt,
        width: s,
        height: s,
        className: "dbe-icon-img",
        style: { display: "block" }
      });
    }

    function actionButton(title, ariaLabel, onClick, children, dataAttr) {
      var bs = 34;
      return React.createElement("button", {
        type: "button",
        title: title,
        "aria-label": ariaLabel,
        "data-dsh-easyrewrite": dataAttr || undefined,
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
     *  - 紧凑 bubble：从气泡原宽起步（不主动改变气泡大小），随打字横向扩展，**上限 360px**（还原真实气泡）
     *  - 标准 wrap：固定 360px（所见即所得，与紧凑同上限）
     *  - 扩展 composer：固定 748px 顶到头（等同输入框区域）
     * 字符宽度估算：最长行字符数 × 8px（中文 14 / 英文 7 的折中）+ padding 28。
     */
    /**
     * 编辑框宽度（V2.0.1 规格）：
     * - 内容宽度估算：全角/CJK 字符 ≈14px、半角 ≈8px（font-size 14px），行取最宽。
     * - 紧凑 compact：严格以气泡原宽（initW）起步，不改变当前大小；随打字按内容需要慢慢扩大，上限 360px。
     * - 标准 standard：与紧凑唯一区别——内容不满一行时自动扩成一行宽（360px）。
     * - 两档超过一行后都保持宽度不再主动扩张（高度自然换行增长）。
     */
    function editWidthFor(mode, text, initW) {
      if (mode === "extended") return 748;              // 扩展：顶满
      if (mode === "custom") return editWidthCustom();  // 自定义
      var linesArr = String(text || "").split("\n");
      var contentW = 0;
      for (var i = 0; i < linesArr.length; i++) {
        var s = linesArr[i];
        var w = 28; // 左右内边距
        for (var c = 0; c < s.length; c++) w += s.charCodeAt(c) > 0x2e7f ? 14 : 8;
        if (w > contentW) contentW = w;
      }
      contentW = Math.min(contentW, 360);               // 气泡上限 360px
      if (mode === "compact") {
        var base = Math.max(initW || 200, 44);          // 紧凑：严格气泡原宽起步（保底防 0）
        return Math.max(base, contentW);                // 随打字慢慢扩大，绝不跳变
      }
      return Math.max(360, contentW);                   // 标准：不满一行自动扩成一行宽
    }
    /** 编辑宽度档位：compact 紧凑 / standard 标准 / extended 扩展 / custom 自定义。兼容旧值（bubble/wrap/composer）。 */
    function editWidthMode() {
      var v = "standard";
      try { v = localStorage.getItem("dsh-easyrewrite:editWidth") || "standard"; } catch (e) { /* ignore */ }
      if (v === "bubble") return "compact";
      if (v === "wrap") return "standard";
      if (v === "composer") return "extended";
      return v;
    }
    function editWidthCustom() {
      try { var n = parseInt(localStorage.getItem("dsh-easyrewrite:editWidthCustom") || "", 10); return isFinite(n) && n > 100 && n <= 1200 ? n : 360; } catch (e) { return 360; }
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

    // ---------- 设置卡片（设置 → 插件 → 插件配置；中英日三语） ----------
    var SETTINGS_I18N = {
      zh: {
        title: "EasyRewrite",
        subtitle: "简单易用的撤回重编辑",
        expand: "展开",
        collapse: "收起",
        rewrite: "气泡框编辑（点击气泡原位修改）",
        editOffShowRecall: "关闭气泡框编辑时显示撤回键",
        lockedHint: "需先关闭「气泡框编辑」才可修改此选项",
        attachWarning: "此消息含无法保留的内容（非图片附件），编辑重发后可能丢失",
        recallConfirm: "撤回确认胶囊",
        hotkey: "撤回快捷键",
        hotkeyEnable: "撤回快捷键（Beta）",
        hotkeyNone: "未设置",
        hotkeyHint: "输入框未聚焦且最近一条为用户消息时生效",
        hotkeyRecord: "录制",
        hotkeyRecording: "按下新组合键…（Esc 取消）",
        hotkeyInvalid: "至少需要一个修饰键（Ctrl/⌘/Alt/Shift）",
        visualMode: "撤回视觉模式",
        visualMinimal: "极简（无痕隐藏）",
        visualSimple: "简单（灰字+隐藏后续）",
        visualInfo: "信息（灰字+保留后续）",
        statOnlyUser: "撤回提示统计仅包含用户提问语句",
        conflictMode: "回填冲突模式",
        conflictOverwriteShort: "覆盖",
        conflictMergeShort: "合并",
        conflictOverwrite: "覆盖（原草稿发送/取消后恢复）",
        conflictMerge: "合并（追加到原草稿后）",
        editWidth: "气泡框编辑宽度",
        wCompact: "紧凑",
        wStandard: "标准",
        wExtended: "扩展",
        wCustom: "自定义",
        customWidth: "自定义宽度 (px)",
        placeholderCustom: "如 480",
        instant: "设置即时生效，无需重启",
        pagerTitle: "版本切换（撤回/编辑重发）",
        pagerPrev: "上一个版本",
        pagerNext: "下一个版本",
        modifying: "正在修改",
        confirm: "确定",
        cancel: "取消",
        copied: "已复制",
        copy: "复制",
        viewOriginal: "查看原文",
        emptyMsg: "（空消息）",
        greyText: "正在修改此处文本（点击查看原文）",
        clickEdit: "点击编辑",
        recallText0: "是否撤回这条消息？",
        recallTextQ: "撤回这条消息及其后 {n} 条提问？",
        recallTextC: "撤回这条消息及其后 {n} 条内容？",
        cancelRecall: "取消撤回",
        errNoBoundary: "该消息之前没有可截断的闭合回合边界（截断/首条消息无法撤回或编辑）",
        errTurnOpen: "该消息所在回合尚未结束，请等待回复完成后再操作",
        errGeneric: "操作失败，请重试",
        resetNotice: "对话处于半截状态，已重置——正在回到上一次模型回复处（或空白新对话）",
        turnOpenNotice: "回复仍在生成中，请等待回复完成后再撤回。",
        sectionUpdate: "更新",
        currentVersion: "当前版本",
        checkUpdate: "检查更新",
        checking: "检查中…",
        upToDate: "已是最新版本",
        newVersion: "发现新版本 v{ver}",
        updateNow: "更新",
        updating: "更新中…",
        updateDone: "更新完成——重启 dsh web 后生效",
        updateFailed: "更新失败，请稍后重试",
        autoCheckUpdate: "每日检查更新（发现新版本时提示）",
        updateAvailable: "有新版本",
        sectionEdit: "编辑",
        sectionRecall: "撤回",
        sectionComposer: "回填",
        sectionVersions: "版本",
        versionFamilies: "版本家族（撤回/编辑重发）",
        versionHistory: "版本历史（点击展开可手动恢复历史版本）",
        versionFamilyNone: "暂无版本家族",
        versionRestoreOpen: "恢复并打开",
        versionCount: "个版本"
      },
      en: {
        title: "EasyRewrite",
        subtitle: "Simple & easy recall and re-edit",
        expand: "Expand",
        collapse: "Collapse",
        rewrite: "Bubble edit (click bubble to edit in place)",
        editOffShowRecall: "Show recall key when bubble edit is off",
        lockedHint: "Turn off \"Bubble edit\" first to change this",
        attachWarning: "This message has content that cannot be preserved (non-image attachments); it may be lost after editing",
        recallConfirm: "Recall confirmation capsule",
        hotkey: "Recall hotkey",
        hotkeyEnable: "Recall hotkey (Beta)",
        hotkeyNone: "Not set",
        hotkeyHint: "Works when the input is unfocused and the latest message is yours",
        hotkeyRecord: "Record",
        hotkeyRecording: "Press a new combination… (Esc to cancel)",
        hotkeyInvalid: "Needs at least one modifier (Ctrl/⌘/Alt/Shift)",
        visualMode: "Recall visual mode",
        visualMinimal: "Minimal (hide all)",
        visualSimple: "Simple (grey text + hide rest)",
        visualInfo: "Info (grey text + keep rest)",
        statOnlyUser: "Recall count: user questions only",
        conflictMode: "Composer fill mode",
        conflictOverwriteShort: "Overwrite",
        conflictMergeShort: "Merge",
        conflictOverwrite: "Overwrite (original draft restored after send/cancel)",
        conflictMerge: "Merge (append after original draft)",
        editWidth: "Bubble edit width",
        wCompact: "Compact",
        wStandard: "Standard",
        wExtended: "Expanded",
        wCustom: "Custom",
        customWidth: "Custom width (px)",
        placeholderCustom: "e.g. 480",
        instant: "Settings apply instantly, no restart needed",
        pagerTitle: "Version pager (recall/edit resends)",
        pagerPrev: "Previous version",
        pagerNext: "Next version",
        modifying: "Modifying",
        confirm: "Confirm",
        cancel: "Cancel",
        copied: "Copied",
        copy: "Copy",
        viewOriginal: "View original",
        emptyMsg: "(empty)",
        greyText: "Modifying this message (click to view original)",
        clickEdit: "Click to edit",
        recallText0: "Recall this message?",
        recallTextQ: "Recall this message and {n} following questions?",
        recallTextC: "Recall this message and {n} following items?",
        cancelRecall: "Cancel recall",
        errNoBoundary: "No truncation boundary before this message (first/truncated message cannot be recalled or edited)",
        errTurnOpen: "This message's turn is still running; wait for the reply to finish",
        errGeneric: "Operation failed, please retry",
        resetNotice: "The conversation was in a truncated state and has been reset — returning to the last model reply (or a blank conversation)",
        turnOpenNotice: "A reply is still being generated. Please wait for it to finish before recalling.",
        sectionUpdate: "Update",
        currentVersion: "Current version",
        checkUpdate: "Check for updates",
        checking: "Checking…",
        upToDate: "You are on the latest version",
        newVersion: "New version v{ver} available",
        updateNow: "Update",
        updating: "Updating…",
        updateDone: "Update complete — restart dsh web to apply",
        updateFailed: "Update failed, please retry later",
        autoCheckUpdate: "Check for updates daily (notify when a new version is found)",
        updateAvailable: "New version",
        sectionEdit: "Editing",
        sectionRecall: "Recall",
        sectionComposer: "Composer fill",
        sectionVersions: "Versions",
        versionFamilies: "Version families (recall/edit resends)",
        versionHistory: "Version history (click to expand and restore past versions)",
        versionFamilyNone: "None yet",
        versionRestoreOpen: "Restore & open",
        versionCount: "versions"
      },
      ja: {
        title: "EasyRewrite",
        subtitle: "簡単で使いやすい撤回・再編集",
        expand: "展開",
        collapse: "折りたたむ",
        rewrite: "バブル編集（クリックでその場編集）",
        editOffShowRecall: "バブル編集オフ時に撤回キーを表示",
        lockedHint: "先に「バブル編集」をオフにしてください",
        attachWarning: "このメッセージには保持できない内容（画像以外の添付）があります。編集後の再送で失われる可能性があります",
        recallConfirm: "撤回確認カプセル",
        hotkey: "撤回ショートカット",
        hotkeyEnable: "撤回ショートカット（Beta）",
        hotkeyNone: "未設定",
        hotkeyHint: "入力欄が非フォーカスかつ直近のメッセージがユーザー時のみ有効",
        hotkeyRecord: "録音",
        hotkeyRecording: "新しいキーを押してください…（Esc でキャンセル）",
        hotkeyInvalid: "修飾キー（Ctrl/⌘/Alt/Shift）が最低 1 つ必要です",
        visualMode: "撤回表示モード",
        visualMinimal: "ミニマル（完全非表示）",
        visualSimple: "シンプル（グレー文字+以降を非表示）",
        visualInfo: "インフォ（グレー文字+以降を表示）",
        statOnlyUser: "撤回件数：ユーザー質問のみ",
        conflictMode: "入力欄への反映モード",
        conflictOverwriteShort: "上書き",
        conflictMergeShort: "結合",
        conflictOverwrite: "上書き（送信/キャンセル後に元の下書きを復元）",
        conflictMerge: "結合（元の下書きに追記）",
        editWidth: "バブル編集の幅",
        wCompact: "コンパクト",
        wStandard: "スタンダード",
        wExtended: "エクステンド",
        wCustom: "カスタム",
        customWidth: "カスタム幅 (px)",
        placeholderCustom: "例: 480",
        instant: "設定は即時反映、再起動不要",
        pagerTitle: "バージョン切替（撤回/編集再送）",
        pagerPrev: "前のバージョン",
        pagerNext: "次のバージョン",
        modifying: "変更中",
        confirm: "確定",
        cancel: "キャンセル",
        copied: "コピー済み",
        copy: "コピー",
        viewOriginal: "原文を表示",
        emptyMsg: "（空メッセージ）",
        greyText: "このメッセージを変更中（クリックで原文を表示）",
        clickEdit: "クリックして編集",
        recallText0: "このメッセージを撤回しますか？",
        recallTextQ: "このメッセージと後続 {n} 件の質問を撤回しますか？",
        recallTextC: "このメッセージと後続 {n} 件を撤回しますか？",
        cancelRecall: "撤回をキャンセル",
        errNoBoundary: "このメッセージの前に切り詰め境界がありません（切り詰め後・最初のメッセージは撤回/編集できません）",
        errTurnOpen: "このメッセージのターンはまだ終了していません。返信完了後にお試しください",
        errGeneric: "操作に失敗しました。もう一度お試しください",
        resetNotice: "会話が途中で切れた状態のためリセットしました——最後のモデル返信（または空白の会話）に戻ります",
        turnOpenNotice: "返信がまだ生成中です。返信が完了してから取り消してください",
        sectionUpdate: "更新",
        currentVersion: "現在のバージョン",
        checkUpdate: "更新を確認",
        checking: "確認中…",
        upToDate: "最新バージョンです",
        newVersion: "新しいバージョン v{ver} があります",
        updateNow: "更新",
        updating: "更新中…",
        updateDone: "更新完了——dsh web を再起動すると反映されます",
        updateFailed: "更新に失敗しました。後でもう一度お試しください",
        autoCheckUpdate: "毎日更新を確認（新しいバージョンがあれば通知）",
        updateAvailable: "新しいバージョン",
        sectionEdit: "編集",
        sectionRecall: "撤回",
        sectionComposer: "入力欄",
        sectionVersions: "バージョン",
        versionFamilies: "バージョンファミリー（撤回/編集再送）",
        versionHistory: "バージョン履歴（クリックで展開し過去バージョンを復元）",
        versionFamilyNone: "まだありません",
        versionRestoreOpen: "復元して開く",
        versionCount: "バージョン"
      }
    };
    function uiLang() {
      try {
        var l = String(navigator.language || "en").toLowerCase();
        if (l.indexOf("zh") === 0) return "zh";
        if (l.indexOf("ja") === 0) return "ja";
        return "en";
      } catch (e) { return "en"; }
    }
    // ---------- 官方 i18n（dsh-client-locale）：跟随官方语言设置，语言切换时组件自动重渲染 ----------
    var localeServiceRef = null; // apply 时注入
    var UI_NS = "dsh-easyrewrite";
    function useUILocaleDict() {
      var active = React.useSyncExternalStore(
        function (cb) {
          try {
            if (localeServiceRef && typeof localeServiceRef.subscribe === "function") return localeServiceRef.subscribe(cb);
          } catch (e) { /* ignore */ }
          return function () {};
        },
        function () {
          try {
            if (localeServiceRef && typeof localeServiceRef.getSnapshot === "function") {
              var snap = localeServiceRef.getSnapshot();
              return snap && typeof snap.active === "string" ? snap.active : "zh";
            }
            return "zh";
          } catch (e) { return "zh"; }
        }
      );
      return SETTINGS_I18N[active] || SETTINGS_I18N.zh;
    }
    /** 设置卡片：注册进 settings.plugin.item（设置 → 插件 → 插件配置）。 */
    function EasyRewriteSettingsCard(props) {
      var L = useUILocaleDict();
      var openState = React.useState(false);
      var open = openState[0];
      var setOpen = openState[1];
      // 控件状态（初始化自 localStorage）
      var sRewrite = React.useState(rewriteOnClick());
      var rewrite = sRewrite[0];
      var setRewrite = sRewrite[1];
      var sRecall = React.useState(editOffShowRecall());
      var showRecall = sRecall[0];
      var setShowRecall = sRecall[1];
      var sConfirm = React.useState(recallConfirmEnabled());
      var confirmCapsule = sConfirm[0];
      var setConfirmCapsule = sConfirm[1];
      // —— 更新状态（检查/执行；每日检测开关默认关） ——
        // —— 版本历史三层折叠（review 后新增）：总开关默认收起；各家族默认收起 ——
        var sHistOpen = React.useState(false);
        var histOpen = sHistOpen[0];
        var setHistOpen = sHistOpen[1];
        var sFamOpen = React.useState({});
        var famOpenMap = sFamOpen[0];
        var setFamOpenMap = sFamOpen[1];
      var sUpdateVer = React.useState("");
      var updateVer = sUpdateVer[0];
      var setUpdateVer = sUpdateVer[1];
      var sUpdateMsg = React.useState("");
      var updateMsg = sUpdateMsg[0];
      var setUpdateMsg = sUpdateMsg[1];
      var sUpdateAvail = React.useState("");
      var updateAvailableVer = sUpdateAvail[0];
      var setUpdateAvailableVer = sUpdateAvail[1];
      var sChecking = React.useState(false);
      var updateChecking = sChecking[0];
      var setUpdateChecking = sChecking[1];
      var sUpdating = React.useState(false);
      var updateUpdating = sUpdating[0];
      var setUpdateUpdating = sUpdating[1];
      var sAutoCheck = React.useState(getBool("dsh-easyrewrite:autoCheckUpdate", false));
      var autoCheckOn = sAutoCheck[0];
      var setAutoCheckOn = sAutoCheck[1];
      function doCheckUpdate() {
        setUpdateChecking(true);
        setUpdateMsg("");
        fetch("/bubble/check-update", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
          keepalive: true
        }).then(function (r) { return r.json(); }).then(function (d) {
          setUpdateChecking(false);
          if (!d || !d.ok) { setUpdateMsg(L.updateFailed); return; }
          setUpdateVer(d.current || "?");
          if (d.latest && versionGt(d.latest, d.current || "0")) {
            setUpdateAvailableVer(d.latest);
            try { localStorage.setItem("dsh-easyrewrite:updateAvailable", "1"); } catch (e) { /* ignore */ }
          } else {
            setUpdateAvailableVer("");
            setUpdateMsg(L.upToDate);
            try { localStorage.removeItem("dsh-easyrewrite:updateAvailable"); } catch (e) { /* ignore */ }
          }
        }).catch(function () { setUpdateChecking(false); setUpdateMsg(L.updateFailed); });
      }
      function doUpdatePlugin() {
        if (!updateAvailableVer) return;
        setUpdateUpdating(true);
        fetch("/bubble/update-plugin", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
          keepalive: true
        }).then(function (r) { return r.json(); }).then(function (d) {
          setUpdateUpdating(false);
          if (d && d.ok) {
            setUpdateMsg(L.updateDone);
            setUpdateAvailableVer("");
            try { localStorage.removeItem("dsh-easyrewrite:updateAvailable"); } catch (e) { /* ignore */ }
          } else {
            setUpdateMsg(L.updateFailed);
          }
        }).catch(function () { setUpdateUpdating(false); setUpdateMsg(L.updateFailed); });
      }
      // 展开折叠时无感触发一次检查（5 分钟节流，防频繁展开刷请求）；
      // 每日检查开关开启时，即使不展开也会按天自动检测
      React.useEffect(function () {
        if (!open) return;
        var now = Date.now();
        var lastCheck = 0;
        try { lastCheck = parseInt(localStorage.getItem("dsh-easyrewrite:lastUpdateCheckTs") || "0", 10) || 0; } catch (e) { /* ignore */ }
        if (now - lastCheck < 5 * 60 * 1000 && updateVer !== "") { return; }
        try { localStorage.setItem("dsh-easyrewrite:lastUpdateCheckTs", String(now)); } catch (e) { /* ignore */ }
        if (!updateVer) setUpdateVer("…");
        doCheckUpdate();
      }, [open]);
      // 每日检测：开关开启时每天首次触发一次（不依赖展开）
      React.useEffect(function () {
        var autoOn = getBool("dsh-easyrewrite:autoCheckUpdate", false);
        if (!autoOn) return;
        var today = new Date().toISOString().slice(0, 10);
        var last = null;
        try { last = localStorage.getItem("dsh-easyrewrite:lastUpdateCheck"); } catch (e) { /* ignore */ }
        if (last === today) return;
        try { localStorage.setItem("dsh-easyrewrite:lastUpdateCheck", today); } catch (e) { /* ignore */ }
        doCheckUpdate();
      }, []);
      var sHotkey = React.useState(hotkeySetting());
      var hotkey = sHotkey[0];
      var setHotkeyState = sHotkey[1];
      var sHotkeyOn = React.useState(hotkeyEnabledSetting());
      var hotkeyOn = sHotkeyOn[0];
      var setHotkeyOn = sHotkeyOn[1];
      var sRecording = React.useState(false);
      var recording = sRecording[0];
      var setRecording = sRecording[1];
      var sHotkeyInvalid = React.useState(false);
      var hotkeyInvalid = sHotkeyInvalid[0];
      var setHotkeyInvalid = sHotkeyInvalid[1];
      // 录制监听：录制期间屏蔽全局快捷键（hotkeyCaptureActive）
      React.useEffect(function () {
        if (!recording) return;
        hotkeyCaptureActive = true;
        function onKey(e) {
          e.preventDefault();
          e.stopPropagation();
          if (e.key === "Escape") { setRecording(false); setHotkeyInvalid(false); return; }
          var combo = keydownCombo(e);
          if (!combo) { setHotkeyInvalid(true); return; }
          setHotkeyInvalid(false);
          setHotkeyState(combo);
          setHotkeySetting(combo);
          setRecording(false);
        }
        window.addEventListener("keydown", onKey, true);
        return function () {
          hotkeyCaptureActive = false;
          window.removeEventListener("keydown", onKey, true);
        };
      }, [recording]);
      var sVisual = React.useState(recallVisualMode());
      var visual = sVisual[0];
      var setVisual = sVisual[1];
      var sStat = React.useState(statOnlyUser());
      var statOnly = sStat[0];
      var setStatOnly = sStat[1];
      var sConflict = React.useState(draftConflictMode());
      var conflict = sConflict[0];
      var setConflict = sConflict[1];
      var sWidth = React.useState(editWidthMode());
      var widthMode = sWidth[0];
      var setWidthMode = sWidth[1];
      var sCustom = React.useState(String(editWidthCustom()));
      var customW = sCustom[0];
      var setCustomW = sCustom[1];

      // 官方 PluginCard 同款：卡片/展开态/头部/标题/描述/箭头/内容区
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
          }, value ? React.createElement(Primitives.IconCheckOutline16, null) : null)
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

      return React.createElement("li", { style: Object.assign({}, cardStyle, open ? cardOpenStyle : null), "data-dsh-easyrewrite": "settings-card" },
        React.createElement("button", {
          type: "button",
          style: headStyle,
          "aria-expanded": open,
          "aria-label": (open ? L.collapse : L.expand) + ": " + L.title,
          onClick: function () { setOpen(!open); }
        },
          React.createElement("span", { style: headTextStyle },
            React.createElement("span", { style: titleStyle }, L.title),
            React.createElement("span", { style: subStyle }, L.subtitle)
          ),
          React.createElement("svg", { width: "18", height: "18", viewBox: "0 0 24 24", style: Object.assign({}, chevronStyle, open ? chevronOpenStyle : null) },
            React.createElement("path", { d: "M9 6l6 6-6 6", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }))
        ),
        open ? React.createElement("div", { style: bodyStyle },
          // —— 编辑 ——
          React.createElement("div", { style: sectionStyle },
            React.createElement("span", { style: groupTitleStyle }, L.sectionEdit),
            switchRow(L.rewrite, rewrite, function (v) { setRewrite(v); setBool("dsh-easyrewrite:rewriteOnClick", v); }),
            switchRow(L.editOffShowRecall, showRecall, function (v) {
              setShowRecall(v); setBool("dsh-easyrewrite:editOffShowRecall", v);
            }, rewrite ? L.lockedHint : null, rewrite),
            // 编辑宽度：三固定 + 自定义（固定时输入框禁用置灰）
            React.createElement("div", { style: groupStyle },
              React.createElement("span", { style: labelStyle }, L.editWidth),
              segmentedGroup([["compact", L.wCompact], ["standard", L.wStandard], ["extended", L.wExtended], ["custom", L.wCustom]], widthMode, function (v) { setWidthMode(v); setSetting("dsh-easyrewrite:editWidth", v); }),
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
                  onChange: function (e) {
                    setCustomW(e.target.value);
                    setSetting("dsh-easyrewrite:editWidthCustom", e.target.value);
                  }
                })
              )
            )
          ),
          // —— 撤回 ——
          React.createElement("div", { style: sectionStyle },
            React.createElement("span", { style: groupTitleStyle }, L.sectionRecall),
            switchRow(L.recallConfirm, confirmCapsule, function (v) { setConfirmCapsule(v); setBool("dsh-easyrewrite:recallConfirm", v); }),
            // 视觉模式
            React.createElement("div", { style: groupStyle },
              React.createElement("span", { style: labelStyle }, L.visualMode),
              segmentedGroup([["simple", L.visualSimple], ["minimal", L.visualMinimal], ["info", L.visualInfo]], visual, function (v) { setVisual(v); setSetting("dsh-easyrewrite:visualMode", v); })
            ),
            switchRow(L.statOnlyUser, statOnly, function (v) { setStatOnly(v); setBool("dsh-easyrewrite:statOnlyUser", v); }),
            // 撤回快捷键：总开关（Beta，默认关——避免与其他插件快捷键打架）
            switchRow(L.hotkeyEnable, hotkeyOn, function (v) {
              setHotkeyOn(v);
              setHotkeyEnabledSetting(v);
              if (!v) setRecording(false);
            }, L.hotkeyHint),
            // 键位行：始终显示；总开关关闭时录制按钮禁用置灰
            React.createElement("div", { style: rowStyle },
              React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "2px" } },
                React.createElement("span", { style: labelStyle }, L.hotkey + "：" + (hotkey ? formatHotkey(hotkey) : L.hotkeyNone)),
                React.createElement("span", { style: hintStyle }, recording ? L.hotkeyRecording : (hotkey ? null : L.hotkeyHint)),
                hotkeyInvalid ? React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-error, #d9534f)" } }, L.hotkeyInvalid) : null
              ),
              React.createElement("button", {
                type: "button",
                disabled: !hotkeyOn,
                style: {
                  appearance: "none",
                  border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
                  background: "transparent",
                  color: "var(--dsw-alias-label-secondary)",
                  borderRadius: "6px",
                  padding: "3px 10px",
                  fontSize: "12px",
                  cursor: hotkeyOn ? "pointer" : "not-allowed",
                  fontFamily: "inherit",
                  flex: "none",
                  opacity: hotkeyOn ? 1 : 0.45
                },
                onClick: function () { setHotkeyInvalid(false); setRecording(!recording); }
              }, recording ? L.hotkeyRecording : L.hotkeyRecord)
            )
          ),
          // —— 回填 ——
          React.createElement("div", { style: sectionStyle },
            React.createElement("span", { style: groupTitleStyle }, L.sectionComposer),
            // 回填冲突模式
            React.createElement("div", { style: groupStyle },
              React.createElement("span", { style: labelStyle }, L.conflictMode),
              segmentedGroup([["overwrite", L.conflictOverwriteShort], ["merge", L.conflictMergeShort]], conflict, function (v) { setConflict(v); setSetting("dsh-easyrewrite:conflictMode", v); }),
              React.createElement("span", { style: hintStyle }, conflict === "merge" ? L.conflictMerge : L.conflictOverwrite)
            )
          ),
          // —— 版本 ——
          React.createElement("div", { style: sectionStyle },
            React.createElement("span", { style: groupTitleStyle }, L.sectionVersions),
            // 版本历史（三层折叠）：总开关默认收起 → 按对话名的家族折叠项 → 条目显最后对话时间
            // （官方无归档恢复入口，此处保留恢复并打开；review #6 后家族来自官方 lineage）
            React.createElement("div", { style: groupStyle },
              (function () {
                var families = listVersionFamilies(props.ctxSessions);
                if (families.length === 0) return React.createElement("span", { style: hintStyle }, L.versionFamilyNone);
                var snap = null;
                try { snap = props.ctxSessions.list.getSnapshot(); } catch (e) { /* ignore */ }
                var metaOf = function (vid) { return (snap && snap.byId && snap.byId[vid]) || {}; };
                var famName = function (fam) {
                  var best = null, bt = -1;
                  fam.versions.forEach(function (vid) {
                    var m = metaOf(vid); var tt = m.updatedAt || 0;
                    if (tt >= bt) { bt = tt; best = m.title || null; }
                  });
                  return best || (fam.versions.length + " " + L.versionCount);
                };
                var fmtStamp = function (tsv) {
                  if (!tsv) return "—";
                  var dd = new Date(tsv);
                  var p2 = function (x) { return (x < 10 ? "0" : "") + x; };
                  return dd.getFullYear() + "-" + p2(dd.getMonth() + 1) + "-" + p2(dd.getDate()) + " " + p2(dd.getHours()) + ":" + p2(dd.getMinutes());
                };
                // 折叠箭头：SVG 描边（官方图标同风格），像素级对齐、无字距
                var chev = function (openState) {
                  return React.createElement("svg", {
                    width: "18", height: "18", viewBox: "0 0 24 24",
                    style: { flex: "none", display: "block", color: "var(--dsw-alias-label-tertiary)", transform: openState ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .12s" }
                  }, React.createElement("path", { d: "M9 6l6 6-6 6", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }));
                };
                var rowHead = { display: "flex", alignItems: "center", gap: "6px", padding: "5px 4px", cursor: "pointer", borderRadius: "6px" };
                var hdrRow = { display: "flex", alignItems: "center", cursor: "pointer" }; // 无 gap：SVG 箭头紧贴文字
                // 层1：版本历史总折叠（默认收起）
                return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "2px" } },
                  React.createElement("div", { style: hdrRow, onClick: function () { setHistOpen(!histOpen); } },
                    chev(histOpen),
                    React.createElement("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } }, L.versionHistory),
                    React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", marginLeft: "auto" } }, families.length + "")
                  ),
                  histOpen ? families.map(function (fam) {
                    var open = !!famOpenMap[fam.rootId];
                    return React.createElement("div", { key: fam.rootId, style: { display: "flex", flexDirection: "column", gap: "2px", padding: "2px 0 2px 12px", borderTop: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.14))" } },
                      React.createElement("div", { style: hdrRow, onClick: function () { var nm = {}; for (var ok2 in famOpenMap) nm[ok2] = famOpenMap[ok2]; nm[fam.rootId] = !open; setFamOpenMap(nm); } },
                        chev(open),
                        React.createElement("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1" } }, famName(fam)),
                        React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", flex: "none", marginLeft: "auto" } }, fam.versions.length + " " + L.versionCount)
                      ),
                      open ? fam.versions.map(function (vid, vi) {
                        return React.createElement("div", { key: vid, style: rowHead },
                          React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", fontVariantNumeric: "tabular-nums", flex: "none", width: "26px" } }, "v" + (vi + 1)),
                          React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", fontVariantNumeric: "tabular-nums", flex: "1" } }, fmtStamp(metaOf(vid).updatedAt)),
                          React.createElement("button", {
                            type: "button",
                            style: { appearance: "none", border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))", background: "transparent", color: "var(--dsw-alias-label-secondary)", borderRadius: "6px", padding: "2px 8px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", flex: "none" },
                            onClick: function (ev) {
                              ev.stopPropagation();
                              fetch("/bubble/unarchive", {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({ sessionId: vid }),
                                keepalive: true
                              }).then(function () {
                                if (typeof props.openSession === "function") props.openSession(vid);
                              }).catch(function () { /* ignore */ });
                            }
                          }, L.versionRestoreOpen)
                        );
                      }) : null
                    );
                  }) : null
                );
              })()
            )
          ),
          // —— 更新 ——
          React.createElement("div", { style: sectionStyle },
            React.createElement("span", { style: groupTitleStyle }, L.sectionUpdate),
            // 更新检查与执行（精简版：手动检查 + 每日检测可选 + 有新版提示）
            React.createElement("div", { style: groupStyle },
              React.createElement("span", { style: labelStyle }, L.currentVersion + "：" + (updateVer || "…")),
              React.createElement("div", { style: rowStyle },
                React.createElement("span", { style: hintStyle, flex: "1" }, updateMsg || ""),
                React.createElement("button", {
                  type: "button",
                  style: {
                    appearance: "none",
                    border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
                    background: "transparent",
                    color: "var(--dsw-alias-label-secondary)",
                    borderRadius: "6px",
                    padding: "3px 10px",
                    fontSize: "12px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    flex: "none"
                  },
                  onClick: function () { doCheckUpdate(); }
                }, updateChecking ? L.checking : L.checkUpdate)
              ),
              updateAvailableVer ? React.createElement("div", { style: rowStyle },
                React.createElement("span", { style: { fontSize: "12px", color: "var(--dsw-alias-brand-primary, #4d6bfe)", flex: "1" } }, L.newVersion.replace("{ver}", updateAvailableVer)),
                React.createElement("button", {
                  type: "button",
                  style: {
                    appearance: "none",
                    border: "none",
                    background: "var(--dsw-static-deepseek-500, #4d6bfe)",
                    color: "#ffffff",
                    borderRadius: "6px",
                    padding: "3px 12px",
                    fontSize: "12px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    flex: "none"
                  },
                  onClick: function () { doUpdatePlugin(); }
                }, updateUpdating ? L.updating : L.updateNow)
              ) : null,
              switchRow(L.autoCheckUpdate, autoCheckOn, function (v) {
                setAutoCheckOn(v);
                setBool("dsh-easyrewrite:autoCheckUpdate", v);
              })
            )
          ),
          React.createElement("span", { style: hintStyle }, L.instant)
        ) : null
      );
    }

    /** 切换版本（按钮与键盘共用；无组件闭包依赖）：
     * 恢复目标（unarchive）→ 打开 → 轮询确认当前会话==目标后归档家族其余——列表只保留目标一个。 */
    function goToVersion(fam, sessionId, nextIndex, props, cleanupRef) {
      var next = fam.versions[nextIndex];
      if (!next) return;
      log("info", "pager", "切换版本", { from: sessionId, to: next, index: nextIndex + 1, count: fam.versions.length });
      // 历史版本都是归档会话（无痕替换副作用），先恢复再打开；恢复失败也照常打开（幂等）
      var doOpen = function () {
        if (typeof props.openSession === "function") props.openSession(next);
        // 等当前会话确认为 next（轮询 current，不猜时间）后，归档家族其余版本——列表只保留目标一个。
        // open 未确认（超时 8s）则放弃归档，绝不误伤任何会话。
        if (cleanupRef.current !== null) { clearInterval(cleanupRef.current); cleanupRef.current = null; }
        var attempts = 0;
        cleanupRef.current = setInterval(function () {
          attempts++;
          try {
            var cur = typeof props.currentSessionId === "function" ? props.currentSessionId() : null;
            if (cur === next) {
              clearInterval(cleanupRef.current);
              cleanupRef.current = null;
              if (typeof props.archiveSession === "function") {
                fam.versions.forEach(function (vid) {
                  if (vid !== next) props.archiveSession(vid);
                });
              }
              return;
            }
          } catch (e) { /* ignore */ }
          if (attempts >= 40) {
            clearInterval(cleanupRef.current);
            cleanupRef.current = null;
          }
        }, 200);
      };
      if (typeof props.restoreSession === "function") {
        try {
          props.restoreSession(next).then(function () { doOpen(); }, function () { doOpen(); });
          return;
        } catch (e) { /* fallthrough */ }
      }
      doOpen();
    }

    /** 该消息是否为会话第一条 user 消息（首条/截断会话首条无前置闭合边界）——模块级，UserBubbleView 与 RecallBanner 共用 */
    function isFirstUserMessage(props, myKey) {
      try {
        var snap = typeof props.useSession === "function" ? props.useSession(function (s) { return s; }) : null;
        if (snap && snap.chat && Array.isArray(snap.chat.order) && snap.chat.nodes && typeof snap.chat.nodes.get === "function") {
          var ord = snap.chat.order;
          for (var oi = 0; oi < ord.length; oi++) {
            var on = snap.chat.nodes.get(ord[oi]);
            if (on && on.kind === "user") return on.key === myKey;
          }
        }
      } catch (e) { /* ignore */ }
      return false;
    }

    /** 极限场景重置（首条消息/截断会话首条，无前置闭合边界，无法 fork）：
     * - 家族会话（截断/分叉产物，版本 ≥2）：归档当前 → 恢复并打开**父版本**（上一次模型回复处）重新开始；
     *   编辑模式经 resume 机制把修改文本带到父版本自动重发。
     * - 全新会话首条（无家族）：归档当前 → 回到空白新对话（官方 project() 检测归档即回 hero）。
     * @param mode - "recall" | "edit"
     * @param text - edit 模式的修改后文本
     * @param props - 组件 inject 面
     */
    function resetConversation(sessionId, mode, text, props) {
      log("info", "reset", "首条消息重置对话", { sessionId: sessionId, mode: mode });
      writePending(sessionId, null);
      // 1) 归档当前会话（两种场景都需要；project() 检测 current 归档 → 自动回 hero/父版本打开后列表更新）
      try {
        var archiver = typeof props.archiveSession === "function"
          ? props.archiveSession
          : (props.ctxWorkspaces && typeof props.ctxWorkspaces.archiveSession === "function"
            ? function (id) { return props.ctxWorkspaces.archiveSession(id); }
            : null);
        if (archiver) {
          Promise.resolve(archiver(sessionId)).catch(function () { log("warn", "reset", "归档失败", { sessionId: sessionId }); });
        } else {
          log("warn", "reset", "归档能力不可用", { sessionId: sessionId });
        }
      } catch (e) { /* ignore */ }
      // 2) 场景 2：家族父版本（截断/分叉会话 → 回到上一次模型回复）
      try {
        var fam = familyOfSession(sessionId, props.ctxSessions);
        log("info", "reset", "场景2家族判定", { sessionId: sessionId, found: !!fam, verLen: fam ? fam.versions.length : -1, index: fam ? fam.index : -1 });
        var parentId = fam && fam.versions.length >= 2 && fam.index > 0 ? fam.versions[fam.index - 1] : null;
        if (parentId) {
          if (mode === "edit" && typeof text === "string") {
            try { localStorage.setItem("dsh-easyrewrite:resume-send:" + parentId, JSON.stringify({ draftText: text, t: Date.now() })); } catch (e) { /* ignore */ }
          }
          var doOpenParent = function () {
            if (typeof props.openSession === "function") props.openSession(parentId);
          };
          if (typeof props.restoreSession === "function") {
            try { props.restoreSession(parentId).then(doOpenParent, doOpenParent); return; } catch (e) { /* fallthrough */ }
          }
          doOpenParent();
          return;
        }
      } catch (e) { /* ignore */ }
      // 3) 场景 1：全新会话首条 → 无缝打开空白新会话（编辑模式经 resume 自动发送编辑文本）
      try {
        var wsId = null;
        if (props.ctxWorkspaces && typeof props.ctxWorkspaces.list === "object" && typeof props.ctxWorkspaces.list.getSnapshot === "function") {
          var wsList = props.ctxWorkspaces.list.getSnapshot();
          if (wsList && Array.isArray(wsList.items)) {
            for (var wi = 0; wi < wsList.items.length; wi++) {
              if (wsList.items[wi] && Array.isArray(wsList.items[wi].sessionIds) && wsList.items[wi].sessionIds.indexOf(sessionId) >= 0) {
                wsId = wsList.items[wi].workspaceId;
                break;
              }
            }
          }
        }
          log("info", "reset", "场景1工作区定位", { sessionId: sessionId, wsId: wsId, hasConnect: !!(props.ctxWorkspaces && typeof props.ctxWorkspaces.connectWorkspace === "function") });
        if (wsId && props.ctxWorkspaces && typeof props.ctxWorkspaces.connectWorkspace === "function") {
          props.ctxWorkspaces.connectWorkspace(wsId).then(function (newId) {
            if (!newId) return;
            if (mode === "edit" && typeof text === "string") {
              try { localStorage.setItem("dsh-easyrewrite:resume-send:" + newId, JSON.stringify({ draftText: text, t: Date.now() })); } catch (e) { /* ignore */ }
            }
            log("info", "reset", "空白新会话已就绪", { newId: newId, mode: mode });
            if (typeof props.openSession === "function") props.openSession(newId);
            // 编辑模式：空白会话可能不渲染 dock（resume 依赖挂载不成立）——主动轮询 composer 就绪后发送
            if (mode === "edit" && typeof text === "string") {
              var tries2 = 0;
              var timer2 = setInterval(function () {
                tries2++;
                try {
                  var ia2 = props.inputActions;
                  if (ia2 && typeof ia2.setDraft === "function" && typeof ia2.submit === "function") {
                    clearInterval(timer2);
                    ia2.setDraft(text);
                    setTimeout(function () { try { ia2.submit(); } catch (e) { log("error", "reset", "空白会话自动发送失败", { err: String(e && e.message ? e.message : e) }); } }, 80);
                    log("info", "reset", "编辑文本已自动发送", { newId: newId });
                    return;
                  }
                } catch (e) { /* ignore */ }
                if (tries2 >= 50) clearInterval(timer2); // 最多等 5s
              }, 100);
            }
          }).catch(function () { log("warn", "reset", "空白会话创建失败（回 hero）"); });
          return;
        }
      } catch (e) { /* ignore */ }
      // 兜底：归档已生效，官方自动回 hero
      log("info", "reset", "重置完成（兜底路径）", { sessionId: sessionId, mode: mode });
    }

    /** 版本翻页器 < X >：撤回/编辑重发产生的版本家族切换（官方 assistant-actions 操作区）。
     * 仅在该次问询的**最后一条 assistant 消息**（当前版本的回答）显示；点击 ‹/› 或键盘 ←/→
     * 切换版本（sessions.open 兄弟会话），切换后滚动锚定保持文本位置不动。 */
    function VersionPager(props) {
      var sessionId = props.sessionId;
      // —— hooks 无条件前置（React 规则：任何 return null 不得出现在 hooks 之前，否则 hook 数量漂移 → error #300）——
      var L = useUILocaleDict();
      var cleanupRef = React.useRef(null);
      // 注意：没有卸载清理！切换会卸载组件——卸载时绝不能清掉未执行的归档定时器
      //（归档必须在切换后照常执行；竞态防护只在 goToVersion 内 clear 前一次的）
      // 键盘 ←/→（输入框/可编辑区未聚焦时；实时读家族，避免陈旧闭包）
      React.useEffect(function () {
        function onKey(e) {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          var tgt = e.target;
          if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
          var fam = familyOfSession(sessionId, props.ctxSessions);
          if (!fam || fam.versions.length < 2) return;
          var idx = fam.index;
          if (e.key === "ArrowLeft" && idx > 0) { e.preventDefault(); goToVersion(fam, sessionId, idx - 1, props, cleanupRef); }
          else if (e.key === "ArrowRight" && idx < fam.versions.length - 1) { e.preventDefault(); goToVersion(fam, sessionId, idx + 1, props, cleanupRef); }
        }
        window.addEventListener("keydown", onKey, true);
        return function () { window.removeEventListener("keydown", onKey, true); };
      }, []);
      // —— 数据与显示条件（无 hooks，可安全 return null）——
      var family = familyOfSession(sessionId, props.ctxSessions);
      if (!family || family.versions.length < 2) return null;
      // 只挂在**会话最后一个回合**的 TurnTail 上（历史回合的 TurnTail 也渲染本槽，须排除）：
      // order 最后一项是 turn-tail 且其 data.closing.finalNode.messageId == 本组件的 messageId
      var isLastTail = false;
      try {
        var snapshot = typeof props.useSession === "function" ? props.useSession(function (s) { return s; }) : null;
        if (snapshot && snapshot.chat && Array.isArray(snapshot.chat.order) && snapshot.chat.nodes && typeof snapshot.chat.nodes.get === "function") {
          var order = snapshot.chat.order;
          if (order.length > 0) {
            var tt = snapshot.chat.nodes.get(order[order.length - 1]);
            if (tt && tt.kind === "turn-tail" && tt.data && tt.data.closing && tt.data.closing.finalNode) {
              isLastTail = tt.data.closing.finalNode.messageId === props.messageId;
            }
          }
        }
      } catch (e) { /* ignore */ }
      if (!isLastTail) return null;
      var index = family.index;
      var count = family.versions.length;
      var atFirst = index <= 0;
      var atLast = index >= count - 1;
      function go(delta) {
        goToVersion(family, sessionId, index + delta, props, cleanupRef);
      }
      var pagerStyle = {
        display: "inline-flex",
        alignItems: "center",
        gap: "3px",
        fontSize: "14px",
        color: "var(--dsw-alias-label-tertiary)",
        fontVariantNumeric: "tabular-nums"
      };
      var btnStyle = {
        appearance: "none",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        color: "var(--dsw-alias-label-secondary)",
        padding: "3px 7px",
        borderRadius: "6px",
        fontSize: "15px",
        lineHeight: "19px",
        fontFamily: "inherit"
      };
      function btnDisabled(flag) { return Object.assign({}, btnStyle, flag ? { opacity: 0.35, cursor: "default" } : {}); }
      return React.createElement("span", { style: pagerStyle, "data-dsh-easyrewrite": "version-pager", title: L.pagerTitle },
        React.createElement("button", {
          type: "button",
          className: "dbe-pager-btn",
          style: btnDisabled(atFirst),
          disabled: atFirst,
          "aria-label": L.pagerPrev,
          onClick: function () { go(-1); }
        }, React.createElement(Primitives.IconChevronLeftOutline14, null)),
        React.createElement("span", { style: { padding: "0 4px", fontSize: "14px", whiteSpace: "nowrap" } }, (index + 1) + "/" + count),
        React.createElement("button", {
          type: "button",
          className: "dbe-pager-btn",
          style: btnDisabled(atLast),
          disabled: atLast,
          "aria-label": L.pagerNext,
          onClick: function () { go(1); }
        }, React.createElement(Primitives.IconChevronRightOutline14, null))
      );
    }

    /** 复制键：官方 IconCopyOutline16，点击复制消息原文（clipboard，带成功反馈）。
     * 注意：复制键保持原始小尺寸（14px 图标），不随撤回/编辑的 1.3 倍放大。 */
    function CopyButton({ text }) {
      var L = useUILocaleDict();
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
        title: copied ? L.copied : L.copy,
        "aria-label": L.copy,
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
      var L = useUILocaleDict();
      // review M4：附件检测——图片附件可保留重发（M4 闭环）；其他块无法保留，进入编辑态时提示
      var hasUnpreservable = false;
      try {
        if (data && Array.isArray(data.content)) {
          for (var bi = 0; bi < data.content.length; bi++) {
            var blk = data.content[bi];
            if (blk && blk.type !== "text" && blk.type !== "image") { hasUnpreservable = true; break; }
          }
        }
      } catch (e) { /* ignore */ }

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
        // 镜像输入框当前图片 id（供撤回/编辑发送时精确搬运）
        try { if (Array.isArray(inputState.imageIds)) latestInputImageIds = inputState.imageIds.slice(); } catch (eMir) { /* ignore */ }

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
      // 可见错误提示（no-boundary / turn-open 等失败原因）
      var errState = React.useState(null);
      var opError = errState[0];
      var setOpError = errState[1];
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
              title: showPreview ? L.collapse : L.viewOriginal,
              onClick: function (e) { e.stopPropagation(); setShowPreview(!showPreview); }
            },
            showPreview
              ? React.createElement("div", { style: previewStyle }, text || L.emptyMsg)
              : L.greyText
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
      var editInFlight = false; // review M2：编辑重发并发锁
      async function confirmEdit() {
        if (editInFlight) return;
        editInFlight = true;
        try {
          // 惰性提交：编辑的「确定」= 真正修改点（与撤回的「发送」等价）——截断重发
          var newText = editText;
          var sid = sessionId;
          var realSeq = (data && typeof data.seq === "number") ? data.seq : anchorSeq;
          // 极限场景：首条消息（含截断会话首条）无前置边界 → 重置对话（不 fork；编辑文本带到新起点）
          if (isFirstUserMessage(props, myKey)) {
            setEditing(false);
            resetConversation(sid, "edit", newText, props);
            return;
          }
          // review M3：pending 不清除前置——失败时保留草稿并恢复编辑态
          // M4：收集本条消息的图片附件引用（随 resume 数据传递，重发保留）
          var attachRefs = [];
          try {
            if (data && Array.isArray(data.content)) {
              for (var ai = 0; ai < data.content.length; ai++) {
                var ab = data.content[ai];
                if (ab && ab.type === "image" && ab.attachment && typeof ab.attachment.attachmentId === "string") {
                  attachRefs.push({
                    attachmentId: ab.attachment.attachmentId,
                    mediaType: ab.attachment.mediaType,
                    bytes: ab.attachment.bytes,
                    name: ab.attachment.name
                  });

                }
              }
            }
          } catch (e) { /* ignore */ }
          setEditing(false);
          log("info", "edit", "确定：编辑重发", { sessionId: sid, targetSeq: realSeq, len: newText.length });
          var resp = await fetch("/bubble/recall", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId: sid, targetSeq: realSeq })
          });
          var data = await resp.json();
          if (!data || !data.ok) {
            var errCode2 = (data && data.error) || "unknown";
            log("warn", "edit", "编辑重发失败（边界）", { error: errCode2 });
            if (errCode2 === "turn-open" || errCode2 === "no-boundary") {
              // 极限场景（说一半截断 / 首条无边界）：重置对话，编辑文本带到新起点
              setEditing(false);
              setOpError(L.resetNotice);
              setTimeout(function () { setOpError(null); }, 5000);
              resetConversation(sid, "edit", newText, props);
            } else {
              // review M3：失败恢复编辑态（草稿仍在 editText），不丢内容；显示可见原因
              setEditing(true);
              setOpError(L.errGeneric);
              setTimeout(function () { setOpError(null); }, 5000);
            }
            return;
          }
          var newId = null;
          try {
            newId = await props.ctxSessions.fork({ sessionId: sid, atSeq: data.boundary });
          } catch (e) {
            log("error", "edit", "fork 失败（编辑重发中止）", { err: String(e && e.message ? e.message : e) });
            setEditing(true); // 恢复编辑态
            return;
          }
          // 成功：清除 pending（编辑草稿已消费）
          if (isEditPending) writePending(sid, null);
          // review M6：resume-send 带 TTL 时间戳；M4：图片附件引用随行（重发保留）
          try { localStorage.setItem("dsh-easyrewrite:resume-send:" + newId, JSON.stringify({ draftText: newText, t: Date.now(), attachments: attachRefs })); } catch (e) { /* ignore */ }
          try {
            if (props.ctxWorkspaces && typeof props.ctxWorkspaces.archiveSession === "function") {
              // review M8：await + catch
              await Promise.resolve(props.ctxWorkspaces.archiveSession(sid)).catch(function () { /* ignore */ });
            }
          } catch (e) { log("warn", "edit", "归档原会话失败", { err: String(e && e.message ? e.message : e) }); }
          log("info", "edit", "编辑重发：归档原会话 + 打开新会话", { newId: newId });
          if (typeof props.openSession === "function") props.openSession(newId);
        } catch (err) {
          log("error", "edit", "编辑重发请求失败", { err: String(err && err.message ? err.message : err) });
          setEditing(true); // 网络异常也恢复编辑态
        } finally {
          editInFlight = false;
        }
      }
      function onBubbleClick(e) {
        if (editing || confirming) return;
        if (!rewriteOnClick()) return; // 设置关闭：点击气泡不进入编辑（入口在操作区编辑键）
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
            hasUnpreservable ? React.createElement("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-warning, #b7791f)", marginBottom: "6px", lineHeight: "1.5" } }, L.attachWarning) : null,
            opError ? React.createElement("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-error, #d9534f)", marginBottom: "6px", lineHeight: "1.5" } }, opError) : null,
            React.createElement("textarea", {
              value: editText,
              rows: taRows,
              autoFocus: true,
              placeholder: L.emptyMsg,
              style: taStyle,
              onChange: function (e) { setEditText(e.target.value); },
              onKeyDown: function (e) {
                if (e.key === "Escape") { e.stopPropagation(); cancelEdit(); }
                else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); confirmEdit(); }
              }
            }),
            React.createElement(
              "div", { style: btnRowStyle },
              React.createElement("button", { type: "button", style: ghostBtnStyle, onClick: function (e) { e.stopPropagation(); cancelEdit(); } }, L.cancel),
              React.createElement("button", { type: "button", style: primaryBtnStyle, onClick: function (e) { e.stopPropagation(); confirmEdit(); } }, L.confirm)
            )
          ),
          React.createElement(
            "div", { style: actionsStyle },
            actionButton("撤回", "撤回", function (e) {
              e.stopPropagation();
              // 编辑态直接转撤回：丢弃编辑草稿 → 确认胶囊（首条消息同样走确认，确定后重置对话）
              if (isEditPending) writePending(sessionId, null);
              setEditing(false);
              setConfirming(true);
            }, iconImg(ICONS.recall, "撤回"), "recall-key")
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

      // 问题1 修复：气泡上方渲染消息中的图片附件（覆盖 chat.node 后官方图片槽不再自动注入）
      var pc = contentParts(data.content);
      var msgImages = pc && pc.images ? pc.images : [];

      return React.createElement(
        "div", { style: rowStyle, "data-dsh-easyrewrite": "user", "data-time-hover-root": true },
        renderMessageImagesCompat(msgImages, props),
        React.createElement(
          "div", { style: bubbleStyle, onClick: onBubbleClick, title: L.clickEdit },
          text || L.emptyMsg
        ),
        confirming
          ? React.createElement(ConfirmCapsule, {
              text: afterCount === 0 ? L.recallText0 : (onlyUser ? L.recallTextQ.replace("{n}", String(afterCount)) : L.recallTextC.replace("{n}", String(afterCount))),
              onConfirm: function () {
                setConfirming(false);
                // 惰性提交：此刻只记录 pending + 回填输入框，真正修改发生在「发送」时
                // 注意：anchorSeq 对窗口外历史消息会退化，必须用 node.data.seq（UserMessageNode 的真实事件 seq）
                var conflictMode = draftConflictMode();
                var visualMode = recallVisualMode();
                var realSeq = (data && typeof data.seq === "number") ? data.seq : anchorSeq;
                // 撤回确认：先收集本条消息图片 refs（随 pending 持久化，发送时 imageIds 失效的兜底）
                var rcAt = [];
                try {
                  if (data && Array.isArray(data.content)) {
                    for (var rcAi = 0; rcAi < data.content.length; rcAi++) {
                      var rcAb = data.content[rcAi];
                      if (rcAb && rcAb.type === "image" && rcAb.attachment && typeof rcAb.attachment.attachmentId === "string") {
                        rcAt.push({ attachmentId: rcAb.attachment.attachmentId, mediaType: rcAb.attachment.mediaType, name: rcAb.attachment.name });
                      }
                    }
                  }
                } catch (e) { /* ignore */ }
                // 快照用户确认前输入框已有的图（× 取消时保留；消息自身的图走 attachRefs）
                var preUserImageIds = [];
                try {
                  var sPre = typeof props.useInput === "function" ? props.useInput(function (q) { return q; }) : null;
                  if (sPre && Array.isArray(sPre.imageIds)) preUserImageIds = sPre.imageIds.slice();
                } catch (e) { /* ignore */ }
                writePending(sessionId, {
                  type: "recall",
                  targetKey: myKey,
                  targetSeq: realSeq,
                  draftText: text,
                  originalDraft: draftRef.current,
                  conflictMode: conflictMode,
                  visualMode: visualMode,
                  attachRefs: rcAt,
                  preUserImageIds: preUserImageIds,
                  updatedAt: Date.now()
                });
                var ia = props.inputActions;
                if (ia && typeof ia.setDraft === "function") {
                  var nextDraft = (conflictMode === "merge" && draftRef.current !== "") ? draftRef.current + "\n" + text : text;
                  ia.setDraft(nextDraft);
                }
                // 撤回确认后：把本条消息的图片立即重建到输入框（官方 addImages → 官方图预览，自带删除键）
                // rcAt 已在上方收集并随 pending 持久化
                try {
                  if (rcAt.length > 0) {
                    rebuildDraftAttachments(rcAt, props, sessionId, true).then(function (n) {
                      log("info", "attach", "撤回确认后输入框图预览重建", { count: n, total: rcAt.length });
                    });
                  }
                } catch (e) { log("warn", "attach", "撤回确认图形预览重建失败", { err: String(e && e.message ? e.message : e) }); }
                log("info", "recall", "pending set（发送时执行真正撤回）", { sessionId: sessionId, targetSeq: realSeq, mode: conflictMode, visual: visualMode });
              },
              onCancel: function () { setConfirming(false); }
            })
          : React.createElement(
              "div", { style: actionsStyle },
              React.createElement("span", { className: "dbe-time", style: timeStyle }, formatClock(msgTime)),
              // 撤回键：rewrite 关闭且二级「关闭时显示撤回键」也关闭 → 隐藏
              (!rewriteOnClick() && !editOffShowRecall())
                ? null
                : actionButton("撤回", "撤回", function (e) {
                    e.stopPropagation();
                    if (pending && pending.type === "recall") {
                      log("warn", "recall", "已有待处理撤回（单待定约束）");
                      return;
                    }
                    // 极限场景：首条消息（含截断会话）——确认后按场景重置（家族→回父版本；无家族→空白顶替）
                    if (isFirstUserMessage(props, myKey)) {
                      setConfirming(true);
                      return;
                    }
                    // review M5：存在编辑待定 → 丢弃编辑草稿转撤回（与编辑态操作区撤回键同语义）
                    if (pending && pending.type === "edit") {
                      writePending(sessionId, null);
                    }
                    if (recallConfirmEnabled()) {
                      setConfirming(true);
                    } else {
                      // 确认开关关闭：直接进入待定（回填 + 条）
                      var cMode = draftConflictMode();
                      var vMode = recallVisualMode();
                      var rSeq = (data && typeof data.seq === "number") ? data.seq : anchorSeq;
                      writePending(sessionId, {
                        type: "recall", targetKey: myKey, targetSeq: rSeq, draftText: text,
                        originalDraft: draftRef.current, conflictMode: cMode, visualMode: vMode,
                        updatedAt: Date.now()
                      });
                      var ia2 = props.inputActions;
                      if (ia2 && typeof ia2.setDraft === "function") {
                        ia2.setDraft(cMode === "merge" && draftRef.current !== "" ? draftRef.current + "\n" + text : text);
                      }
                      log("info", "recall", "pending set（确认关闭，直接待定）", { targetSeq: rSeq });
                    }
                  }, iconImg(ICONS.recall, L.recall), "recall-key"),
              // 编辑键：rewrite 关闭时显示（与撤回键同时）
              rewriteOnClick() ? null : actionButton("编辑", "编辑", function (e) {
                e.stopPropagation();
                enterEdit(e.currentTarget ? e.currentTarget.offsetWidth : 0);
              }, iconImg(ICONS.edit, "编辑")),
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
        "[data-dsh-easyrewrite] .dbe-icon-img{transition:filter .15s}" +
        "body[data-ds-dark-theme] [data-dsh-easyrewrite] .dbe-icon-img{filter:invert(1)}" +
        "@media (hover:hover){[data-dsh-easyrewrite][data-time-hover-root] .dbe-time{opacity:0;transition:opacity 80ms}" +
        "[data-dsh-easyrewrite][data-time-hover-root]:hover .dbe-time,[data-dsh-easyrewrite][data-time-hover-root]:focus-within .dbe-time{opacity:1}}" +
        "[data-dsh-easyrewrite=\"recall-bar\"] .dbe-recall-x:hover{background:var(--dsw-alias-interactive-bg-active,rgba(128,128,128,0.24));color:var(--dsw-alias-label-primary)}" +
        "[data-dsh-easyrewrite=\"version-pager\"] .dbe-pager-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,0.14));color:var(--dsw-alias-label-primary)}";
      document.head.appendChild(tag);
      return tag;
    }

    function apply(ctx) {
      ctx.effect(function () {
        var disposers = [];
        var styleTag = injectThemeStyle();
        try { if (typeof ctx.locale === "object" && ctx.locale !== null && typeof ctx.locale.register === "function") ctx.locale.register(NS, {}); } catch (e) { /* ignore */ }
        log("info", "lifecycle", "client half active");
        try { ctxConversationRef = ctx.conversation; } catch (e) { ctxConversationRef = null; }
          // 陈旧版本树键清扫（review #6：lineage 已接管；旧 localStorage 键为死数据，启动时一次清掉）
          try {
            var stale = [];
            for (var sk = 0; sk < localStorage.length; sk++) {
              var skey = localStorage.key(sk);
              if (skey && skey.indexOf("dsh-easyrewrite:versions:") === 0) stale.push(skey);
            }
            for (var sv = 0; sv < stale.length; sv++) localStorage.removeItem(stale[sv]);
            if (stale.length > 0) log("info", "lifecycle", "已清扫陈旧版本树键", { count: stale.length });
          } catch (e) { /* ignore */ }
        try {
          localeServiceRef = ctx.locale;
          if (localeServiceRef && typeof localeServiceRef.register === "function") {
            localeServiceRef.register(UI_NS, { zh: SETTINGS_I18N.zh, en: SETTINGS_I18N.en, ja: SETTINGS_I18N.ja });
          }
        } catch (e) { localeServiceRef = null; }
        // 撤回快捷键：全局 keydown（输入框未聚焦 + 当前会话最后一条 user 消息的撤回键）
        function onHotkeyKeydown(e) {
          try {
            if (hotkeyCaptureActive) return; // 录制中不触发
            if (!hotkeyEnabledSetting()) return; // 总开关关闭
            var hk = hotkeySetting();
            if (!hk || !keydownMatches(e, hk)) return; // 未设置键位
            var tgt = e.target;
            if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.tagName === "SELECT" || tgt.isContentEditable)) return;
            var cur = null;
            try { var sl = ctx.sessions.list.getSnapshot(); cur = sl ? sl.current : null; } catch (err) { cur = null; }
            if (!cur) return;
            var flowItems = document.querySelectorAll('[data-chat-flow-kind="user"]');
            if (!flowItems || flowItems.length === 0) return;
            var lastUser = flowItems[flowItems.length - 1];
            var recallKey = lastUser.querySelector('[data-dsh-easyrewrite="recall-key"]');
            if (!recallKey) return;
            e.preventDefault();
            recallKey.click();
            log("info", "hotkey", "快捷键触发撤回", { key: hotkeySetting() });
          } catch (err) { /* ignore */ }
        }
        window.addEventListener("keydown", onHotkeyKeydown, true);
        disposers.push(function () { window.removeEventListener("keydown", onHotkeyKeydown, true); });
        var d = ctx.slots.inject("conversation.chat.node", function () {
          return ctx.slots.register({
            name: "conversation.chat.node",
            key: "user",
            priority: -1,
            inject: function () {
              return {
                openSession: function (id) { ctx.sessions.open(id); },
                ctxWorkspaces: ctx.workspaces,
                ctxSessions: ctx.sessions,
                restoreSession: function (id) {
                  return fetch("/bubble/unarchive", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ sessionId: id }),
                    keepalive: true
                  }).then(function (r) { return r.json(); }).then(function (d) {
                    log("debug", "reset", "恢复完成（unarchive）", { sessionId: id, ok: !!(d && d.ok) });
                    return !!(d && d.ok);
                  }).catch(function () { return false; });
                },
              };
            }
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
                ctxSessions: ctx.sessions,
                restoreSession: function (id) {
                  return fetch("/bubble/unarchive", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ sessionId: id }),
                    keepalive: true
                  }).then(function (r) { return r.json(); }).then(function (d) {
                    log("debug", "reset", "恢复完成（unarchive）", { sessionId: id, ok: !!(d && d.ok) });
                    return !!(d && d.ok);
                  }).catch(function () { return false; });
                },
              };
            }
          }, RecallBanner);
        });
        if (typeof d3 === "function") disposers.push(d3);
        // 设置卡片（设置 → 插件 → 插件配置）
        var d4 = ctx.slots.inject("settings.plugin.item", function () {
          return ctx.slots.register({
            name: "settings.plugin.item",
            key: "dsh-easyrewrite",
            order: 30,
            inject: function () {
              return {
                openSession: function (id) { ctx.sessions.open(id); },
                ctxSessions: ctx.sessions
              };
            }
          }, EasyRewriteSettingsCard);
        });
        if (typeof d4 === "function") disposers.push(d4);
        // 版本翻页器 < X >：assistant 消息操作区（最后回答底部）
        var d5 = ctx.slots.inject("conversation.chat.assistant-actions", function () {
          return ctx.slots.register({
            name: "conversation.chat.assistant-actions",
            id: "dsh-easyrewrite-version-pager",
            order: 10,
            inject: function () {
              return {
                openSession: function (id) { ctx.sessions.open(id); },
                ctxSessions: ctx.sessions,
                archiveSession: function (id) {
                  // review #5：官方 archiveSession 幂等且 sessionKnown 接受归档会话（dsh-workspace L424/L439）——
                  // 旧观察"非 live 必抛"不成立，删 host /bubble/archive 中转，直调官方
                  try {
                    return Promise.resolve(ctx.workspaces.archiveSession(id)).then(function (ok) {
                      log("debug", "pager", "归档结果（官方直调）", { id: id, ok: ok !== false });
                      return ok !== false;
                    }).catch(function (e) {
                      log("warn", "pager", "归档失败（官方直调）", { id: id, err: String(e && e.message ? e.message : e) });
                      return false;
                    });
                  } catch (e) {
                    log("warn", "pager", "归档异常", { id: id, err: String(e && e.message ? e.message : e) });
                    return Promise.resolve(false);
                  }
                },
                currentSessionId: function () {
                  try { var s = ctx.sessions.list.getSnapshot(); return s ? s.current : null; } catch (e) { return null; }
                },
                restoreSession: function (id) {
                  return fetch("/bubble/unarchive", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ sessionId: id }),
                    keepalive: true
                  }).then(function (r) { return r.json(); }).then(function (d) {
                    if (d && d.ok && d.restored) log("info", "pager", "版本会话已恢复（unarchive）", { sessionId: id });
                    return !!(d && d.ok);
                  }).catch(function () { return false; });
                }
              };
            }
          }, VersionPager);
        });
        if (typeof d5 === "function") disposers.push(d5);
        return function () {
          for (var i = 0; i < disposers.length; i++) disposers[i]();
          if (styleTag !== null) styleTag.remove();
          log("info", "lifecycle", "client half unloaded");
        };
      }, "dsh-easyrewrite: UserBubbleView overlay");
    }

    return { name: "dsh-easyrewrite", inject: ["slots", "sessions", "workspaces", "conversation", "locale"], apply: apply };
  }
});
