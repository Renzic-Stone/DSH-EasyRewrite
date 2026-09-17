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
    function showOriginalImages() { return getBool("dsh-easyrewrite:showOriginalImages", true); }
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
            // v2.4.0：resolveImageCompat 双宿主兼容（rc.2 resolveImage / rc.1 imageUrl+loadImage）
            var url = await resolveImageCompat(sessionId, ref, props);
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
    var pendingAttachIds = [];
    var cachedEditMsg = {}; // 消息图refs缓存（渲染时填充，confirmEdit 异步回调读取） // 撤回确认时重建到输入框的图 id（× 取消时需移除）
    var latestInputImageIds = []; // 输入框当前图 id 镜像（UserBubbleView 渲染时喂入；发送时据此搬运）
    // ---------- 调试 API：撤回条实时调参（调试模式 dsh-easyrewrite:debug=1 时挂 window.__dshEasyRewrite.bar） ----------
    // 用法：__dshEasyRewrite.bar.get() 看现状（含计算样式）；.set({inset,size,radius,bg}) 实时调（立即生效，不落盘）；
    // .diagnose() 扫全样式表找压圆角的规则；.export() 导出 JSON（发给我固化进代码）。纯内存，刷新即还原。
    var barTune = { inset: null, size: null, radius: null, bg: null };
    function barApplyCircTune(xCirc) {
      // 圆钮调参重放：bar 因官方重渲染被重建时，placeBar 调用此函数恢复 size（inset 由 placeBar 自身处理）。
      // SVG 圆形底终稿后 radius/bg 调参退役（真圆不可变形；底色走 fill var 由 hover CSS 管）
      if (!xCirc) return;
      try {
        if (barTune.size !== null) {
          xCirc.style.width = barTune.size + "px";
          xCirc.style.height = barTune.size + "px";
          var svgEl = xCirc.querySelector("svg");
          if (svgEl) { svgEl.setAttribute("width", String(barTune.size)); svgEl.setAttribute("height", String(barTune.size)); svgEl.setAttribute("viewBox", "0 0 " + barTune.size + " " + barTune.size); }
        }
      } catch (eT) { /* ignore */ }
    }
    function barApplyTune() {
      try {
        var barEl = document.querySelector('[data-dsh-easyrewrite="recall-bar"]');
        if (!barEl) return "recall-bar 不在 DOM（需先进入撤回态）";
        var xCirc = barEl.querySelector(".dbe-recall-x-circ");
        var cardEl = document.querySelector('[data-composer-card="true"]');
        var firstImg = null;
        try { firstImg = cardEl ? cardEl.querySelector("img") : null; } catch (eI) { /* ignore */ }
        // inset 不在此处直接写 —— placeBar（effect 闭包）会在 MutationObserver 触发时无条件重写 padding，
        // 直接写会被瞬间覆盖（"set 了但没变化"的根因）。改为派发事件让 placeBar 用最新 barTune 重算。
        if (barTune.inset !== null) {
          try { document.dispatchEvent(new CustomEvent("dsh-easyrewrite:bar-tune")); } catch (eE) { /* ignore */ }
        }
        if (xCirc) barApplyCircTune(xCirc);
        return "applied: " + JSON.stringify(barTune);
      } catch (eA) { return "ERR: " + (eA && eA.message); }
    }
    function barDiagnose() {
      // 找出所有命中 .dbe-recall-x / -circ 且带 border-radius 的规则（含 !important），定位"压圆"真凶
      var hits = [];
      try {
        for (var si = 0; si < document.styleSheets.length; si++) {
          var sheet = document.styleSheets[si];
          var rules; try { rules = sheet.cssRules; } catch (eC) { continue; }
          if (!rules) continue;
          for (var ri = 0; ri < rules.length; ri++) {
            var t = rules[ri].cssText || "";
            if (t.indexOf("dbe-recall-x") !== -1 && t.indexOf("radius") !== -1) hits.push("sheet" + si + ": " + t.slice(0, 220));
          }
        }
      } catch (eD) { hits.push("ERR: " + (eD && eD.message)); }
      var out = { hits: hits };
      try {
        var c = document.querySelector(".dbe-recall-x-circ");
        if (c) {
          var cs = getComputedStyle(c);
          out.computed = { borderRadius: cs.borderRadius, width: cs.width, height: cs.height, display: cs.display, boxSizing: cs.boxSizing };
        } else out.computed = "circ 不在 DOM";
      } catch (eG) { out.computed = "ERR: " + (eG && eG.message); }
      return out;
    }
    // 图片桥接：旧会话 live 时把消息附件取成字节，注册进官方全局 draftAttachments 单例（不进输入框），
    // 返回新草稿 id 列表——供新会话 resume 时 addImages 使用（撤回键/气泡编辑两条路径共用）。
    async function bridgeSessionImages(sessionId, refs) {
      var out = [];
      try {
        if (!refs || !refs.length || !ctxConversationRef || typeof ctxConversationRef.createDraftImages !== "function") return out;
        var files = [];
        for (var i = 0; i < refs.length; i++) {
          var ref = refs[i];
          if (!ref || typeof ref.attachmentId !== "string") { log("warn", "attach", "桥接跳过：缺 attachmentId", { i: i }); continue; }
          try {
            var url = await resolveImageCompat(sessionId, ref, null);
            if (!url) { log("warn", "attach", "桥接空 URL", { attachmentId: ref.attachmentId }); continue; }
            var resp2 = await fetch(url);
            if (!resp2.ok) { log("warn", "attach", "桥接 fetch 失败", { status: resp2.status }); continue; }
            var blob = await resp2.blob();
            var nm = (ref.name && typeof ref.name === "string") ? ref.name : ("attachment." + (ref.mediaType === "image/png" ? "png" : (ref.mediaType === "image/jpeg" || ref.mediaType === "image/jpg" ? "jpg" : "img")));
            files.push(new File([blob], nm, { type: ref.mediaType || blob.type || "application/octet-stream" }));
          } catch (eOne) { log("warn", "attach", "桥接单个附件失败", { attachmentId: ref.attachmentId, err: String(eOne && eOne.message ? eOne.message : eOne) }); }
        }
        if (files.length > 0) {
          var imgs = ctxConversationRef.createDraftImages(files);
          out = imgs.map(function (im) { return im.id; });
          log("info", "attach", "图片桥接完成（进官方单例）", { count: out.length });
        }
      } catch (e) { log("warn", "attach", "bridgeSessionImages 异常", { err: String(e && e.message ? e.message : e) }); }
      return out;
    }
    // ---------- 编辑态图片持久化辅助（bug② 刷新恢复用）：File ↔ dataURL ----------
    function fileToDataUrl(file) {
      return new Promise(function (resolve, reject) {
        try {
          var fr = new FileReader();
          fr.onload = function () { resolve(String(fr.result)); };
          fr.onerror = function () { reject(fr.error || new Error("file-read-failed")); };
          fr.readAsDataURL(file);
        } catch (e) { reject(e); }
      });
    }
    function dataUrlToFile(dataUrl, name) {
      var parts = String(dataUrl).split(",");
      var mimeMatch = parts[0].match(/:(.*?);/);
      var mime = (mimeMatch && mimeMatch[1]) || "image/png";
      var bstr = atob(parts[1] || "");
      var u8 = new Uint8Array(bstr.length);
      for (var i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
      return new File([u8], name || "image." + (mime.split("/")[1] || "png"), { type: mime });
    }

    var ctxConversationRef = null; // apply 时注入 conversation 服务
    var ctxUiConversationRef = null; // v2.4.0: dsh 0.1.2 的 uiConversation 服务（弱引用；0.1.1-rc.2 无此服务时为 null）
    var ctxUiWorkspaceRef = null;    // v2.4.0: dsh 0.1.2 的 uiWorkspace 服务（弱引用）
    /** v2.4.0：图片 URL 解析双宿主兼容——props.loadImage（两代都有）/ rc.2 resolveImage / rc.1 uiConversation.imageUrl */
    async function resolveImageCompat(sessionId, ref, props) {
      if (props && typeof props.loadImage === "function") {
        try { var u1 = await props.loadImage(ref); if (u1) return u1; } catch (e1) { /* 次选 */ }
      }
      if (ctxConversationRef && typeof ctxConversationRef.resolveImage === "function") {
        try { var u2 = await ctxConversationRef.resolveImage(sessionId, ref); if (u2) return u2; } catch (e2) { /* 次选 */ }
      }
      if (ctxUiConversationRef && typeof ctxUiConversationRef.imageUrl === "function") {
        try { return await ctxUiConversationRef.imageUrl(sessionId, ref); } catch (e3) { /* ignore */ }
      }
      return null;
    }

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

    // ---------- dsh 宿主版本比较（v2.4.0） ----------
    var MIN_DSH_VERSION = "0.1.2-rc.1";
    var MAX_TESTED_DSH_VERSION = "0.1.2-rc.1";
    function dshVerRank(v) {
      var m = String(v || "").trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-(alpha|rc)\.(\d+))?$/);
      if (!m) return null;
      return { core: [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)], pre: m[4] ? (m[4] === "rc" ? 2 : 1) : 3, preNum: m[5] ? parseInt(m[5], 10) : 0 };
    }
    function cmpDsh(a, b) {
      var va = dshVerRank(a), vb = dshVerRank(b);
      if (!va || !vb) return 0;
      for (var i = 0; i < 3; i++) { if (va.core[i] !== vb.core[i]) return va.core[i] - vb.core[i]; }
      if (va.pre !== vb.pre) return va.pre - vb.pre;
      return va.preNum - vb.preNum;
    }

    // ---------- 宿主会话快照读取兼容层（v2.4.0） ----------
    // dsh 0.1.2 起 chat 快照经 useChat 提供（ChatSnapshot 直接形态：order + nodes.get + hasMore），
    // 0.1.1-rc.2 经 useSession（会话快照，chat 子对象）。这里统一返回 chat 快照形态；不可用返回 null。
    function hasChatSnapshot(props) {
      return !!(props && ((typeof props.useChat === "function") || (typeof props.useSession === "function")));
    }
    function getChatSnapshot(props) {
      try {
        if (props && typeof props.useChat === "function") return props.useChat(function (s) { return s; });
        if (props && typeof props.useSession === "function") {
          var s = props.useSession(function (x) { return x; });
          return s && s.chat ? s.chat : s;
        }
      } catch (eSnap) { /* ignore */ }
      return null;
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

    /** 定位主发送/停止按钮（官方 card 区域内） */
    function findPrimaryButton() {
      try {
        var card = document.querySelector("[data-composer-card]");
        if (!card) return null;
        var btns = card.querySelectorAll("button[aria-label]");
        for (var i = 0; i < btns.length; i++) {
          var al = (btns[i].getAttribute("aria-label") || "").toLowerCase();
          if (al.indexOf("发送") !== -1 || al.indexOf("send") !== -1 || al.indexOf("停止") !== -1 || al.indexOf("stop") !== -1) return btns[i];
        }
      } catch (e) { /* ignore */ }
      return null;
    }

    /** 判断按钮是否为运行中的「停止生成」按钮 */
    function isStopButton(btn) {
      if (!btn) return false;
      var al = (btn.getAttribute("aria-label") || "").toLowerCase();
      return al.indexOf("停止") !== -1 || al.indexOf("stop") !== -1;
    }

    var primaryButtonSendingTimer = null;
    /** 发送按钮置灰与状态锁：长对话 fork/切换期间置灰且设为不可点击，防二次击穿 */
    function setPrimaryButtonSendingState(sending) {
      try {
        var btn = findPrimaryButton();
        if (primaryButtonSendingTimer) {
          clearTimeout(primaryButtonSendingTimer);
          primaryButtonSendingTimer = null;
        }
        if (!btn) return;
        if (sending) {
          btn.setAttribute("data-dsh-easyrewrite-sending", "true");
          btn.disabled = true;
          btn.style.setProperty("opacity", "0.45", "important");
          btn.style.setProperty("pointer-events", "none", "important");
          btn.style.setProperty("cursor", "not-allowed", "important");
          btn.style.setProperty("filter", "grayscale(1)", "important");
          // 15 秒超时兜底解锁（防任何异常或宿主卡死导致按钮永久置灰）
          primaryButtonSendingTimer = setTimeout(function () {
            setPrimaryButtonSendingState(false);
          }, 15000);
        } else {
          btn.removeAttribute("data-dsh-easyrewrite-sending");
          btn.disabled = false;
          btn.style.removeProperty("opacity");
          btn.style.removeProperty("pointer-events");
          btn.style.removeProperty("cursor");
          btn.style.removeProperty("filter");
        }
      } catch (e) { /* ignore */ }
    }

    /** 安全打开会话：多重降级通道，确保可靠切换会话 */
    function safeOpenSession(targetId, props) {
      try {
        if (props && typeof props.openSession === "function") {
          props.openSession(targetId);
          return true;
        }
        if (props && props.ctxSessions && typeof props.ctxSessions.open === "function") {
          props.ctxSessions.open(targetId);
          return true;
        }
        if (ctxUiWorkspaceRef && typeof ctxUiWorkspaceRef.openSession === "function") {
          ctxUiWorkspaceRef.openSession(targetId);
          return true;
        }
      } catch (e) {
        log("error", "session", "切换会话异常", { targetId: targetId, err: String(e && e.message ? e.message : e) });
      }
      return false;
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
      var sendingRef = React.useRef(false);
      var barRef = React.useRef(null);

      React.useEffect(function () {
        if (!active) return;
        // 注意：textarea 是 absolute 定位（覆盖在 mirror 上），不能插进其父容器；
        // 条注入到输入滚动区（[data-input-scroll]）正前方——卡片内部、文本输入区上方，
        // 正常流布局不重叠，输入卡片随之向上扩展、文本位置不变。
        var scrollEl = document.querySelector("[data-input-scroll]");
        if (!scrollEl || !scrollEl.parentNode) return;
        var bar = document.createElement("div");
        barRef.current = bar;
        bar.setAttribute("data-dsh-easyrewrite", "recall-bar");
        // bar 外挂且宽度动态=card 宽 → 左右零 margin/padding，label 与 × 直达 card 左右边缘（与输入框严格对齐；
        // margin:0 16px + 水平 padding 是分割线时代遗物，2026-09-04 用户反馈"离边框有点距离"后移除）
        // 内容靠上（相对分割线留出下间距）；标签灰色药丸底；× 圆形底（hover 高亮见注入样式）
        bar.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin:0;padding:2px 0 6px;";
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
        xBtn.style.cssText = "border:none;cursor:pointer;transform:translateY(-1px);padding:0;background:transparent;display:inline-flex;align-items:center;justify-content:center;flex:none;";
        // 圆形底终稿（2026-09-04）：SVG <circle> 画底——border-radius 被宿主某条未知规则吃掉（涂红实测是圆角方块），
        // SVG 几何不受任何 CSS 圆角模板影响，保证真圆。× 字符绝对定位居中。hover 态用 fill 过渡 + 注入样式色变。
        var xCirc = document.createElement("span");
        xCirc.className = "dbe-recall-x-circ";
        // 22px：用户反馈 26.4 太大（2026-09-04）；viewBox 保持 26.4 等比缩放，描边 2.2 补偿缩小变细
        xCirc.style.cssText = "position:relative;width:22px;height:22px;display:block;pointer-events:none;";
        var NSX = "http://www.w3.org/2000/svg";
        var xSvg = document.createElementNS(NSX, "svg");
        xSvg.setAttribute("width", "22");
        xSvg.setAttribute("height", "22");
        xSvg.setAttribute("viewBox", "0 0 26.4 26.4");
        xSvg.style.cssText = "display:block;width:100%;height:100%;";
        var xCircleEl = document.createElementNS(NSX, "circle");
        xCircleEl.setAttribute("cx", "13.2");
        xCircleEl.setAttribute("cy", "13.2");
        xCircleEl.setAttribute("r", "13.2");
        xCircleEl.setAttribute("class", "dbe-recall-x-bg");
        xCircleEl.setAttribute("fill", "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.14))");
        xSvg.appendChild(xCircleEl);
        // × 用两条对角线画（几何级居中，无字体基线/transform 补偿问题——字符方案实测偏左下）
        var xGlyph = document.createElementNS(NSX, "g");
        xGlyph.setAttribute("class", "dbe-recall-x-glyph");
        xGlyph.setAttribute("stroke", "var(--dsw-alias-label-secondary)");
        xGlyph.setAttribute("stroke-width", "2.2");
        xGlyph.setAttribute("stroke-linecap", "round");
        var l1 = document.createElementNS(NSX, "line");
        l1.setAttribute("x1", "8.2"); l1.setAttribute("y1", "8.2");
        l1.setAttribute("x2", "18.2"); l1.setAttribute("y2", "18.2");
        var l2 = document.createElementNS(NSX, "line");
        l2.setAttribute("x1", "18.2"); l2.setAttribute("y1", "8.2");
        l2.setAttribute("x2", "8.2"); l2.setAttribute("y2", "18.2");
        xGlyph.appendChild(l1);
        xGlyph.appendChild(l2);
        xSvg.appendChild(xGlyph);
        xCirc.appendChild(xSvg);
        xBtn.appendChild(xCirc);
        xBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          var ia = props.inputActions;
          if (ia && typeof ia.setDraft === "function" && typeof pending.originalDraft === "string") {
            ia.setDraft(pending.originalDraft); // 恢复输入框原草稿（覆盖/合并统一恢复）
          }
          // 取消撤回：目标终态=仅保留用户确认前已有的图（preUserImageIds）；移除其余（重建的消息图等）
          // v2.4.0 rc.1联测修复：清理步骤拆为独立防御段（每段单独try+日志），任何一段失败不拖垮其余；
          // 输入态读取双宿主兼容（props.useInput / props.inputState）
          var keepArr = Array.isArray(pending.preUserImageIds) ? pending.preUserImageIds : [];
          var curX = [];
          try {
            // v2.4.0 rc.1：inputState 即 shell 实例（imageIds 为公开字段）——禁止经 props.useInput 调 hook（React #321）
            var sX = props.inputState || null;
            if (sX && Array.isArray(sX.imageIds)) curX = sX.imageIds.slice();
          } catch (eRead) { log("warn", "recall", "× 读取输入框图片清单失败", { err: String(eRead && eRead.message ? eRead.message : eRead) }); }
          var removedAny = false;
          if (ia && typeof ia.removeImage === "function") {
            for (var ci = 0; ci < curX.length; ci++) {
              if (keepArr.indexOf(curX[ci]) !== -1) continue;
              try { ia.removeImage(curX[ci]); removedAny = true; } catch (e3) { log("warn", "recall", "× removeImage 单项失败", { id: curX[ci], err: String(e3 && e3.message ? e3.message : e3) }); }
            }
          }
          if (curX.length > 0 && ia && typeof ia.pruneImages === "function") {
            try { ia.pruneImages(keepArr); } catch (e4) { log("warn", "recall", "× pruneImages 失败", { err: String(e4 && e4.message ? e4.message : e4) }); }
          }
          log("info", "recall", "× 清理完成", { before: curX.length, keep: keepArr.length, removedAny: removedAny });
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
            // 对齐锚点（2026-09-04 用户定稿）：带图=label 左缘对齐第一张小预览图的左缘；纯文字=card 圆角零点。
            // X 右缘对称内缩同值。实测 DOM 而非猜数字，官方改预览区内边距也自动跟随。
            // 两锚点各配各的固化偏移（均为负=向外）：带图 -7、纯文字 -16（用户调试台分别实测，2026-09-04 定稿）；
            // barTune.inset（调试 API set）非 null 时为覆盖语义（相对锚点的绝对偏移），null=用固化值
            var TUNE_WITH_IMG = -7;
            var TUNE_TEXT_ONLY = -16;
            var inset = 16;
            try {
              var firstImg = cEl.querySelector("img");
              var cRect = cEl.getBoundingClientRect();
              var anchor = null, tune = null;
              if (firstImg) {
                anchor = firstImg.getBoundingClientRect().left - cRect.left;
                tune = TUNE_WITH_IMG;
              } else {
                anchor = parseFloat(getComputedStyle(cEl).borderTopLeftRadius) || 16;
                tune = TUNE_TEXT_ONLY;
              }
              if (anchor !== null) inset = Math.max(0, anchor + (barTune.inset !== null ? barTune.inset : tune));
            } catch (eR) { /* ignore */ }
            bar.style.paddingLeft = inset + "px";
            bar.style.paddingRight = inset + "px";
            // 官方重渲染重建 bar 后恢复圆钮调参（size/radius/bg），否则第二次进入撤回态调参"失效"
            barApplyCircTune(bar.querySelector(".dbe-recall-x-circ"));
          } catch (e) { /* ignore */ }
        }
        placeBar();
        // 调参事件：__dshEasyRewrite.bar.set({inset}) → 重算（barTune 已更新，placeBar 读它）
        var onBarTune = function () { try { placeBar(); } catch (eBT) { /* ignore */ } };
        document.addEventListener("dsh-easyrewrite:bar-tune", onBarTune);
        // MutationObserver：官方重渲染 composer（如点击图片删除键）挤掉 bar 后自动复位，× 一直可用
        var mo = null;
        try {
          mo = new MutationObserver(function () { try { placeBar(); } catch (e) { /* ignore */ } });
          var obCard = cardEl || (document.querySelector('[data-composer-card="true"]') || null);
          if (obCard) mo.observe(obCard, { childList: true, subtree: true });
        } catch (e) { /* ignore */ }
        return function () {
          try { if (mo) mo.disconnect(); } catch (e) { /* ignore */ }
          try { document.removeEventListener("dsh-easyrewrite:bar-tune", onBarTune); } catch (eBT2) { /* ignore */ }
        var onWinResize = function () { try { placeBar(); } catch (e) { /* ignore */ } };
        window.addEventListener("resize", onWinResize);
          try { window.removeEventListener("resize", onWinResize); } catch (e4) { /* ignore */ }
          if (bar.parentNode) bar.parentNode.removeChild(bar);
          barRef.current = null;
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

      // ---- 草稿自动备份（无感）：pending 存在且超过 10s 后，若有新改动则每 5s 覆盖备份一次 ----
      var lastBackupMetaRef = React.useRef({});
      React.useEffect(function () {
        if (!active || !pending) return;
        var meta = lastBackupMetaRef.current[sessionId] || (lastBackupMetaRef.current[sessionId] = { time: 0, updatedAt: 0 });
        function backupNow() {
          try {
            var currentUpdatedAt = pending.updatedAt || 0;
            meta.time = Date.now();
            meta.updatedAt = currentUpdatedAt;
            fetch("/bubble/backup", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId: sessionId, pending: pending }),
              keepalive: true
            }).catch(function (e) {
              log("warn", "backup", "自动备份请求失败", { err: String(e && e.message ? e.message : e) });
            });
          } catch (e) { /* 静默 */ }
        }
        var timer = setInterval(function () {
          var age = Date.now() - (pending.updatedAt || 0);
          // 仅在满 10s，且距离上次备份已过 5s，且该版本草稿尚未备份过时才发起
          if (age >= 10000 && Date.now() - meta.time >= 5000 && pending.updatedAt !== meta.updatedAt) {
            backupNow();
          }
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
      // （findPrimaryButton / isStopButton / setPrimaryButtonSendingState 在模块级已定义）
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
          if (!hasChatSnapshot(props)) return null; // 无法本地判定 → host fallback
          var snapshot = getChatSnapshot(props);
          if (!snapshot || !Array.isArray(snapshot.order) || !snapshot.nodes || typeof snapshot.nodes.get !== "function") return null;
          var order = snapshot.order;
          var tIdx = -1;
          for (var i = 0; i < order.length; i++) {
            var nd = snapshot.nodes.get(order[i]);
            if (!nd || nd.kind !== "user") continue;
            var sq = nd.data && typeof nd.data.seq === "number" ? nd.data.seq : (typeof nd.anchorSeq === "number" ? nd.anchorSeq : -1);
            if (sq === targetSeq) { tIdx = i; break; }
          }
          if (tIdx === -1) return null; // 目标不在快照 → host fallback
          for (var k = tIdx - 1; k >= 0; k--) {
            var n2 = snapshot.nodes.get(order[k]);
            if (!n2 || n2.kind !== "turn-tail") continue;
            var cl = n2.data && n2.data.closing;
            if (cl && cl.finalNode && typeof cl.finalNode.seq === "number") return { atSeq: cl.finalNode.seq };
            // closing 缺失（纯工具/无文本回合）→ 回退尾节点自身 seq（官方槽位同款 closing?.finalNode.seq ?? data.seq），
            // 跳过会把边界推得更早、整段误切
            if (n2.data && typeof n2.data.seq === "number") return { atSeq: n2.data.seq };
          }
          var hasMore = snapshot.hasMore === true;
          return hasMore ? { code: "host-fallback" } : { code: "no-boundary" };
        } catch (e) {
          log("warn", "recall", "本地边界计算异常", { err: String(e && e.message ? e.message : e) });
          return null;
        }
      }

      // 稳健读取输入框当前文本：DOM 物理渲染优先 + projection 编辑器层 + state 快照兜底
      function readCurrentComposerText(fallbackText) {
        var domVal = "";
        var projVal = "";
        var snapVal = "";
        var ishell = props.inputState || null;

        // 1) DOM 物理读取（最高优先级）：直接获取用户在页面中实时敲入的内容（兼容 contenteditable 与 textarea）
        try {
          var el = document.querySelector([
            "[data-input-scroll] [contenteditable='true']",
            "[data-input-scroll] textarea",
            "[data-composer-card='true'] [contenteditable='true']",
            "[data-composer-card='true'] textarea",
            "[contenteditable='true']",
            "textarea"
          ].join(","));
          if (el) {
            if (el.isContentEditable || el.getAttribute("contenteditable") === "true") {
              var t = typeof el.innerText === "string" ? el.innerText : (el.textContent || "");
              domVal = t.replace(/\r?\n$/g, "");
            } else if (typeof el.value === "string") {
              domVal = el.value;
            }
          }
        } catch (eDom) { /* ignore */ }

        // 2) 官方 Lexical 编辑器 projection 剪贴板文本
        try {
          if (ishell && ishell.projection && typeof ishell.projection.clipboardText === "string") {
            projVal = ishell.projection.clipboardText;
          }
        } catch (eProj) { /* ignore */ }

        // 3) 官方 state 快照（注意：打字过程中官方并未调用 publish，仅初次 setDraft 时落入）
        try {
          if (ishell && ishell.state && typeof ishell.state.getSnapshot === "function") {
            var snap = ishell.state.getSnapshot();
            if (snap && typeof snap.draft === "string") snapVal = snap.draft;
          } else if (ishell && typeof ishell.draft === "string") {
            snapVal = ishell.draft;
          }
        } catch (eSnap) { /* ignore */ }

        var chosen = fallbackText;
        var source = "fallback";

        if (domVal !== "") {
          chosen = domVal;
          source = "dom";
        } else if (projVal !== "") {
          chosen = projVal;
          source = "projection";
        } else if (snapVal !== "") {
          chosen = snapVal;
          source = "snapshot";
        }

        log("info", "recall", "输入框文本读取诊断", {
          source: source,
          chosenLen: typeof chosen === "string" ? chosen.length : 0,
          domLen: domVal.length,
          projLen: projVal.length,
          snapLen: snapVal.length,
          fallbackLen: typeof fallbackText === "string" ? fallbackText.length : 0
        });

        return chosen;
      }

      async function doRecallThenSend(p) {
        if (sendingRef.current) return;
        sendingRef.current = true;
        setPrimaryButtonSendingState(true);

        // 视觉反馈：更新撤回条标签为「正在准备新会话…」
        try {
          if (barRef.current) {
            var labelEl = barRef.current.querySelector("span");
            if (labelEl) {
              labelEl.textContent = L.preparingSession || "正在准备新会话…";
              labelEl.style.opacity = "0.75";
            }
          }
        } catch (eUi) { /* ignore */ }

        try {
          var sid = props.sessionId;
          // 读取输入框当前文本（用户可能已修改）：重置/重发都使用修改后的内容
          var sendText = readCurrentComposerText(p.draftText);
          // 极限场景判定（v2.4.0 改约）：窗口化快照上的 isFirstUserMessage 会误判（窗口起点=目标消息即误报首条），
          // 首条/截断场景统一交给宿主判定树——/bubble/recall 返回 no-boundary/turn-open 时再走 resetConversation。
          // 本地只保留快照可判时的提前短路（no-boundary）。
          // v2.1.1：fork 前捕获当前模型/思考挡位（选择器真值），随 resume 标记带到新会话
          var msel = props.modelSel ? props.modelSel.capture(sid) : null;
          // review L5：日志去内容化（只记长度，不落明文）
          log("info", "recall", "发送内容（修改后）", { sendLen: sendText.length, modelSel: !!msel });
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
            resetConversation(sid, "edit", sendText, props, latestInputImageIds.slice());
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
                resetConversation(sid, "edit", sendText, props, latestInputImageIds.slice());
              } else {
                showRecallError(L.errGeneric);
                setPrimaryButtonSendingState(false);
                sendingRef.current = false;
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
            setPrimaryButtonSendingState(false);
            sendingRef.current = false;
            if (/has not completed the turn/i.test(em)) {
              showRecallError(L.turnOpenNotice || L.errGeneric); // 回合未结束：等待回复完成
            } else if (/has no completed turn to fork from/i.test(em)) {
              showRecallError(L.resetNotice);
              resetConversation(sid, "edit", sendText, props, latestInputImageIds.slice());
            } else {
              showRecallError(L.errGeneric);
            }
            return;
          }
          // review M6：resume-send 带时间戳（30s TTL，防陈旧草稿幽灵自动发送）
          try { localStorage.setItem("dsh-easyrewrite:resume-send:" + newId, JSON.stringify({ draftText: sendText, t: Date.now(), imageIds: imgIds, sel: msel })); } catch (e) { /* ignore */ }
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

          // 稳健切换会话（多重通道与降级）
          var opened = safeOpenSession(newId, props);
          if (!opened) {
            log("error", "recall", "打开新会话失败，回滚状态", { newId: newId });
            try { localStorage.removeItem("dsh-easyrewrite:resume-send:" + newId); } catch (e) {}
            setPrimaryButtonSendingState(false);
            sendingRef.current = false;
            showRecallError(L.errGeneric);
            return;
          }

          // 确认会话切换派发成功后再清除 pending 数据（保持 sendingRef 保护，直到组件随新会话打开而卸载）
          writePending(sid, null);
        } catch (err) {
          log("error", "recall", "撤回请求失败（发送中止）", { err: String(err && err.message ? err.message : err) });
          setPrimaryButtonSendingState(false);
          sendingRef.current = false;
        }
      }
      React.useEffect(function () {
        if (!active && !sendingRef.current) return;
        var p = pending;
        function onKeyDownCapture(e) {
          if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
          var el = document.querySelector("[data-input-scroll] [contenteditable='true'], [data-input-scroll] textarea, [data-composer-card='true'] [contenteditable='true'], [data-composer-card='true'] textarea, textarea");
          var isComposer = false;
          if (el) {
            isComposer = (e.target === el || el.contains(e.target));
          } else if (e.target && (e.target.isContentEditable || e.target.tagName === "TEXTAREA")) {
            isComposer = true;
          }
          if (!isComposer) return;
          e.preventDefault();
          e.stopPropagation();
          if (sendingRef.current) return; // 正在切换会话，坚决阻断重复触发
          if (p) doRecallThenSend(p);
        }
        function onClickCapture(e) {
          var btn = findPrimaryButton();
          if (!btn || !btn.contains(e.target)) return;
          if (isStopButton(btn)) return; // review M1：停止生成照常放行，不劫持
          e.preventDefault();
          e.stopPropagation();
          if (sendingRef.current) return; // 正在切换会话，坚决阻断重复触发
          if (p) doRecallThenSend(p);
        }
        document.addEventListener("keydown", onKeyDownCapture, true);
        document.addEventListener("click", onClickCapture, true);
        return function () {
          document.removeEventListener("keydown", onKeyDownCapture, true);
          document.removeEventListener("click", onClickCapture, true);
          setPrimaryButtonSendingState(false);
        };
      }, [active, sessionId, pending]);

      // ---- 恢复发送：切换到新会话后，回填草稿并自动提交 ----
      // 健壮化（T315#3）：旧实现进入即删标记、单次尝试——若挂载瞬间 composer 未就绪会静默丢草稿；
      // 现改为：标记保留到真正可发送才消费；轮询 inputActions 就绪（100ms×50）；卸载中断则保留标记，
      // 下次进入该会话在 TTL 内自动重试；每个分支都落日志（日志自己读得懂）。
      var resumeKey = "dsh-easyrewrite:resume-send:" + sessionId;
      React.useEffect(function () {
        var raw = null;
        try { raw = localStorage.getItem(resumeKey); } catch (e) { /* ignore */ }
        if (!raw) return;
        var r = null;
        try { r = JSON.parse(raw); } catch (e) { /* ignore */ }
        if (!r || typeof r.draftText !== "string") {
          try { localStorage.removeItem(resumeKey); } catch (e2) { /* ignore */ }
          log("warn", "recall", "resume 标记损坏已清除", { sessionId: sessionId });
          return;
        }
        // review M6：TTL 30 秒——过期（延迟打开/陈旧）不自动发送
        if (typeof r.t === "number" && Date.now() - r.t > 30000) {
          try { localStorage.removeItem(resumeKey); } catch (e3) { /* ignore */ }
          log("warn", "recall", "resume 过期（30s TTL），不自动发送", { sessionId: sessionId });
          return;
        }
        var tries = 0;
        var timer = setInterval(function () {
          tries++;
          var ia = props.inputActions;
          if (!(ia && typeof ia.setDraft === "function" && typeof ia.submit === "function")) {
            if (tries >= 50) {
              clearInterval(timer);
              log("error", "recall", "resume 放弃：composer 5s 未就绪（标记保留待重试）", { sessionId: sessionId, tries: tries });
            }
            return; // 标记未消费——卸载/下次挂载可重试（TTL 兜底）
          }
          clearInterval(timer);
          try { localStorage.removeItem(resumeKey); } catch (e4) { /* ignore */ }
          try {
            ia.setDraft(r.draftText);
            log("info", "recall", "resume：回填草稿并自动发送", { sessionId: sessionId, tries: tries, imgs: Array.isArray(r.imageIds) ? r.imageIds.length : 0, hasSel: !!(r.sel && props.modelSel) });
            // 图片桥接（review #3 简化版）：官方 draftAttachments 全局单例跨会话存活——
            // resume 直接 addImages(发送瞬间的 imageIds) 后 submit；消息内容完全由我们构造，无需校验。
            var savedIds = Array.isArray(r.imageIds) ? r.imageIds : [];
            if (savedIds.length > 0 && typeof ia.addImages === "function") {
              try { ia.addImages(savedIds); } catch (e) { log("warn", "attach", "addImages 异常（忽略，文字照发）", { err: String(e && e.message ? e.message : e) }); }
            }
            // Issue #10 深度防御：清空宿主 fork 继承而来的悬空 next-turn 幽灵队列
            // DSH 的 sessions.fork 机制会贪婪复制 turn/end 到 turn/start 之间的非回合事件，
            // 导致目标消息当初发送时的 agent/inbox/spliced 入队事件被复制到新会话，
            // 而出队事件被截断丢弃，从而在新会话留下一条幽灵消息。
            // 在提交新消息前，必须把新会话中残留的幽灵项全数移除，确保新消息排在队首第一位被消费。
            var cleanGhostQueue = function () {
              try {
                var binding = (props.ctxSessions && typeof props.ctxSessions.binding === "function")
                  ? props.ctxSessions.binding(sessionId)
                  : null;
                var sessInst = binding ? binding.session : null;
                var qItems = (sessInst && typeof sessInst.getSnapshot === "function")
                  ? sessInst.getSnapshot().queue
                  : ((props.session && Array.isArray(props.session.queue)) ? props.session.queue : []);
                var ghostItems = Array.isArray(qItems) ? qItems.filter(function (it) { return it && it.id; }) : [];
                if (ghostItems.length > 0) {
                  log("info", "recall", "检测到 fork 继承的幽灵队列项，开始清理", {
                    sessionId: sessionId,
                    count: ghostItems.length,
                    ids: ghostItems.map(function (it) { return it.id; })
                  });
                  var pList = [];
                  for (var gi = 0; gi < ghostItems.length; gi++) {
                    var gId = ghostItems[gi].id;
                    if (sessInst && typeof sessInst.updateQueue === "function") {
                      try {
                        pList.push(sessInst.updateQueue(gId, { kind: "remove" }));
                      } catch (eUp) {
                        log("warn", "recall", "调用 updateQueue 异常", { id: gId, err: String(eUp && eUp.message ? eUp.message : eUp) });
                      }
                    } else if (typeof props.updateQueue === "function") {
                      try {
                        pList.push(props.updateQueue(gId, { kind: "remove" }));
                      } catch (eUp2) {
                        log("warn", "recall", "调用 props.updateQueue 异常", { id: gId, err: String(eUp2 && eUp2.message ? eUp2.message : eUp2) });
                      }
                    }
                  }
                  if (pList.length > 0) {
                    return Promise.allSettled(pList).then(function () {
                      log("info", "recall", "幽灵队列项清理完成", { count: pList.length });
                    });
                  }
                }
              } catch (eClean) {
                log("warn", "recall", "清理幽灵队列异常（跳过继续发送）", { err: String(eClean && eClean.message ? eClean.message : eClean) });
              }
              return Promise.resolve();
            };

            var doSubmit = function () {
              cleanGhostQueue().then(function () {
                setTimeout(function () {
                  try {
                    ia.submit();
                    log("info", "recall", "resume 已提交", { sessionId: sessionId });
                    // Phase 2：底部暂存草稿及图片在新会话中回填保留（隔离发送，不混入气泡重发消息）
                    if (r.stagedDraft && (r.stagedDraft.text || (Array.isArray(r.stagedDraft.imageIds) && r.stagedDraft.imageIds.length > 0))) {
                      setTimeout(function () {
                        try {
                          var stg = r.stagedDraft;
                          if (typeof stg.text === "string" && stg.text.length > 0 && typeof ia.setDraft === "function") {
                            ia.setDraft(stg.text);
                          }
                          var stgImgs = Array.isArray(stg.imageIds) ? stg.imageIds : [];
                          if (stgImgs.length > 0 && typeof ia.addImages === "function") {
                            ia.addImages(stgImgs);
                          }
                          log("info", "recall", "resume 第二阶段：底部暂存草稿及图片已回填", {
                            hasText: !!(stg.text && stg.text.length > 0),
                            imgCount: stgImgs.length
                          });
                        } catch (eStg) {
                          log("warn", "recall", "回填暂存草稿异常", { err: String(eStg && eStg.message ? eStg.message : eStg) });
                        }
                      }, 160);
                    }
                  } catch (e) { log("error", "recall", "自动发送失败（resume）", { err: String(e && e.message ? e.message : e) }); }
                }, 60);
              });
            };
            // v2.1.1：先把捕获的原模型/挡位写进新会话（官方 selectModel 持久化通道），再自动发送
            if (r.sel && props.modelSel) {
              props.modelSel.apply(sessionId, r.sel).then(doSubmit, doSubmit);
            } else {
              doSubmit();
            }
          } catch (eRun) {
            log("error", "recall", "resume 执行异常", { sessionId: sessionId, err: String(eRun && eRun.message ? eRun.message : eRun) });
          }
        }, 100);
        return function () { clearInterval(timer); };
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
      // 扩展："100%" 撑满消息行（此前写死 748px 是旧窗口宽度遗物——内容列更宽时左侧够不到其他文字的左对齐线，2026-09-04 用户实测反馈）
      if (mode === "extended") return "100%";
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
        preparingSession: "正在准备新会话…",
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
        versionCount: "个版本",
        modelMenu: "模型",
        effortMenu: "推理等级",
        effortDefault: "Default",
        modelsLoading: "正在刷新模型列表…",
        modelsEmpty: "没有可用的模型。",
        dshLowWarning: "当前 dsh（{cur}）低于本插件要求的最低版本（{min}）——请先升级 dsh：",
        dshNewNotice: "当前 dsh（{cur}）较新，本插件的适配评估中，如遇异常请回退 dsh 或关注更新",
        suggestAutoCheck: "建议开启「每日检查更新」：dsh 升级频繁，及时更新插件可避免兼容问题",
        enableNow: "一键开启",
        remindIgnore: "不再显示",
        copyUpgradeCmd: "复制升级命令",
        dzFull: "拖入此处添加图片至正在编辑的消息",
        dzCompact: "插入图片",
        showOriginalImages: "撤回待定时查看原文显示图片"
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
        preparingSession: "Preparing new session…",
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
        versionCount: "versions",
        modelMenu: "Model",
        effortMenu: "Reasoning effort",
        effortDefault: "Default",
        modelsLoading: "Refreshing model list…",
        modelsEmpty: "No models available.",
        dshLowWarning: "Your dsh ({cur}) is below the minimum required by this plugin ({min}) — please upgrade dsh first:",
        dshNewNotice: "Your dsh ({cur}) is newer than the tested range; compatibility is being evaluated",
        suggestAutoCheck: "Enable daily update checks: dsh updates frequently, keeping the plugin current avoids compatibility issues",
        enableNow: "Enable",
        remindIgnore: "Don't show again",
        copyUpgradeCmd: "Copy upgrade command",
        dzFull: "Drop to add images to the message being edited",
        dzCompact: "Insert image",
        showOriginalImages: "Show images when viewing original text while pending"
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
        preparingSession: "新しいセッションを準備中…",
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
        versionCount: "バージョン",
        modelMenu: "モデル",
        effortMenu: "推論レベル",
        effortDefault: "Default",
        modelsLoading: "モデル一覧を更新中…",
        modelsEmpty: "利用可能なモデルがありません。",
        dshLowWarning: "現在の dsh（{cur}）は本プラグインの最低要件（{min}）を下回っています——先に dsh をアップグレードしてください：",
        dshNewNotice: "現在の dsh（{cur}）は検証済み範囲より新しいため、適合を評価中です",
        suggestAutoCheck: "「毎日更新を確認」の有効化を推奨：dsh の更新が頻繁なため、プラグインを最新に保つと互換性問題を回避できます",
        enableNow: "有効にする",
        remindIgnore: "今後表示しない",
        copyUpgradeCmd: "アップグレードコマンドをコピー",
        dzFull: "ドロップして編集中のメッセージに画像を追加",
        dzCompact: "画像を挿入",
        showOriginalImages: "取り消し待ちの原文表示で画像を表示"
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
      var sDshVer = React.useState(null);
      var dshVer = sDshVer[0];
      var setDshVer = sDshVer[1];
      var sRemindClosed = React.useState(getBool("dsh-easyrewrite:autoCheckReminded", false));
      var remindClosed = sRemindClosed[0];
      var setRemindClosed = sRemindClosed[1];
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
          setDshVer(typeof d.dshVersion === "string" ? d.dshVersion : null);
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
      // review A1-5：showOriginalImages 开关的 hook 必须在顶层无条件调用——原先包在 open? 分支内的 IIFE 里，
      // 展开卡片瞬间 hook 数 +1 → React #300 → 设置卡片点不开（2b94851 引入，2026-09-04 用户实测复现）
      var sOrigImg = React.useState(showOriginalImages());
      var origImg = sOrigImg[0];
      var setOrigImg = sOrigImg[1];

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
            switchRow(L.showOriginalImages, origImg, function (v) { setOrigImg(v); setBool("dsh-easyrewrite:showOriginalImages", v); }),
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
              (function () {
                if (!dshVer) return null;
                if (cmpDsh(dshVer, MIN_DSH_VERSION) < 0) return React.createElement("div", { key: "dsh-low", style: { display: "flex", flexDirection: "column", gap: "4px", padding: "6px 8px", background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))", borderRadius: "8px" } },
                  React.createElement("span", { style: { fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-primary)" } }, L.dshLowWarning.replace("{cur}", dshVer).replace("{min}", MIN_DSH_VERSION)),
                  React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px" } },
                    React.createElement("code", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1" } }, "npm install -g @deepseek-ai/dsh@" + MIN_DSH_VERSION),
                    React.createElement("button", { type: "button", style: { appearance: "none", border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))", background: "transparent", color: "var(--dsw-alias-label-secondary)", borderRadius: "6px", padding: "2px 8px", fontSize: "11px", cursor: "pointer", fontFamily: "inherit", flex: "none" }, onClick: function () { try { legacyCopy("npm install -g @deepseek-ai/dsh@" + MIN_DSH_VERSION); } catch (eC1) { /* ignore */ } } }, L.copyUpgradeCmd)
                  )
                );
                if (cmpDsh(MAX_TESTED_DSH_VERSION, dshVer) < 0) return React.createElement("div", { key: "dsh-new", style: { padding: "6px 8px", fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-secondary)", background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08))", borderRadius: "8px" } }, L.dshNewNotice.replace("{cur}", dshVer));
                return null;
              })(),
              !remindClosed && !getBool("dsh-easyrewrite:autoCheckUpdate", false) ? React.createElement("div", { key: "remind", style: { display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px", background: "rgba(77,107,254,0.08)", borderRadius: "8px" } },
                React.createElement("span", { style: { fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-primary)", flex: "1", minWidth: "0" } }, L.suggestAutoCheck),
                React.createElement("button", { type: "button", style: { appearance: "none", border: "none", background: "var(--dsw-static-deepseek-500, #4d6bfe)", color: "#ffffff", borderRadius: "6px", padding: "3px 10px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", flex: "none" }, onClick: function () { setBool("dsh-easyrewrite:autoCheckUpdate", true); setBool("dsh-easyrewrite:autoCheckReminded", true); setAutoCheckOn(true); setRemindClosed(true); } }, L.enableNow),
                React.createElement("button", { type: "button", title: L.remindIgnore, style: { appearance: "none", border: "none", background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.16))", color: "var(--dsw-alias-label-secondary)", borderRadius: "6px", padding: "3px 10px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", flex: "none" }, onClick: function () { setBool("dsh-easyrewrite:autoCheckReminded", true); setRemindClosed(true); } }, L.remindIgnore)
              ) : null,
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
        var snap = getChatSnapshot(props);
        if (snap && Array.isArray(snap.order) && snap.nodes && typeof snap.nodes.get === "function") {
          var ord = snap.order;
          for (var oi = 0; oi < ord.length; oi++) {
            var on = snap.nodes.get(ord[oi]);
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
    function resetConversation(sessionId, mode, text, props, imageIds, selOverride, stagedDraft) {
      log("info", "reset", "首条消息重置对话", { sessionId: sessionId, mode: mode });
      // v2.1.1：目标会话（父版本或空白新会话）发送前需要恢复当前模型/挡位
      // v2.2：气泡编辑 chip 的本地选择优先（selOverride），撤回键路径不传 → 原语义
      var msel = selOverride || (props.modelSel ? props.modelSel.capture(sessionId) : null);
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
            try { localStorage.setItem("dsh-easyrewrite:resume-send:" + parentId, JSON.stringify({ draftText: text, t: Date.now(), imageIds: imageIds || [], sel: msel, stagedDraft: stagedDraft || null })); } catch (e) { /* ignore */ }
          }
          var doOpenParent = function () {
            safeOpenSession(parentId, props);
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
        var wsConnector = (ctxUiWorkspaceRef && typeof ctxUiWorkspaceRef.connectWorkspace === "function") ? ctxUiWorkspaceRef : ((props.ctxWorkspaces && typeof props.ctxWorkspaces.connectWorkspace === "function") ? props.ctxWorkspaces : null);
        if (wsId && wsConnector) {
          wsConnector.connectWorkspace(wsId).then(function (newId) {
            if (!newId) return;
            if (mode === "edit" && typeof text === "string") {
              try { localStorage.setItem("dsh-easyrewrite:resume-send:" + newId, JSON.stringify({ draftText: text, t: Date.now(), imageIds: imageIds || [], sel: msel, stagedDraft: stagedDraft || null })); } catch (e) { /* ignore */ }
            }
            log("info", "reset", "空白新会话已就绪", { newId: newId, mode: mode });
            safeOpenSession(newId, props);
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
        var snapshot = getChatSnapshot(props);
        if (snapshot && Array.isArray(snapshot.order) && snapshot.nodes && typeof snapshot.nodes.get === "function") {
          var order = snapshot.order;
          if (order.length > 0) {
            var tt = snapshot.nodes.get(order[order.length - 1]);
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

    /** 编辑态模型选择 chip（v2.2）：复刻官方输入框模型选择的两级菜单（模型 / 推理等级）。
     * 数据源=官方 modelDirectories.directoryFor(sessionId).store——与下方输入框同源同款；
     * 惰性提交：选择只写本地 selection，确定发送时才随 resume 应用，不碰官方 store；
     * 面板**向下弹出**（不盖上方文字）；箭头=设置卡同款 SVG 无柄箭头（收起朝下⇄展开朝上旋转动画）；
     * 服务不可用 / 会话不可寻址时整颗 chip 不渲染（优雅降级）；
     * 模型无 reasoning 能力 → 菜单不出现「推理等级」行，chip 也不显示等级。 */
    function EditModelPicker(props) {
      var L = useUILocaleDict();
      var dir = null;
      try {
        var md = props.modelDirectories;
        if (md && typeof md.directoryFor === "function") dir = md.directoryFor(props.sessionId);
      } catch (eDir) { dir = null; }
      var hasStore = !!(dir && dir.store && typeof dir.store.subscribe === "function" && typeof dir.store.getSnapshot === "function");
      var snap = React.useSyncExternalStore(
        hasStore ? function (cb) { return dir.store.subscribe(cb); } : function () { return function () {}; },
        hasStore ? function () { return dir.store.getSnapshot(); } : function () { return null; }
      );
      var menuState = React.useState(false);
      var menuOpen = menuState[0];
      var setMenuOpen = menuState[1];
      var viewState = React.useState("root");
      var view = viewState[0];
      var setView = viewState[1];
      var rootRef = React.useRef(null);
      React.useEffect(function () {
        if (!menuOpen || !dir || typeof dir.load !== "function") return;
        try { dir.load().catch(function () { /* ignore */ }); } catch (eLoad) { /* ignore */ }
      }, [menuOpen]);
      React.useEffect(function () {
        if (!menuOpen) return;
        function onDocClick(e) {
          try { if (rootRef.current && !rootRef.current.contains(e.target)) { setMenuOpen(false); setView("root"); } } catch (eOut) { /* ignore */ }
        }
        document.addEventListener("click", onDocClick, true);
        return function () { document.removeEventListener("click", onDocClick, true); };
      }, [menuOpen]);
      if (!hasStore || !snap) return null;
      var groups = Array.isArray(snap.groups) ? snap.groups : [];
      var cur = snap.current || null;
      var sel = props.selection || (cur ? { provider: cur.provider, model: cur.model, reasoningEffort: cur.reasoningEffort } : null);
      if (!sel && groups.length === 0) return null;
      // 派生：当前生效选择 ↔ 官方 choices 同款结构（provider=group.id, model=model.id）
      var selChoice = null;
      for (var gi = 0; gi < groups.length; gi++) {
        var gGroup = groups[gi];
        var gModels = Array.isArray(gGroup.models) ? gGroup.models : [];
        for (var mi = 0; mi < gModels.length; mi++) {
          if (sel && gGroup.id === sel.provider && gModels[mi].id === sel.model) { selChoice = { group: gGroup, model: gModels[mi] }; break; }
        }
        if (selChoice) break;
      }
      var reasoning = selChoice ? selChoice.model.reasoning : void 0;
      var effectiveEffort = (sel && sel.reasoningEffort !== void 0) ? sel.reasoningEffort : (reasoning && reasoning.defaultEffort !== void 0 ? reasoning.defaultEffort : void 0);
      var effortLabel;
      if (reasoning === void 0) effortLabel = void 0;
      else if (effectiveEffort === void 0) effortLabel = L.effortDefault;
      else {
        var lvFound = null;
        var eAll = Array.isArray(reasoning.efforts) ? reasoning.efforts : [];
        for (var li = 0; li < eAll.length; li++) { if (eAll[li].id === effectiveEffort) { lvFound = eAll[li]; break; } }
        effortLabel = (lvFound && lvFound.name) || String(effectiveEffort);
      }
      var modelLabel = (selChoice && selChoice.model.name) ? selChoice.model.name : (sel ? sel.model : L.modelMenu);
      function pickModel(gid, modelId) {
        props.onChange({ provider: gid, model: modelId });
        setMenuOpen(false); setView("root");
      }
      function pickEffort(effort) {
        var base = sel || (cur ? { provider: cur.provider, model: cur.model } : null);
        if (!base) return;
        var next = { provider: base.provider, model: base.model };
        if (effort !== void 0) next.reasoningEffort = effort;
        props.onChange(next);
        setView("root");
      }
      var hoverBg = "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.12))";
      var chipStyle = { display: "flex", alignItems: "center", gap: "4px", border: "none", background: "transparent", cursor: "pointer", borderRadius: "24px", outline: "none", height: "28px", padding: "0 4px 0 8px", fontSize: "13px", fontWeight: 500, lineHeight: "20px", color: "var(--dsw-alias-label-secondary)", minWidth: "0", maxWidth: "100%" };
      // 向下弹出、锚定整个编辑框（吸附其正下方、左缘与框同x）；token 全对齐官方 ModelSelect CSS
      var menuStyle = { position: "absolute", top: "calc(100% + 8px)", left: "0", zIndex: 20, display: "flex", flexDirection: "column", width: "max-content", minWidth: "250px", maxWidth: "min(420px, calc(100vw - 32px))", maxHeight: "min(360px, calc(100vh - 96px))", overflowY: "auto", background: "var(--dsw-specific-menu, rgba(42,42,46,0.98))", border: "1px solid var(--dsw-alias-border-inverted, rgba(128,128,128,0.25))", borderRadius: "12px", boxShadow: "var(--dsw-shadow-lv3, 0 8px 24px rgba(0,0,0,0.35))", padding: "4px", color: "var(--dsw-alias-label-primary)" };
      var rowBase = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", width: "100%", minHeight: "38px", boxSizing: "border-box", border: "none", background: "transparent", cursor: "pointer", padding: "6px 8px", borderRadius: "10px", font: "inherit", fontSize: "13px", lineHeight: "20px", color: "inherit", textAlign: "left" };
      function rowHover(e, on) { try { e.currentTarget.style.background = on ? hoverBg : "transparent"; } catch (eH) { /* ignore */ } }
      function menuRow(label, value, onClick, key) {
        return React.createElement("button", { key: key, type: "button", style: rowBase, onMouseEnter: function (e) { rowHover(e, true); }, onMouseLeave: function (e) { rowHover(e, false); }, onClick: function (e) { e.stopPropagation(); onClick(); } },
          React.createElement("span", null, label),
          React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--dsw-alias-label-tertiary)" } },
            React.createElement("span", null, value),
            React.createElement("span", null, "›")));
      }
      function backRow(label) {
        return React.createElement("button", { key: "back", type: "button", style: Object.assign({}, rowBase, { minHeight: "32px", padding: "4px 8px" }), onMouseEnter: function (e) { rowHover(e, true); }, onMouseLeave: function (e) { rowHover(e, false); }, onClick: function (e) { e.stopPropagation(); setView("root"); } },
          React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--dsw-alias-label-secondary)" } },
            React.createElement("span", { style: { fontSize: "18px", lineHeight: "18px", fontWeight: 500, flex: "none" } }, "‹"),
            React.createElement("span", { style: { fontSize: "12px" } }, label)));
      }
      var check = React.createElement("span", { style: { color: "var(--dsw-alias-label-primary)", flex: "none" } }, "✓");
      // 设置卡同款 SVG 无柄箭头：收起朝下（rotate 90°）⇄ 展开朝上（rotate 270°），官方旋转动画
      var chevron = React.createElement("svg", {
        width: "14", height: "14", viewBox: "0 0 24 24", "aria-hidden": true,
        style: { color: "var(--dsw-alias-label-caption, var(--dsw-alias-label-tertiary))", flex: "none", transition: "transform .12s", transform: menuOpen ? "rotate(270deg)" : "rotate(90deg)" }
      }, React.createElement("path", { d: "M9 6l6 6-6 6", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }));
      var body;
      if (view === "root") {
        body = [
          menuRow(L.modelMenu, modelLabel, function () { setView("models"); }, "row-model"),
          reasoning ? menuRow(L.effortMenu, effortLabel || L.effortDefault, function () { setView("efforts"); }, "row-effort") : null
        ];
      } else if (view === "models") {
        var kids = [backRow(L.modelMenu)];
        for (var gi2 = 0; gi2 < groups.length; gi2++) {
          var g2 = groups[gi2];
          if (groups.length > 1 && g2.name) kids.push(React.createElement("div", { key: "g" + gi2, style: { position: "sticky", top: "0", zIndex: 1, background: "var(--dsw-specific-menu, rgba(42,42,46,0.98))", padding: "5px 8px 3px", fontSize: "12px", fontWeight: 500, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary)" } }, g2.name));
          var g2m = Array.isArray(g2.models) ? g2.models : [];
          for (var mj = 0; mj < g2m.length; mj++) {
            (function (gid, model) {
              var selected = !!(sel && gid === sel.provider && model.id === sel.model);
              kids.push(React.createElement("button", { key: gid + ":" + model.id, type: "button", role: "menuitemradio", "aria-checked": selected, title: model.name, style: Object.assign({}, rowBase, { alignItems: "flex-start" }), onMouseEnter: function (e) { rowHover(e, true); }, onMouseLeave: function (e) { rowHover(e, false); }, onClick: function (e) { e.stopPropagation(); pickModel(gid, model.id); } },
                React.createElement("span", { style: { display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" } },
                  React.createElement("span", null, model.name),
                  model.description ? React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", lineHeight: "16px" } }, model.description) : null),
                selected ? check : null));
            })(g2.id, g2m[mj]);
          }
        }
        body = groups.length === 0
          ? [backRow(L.modelMenu), React.createElement("div", { key: "empty", style: { padding: "10px", fontSize: "13px", lineHeight: "20px", color: "var(--dsw-alias-label-tertiary)" } }, snap.status === "loading" ? L.modelsLoading : L.modelsEmpty)]
          : kids;
      } else {
        var effortChoices = [];
        if (reasoning !== void 0) {
          if (reasoning.defaultEffort === void 0) effortChoices.push({ effort: void 0, label: L.effortDefault });
          var eList = Array.isArray(reasoning.efforts) ? reasoning.efforts : [];
          for (var ei = 0; ei < eList.length; ei++) effortChoices.push({ effort: eList[ei].id, label: eList[ei].name });
        }
        var eKids = [backRow(L.effortMenu)];
        for (var ej = 0; ej < effortChoices.length; ej++) {
          (function (level) {
            var selected = level.effort === effectiveEffort;
            eKids.push(React.createElement("button", { key: String(level.effort), type: "button", role: "menuitemradio", "aria-checked": selected, style: Object.assign({}, rowBase), onMouseEnter: function (e) { rowHover(e, true); }, onMouseLeave: function (e) { rowHover(e, false); }, onClick: function (e) { e.stopPropagation(); pickEffort(level.effort); } },
              React.createElement("span", null, level.label),
              selected ? check : null));
          })(effortChoices[ej]);
        }
        body = eKids;
      }
      return React.createElement("div", { ref: rootRef, style: { display: "inline-block", maxWidth: "60%", minWidth: "0" } },
        React.createElement("button", {
          type: "button", style: chipStyle, title: L.modelMenu + "：" + modelLabel + (effortLabel ? " · " + effortLabel : ""),
          "aria-haspopup": "menu", "aria-expanded": !!menuOpen,
          onMouseEnter: function (e) { rowHover(e, true); }, onMouseLeave: function (e) { rowHover(e, false); },
          onClick: function (e) { e.stopPropagation(); setMenuOpen(!menuOpen); setView("root"); }
        },
          React.createElement("span", { style: { fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: "0" } }, modelLabel),
          effortLabel ? React.createElement("span", { style: { color: "var(--dsw-alias-label-caption, var(--dsw-alias-label-tertiary))", flex: "none" } }, effortLabel) : null,
          chevron
        ),
        menuOpen ? React.createElement("div", { role: "menu", style: menuStyle, onClick: function (e) { e.stopPropagation(); } }, body) : null
      );
    }

    /** 撤回待定态展开原文时的单张图片（v2.4.0）：loadImage 异步解析→<img>；圆角+气泡同宽约束，复刻原生气泡内图片观感；失败静默。 */
    function PendingOriginalImage(props2) {
      var st = React.useState(null);
      var url = st[0];
      var setUrl = st[1];
      var errState = React.useState(false);
      var failed = errState[0];
      var setFailed = errState[1];
      React.useEffect(function () {
        var alive = true;
        props2.loadImage(props2.ref).then(function (u) { if (alive && u) setUrl(u); }, function () { if (alive) setFailed(true); });
        return function () { alive = false; };
      }, []);
      if (failed || !url) return null;
      return React.createElement("img", { src: url, style: { maxWidth: "100%", width: "auto", maxHeight: "280px", borderRadius: "12px", display: "block" } });
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
      var inputState = typeof props.useInput === "function" ? props.useInput(function (s) { return s; }) : (props.inputState || null);
      if (inputState) draftRef.current = typeof inputState.draft === "string" ? inputState.draft : "";
        // 镜像输入框当前图片 id（供撤回/编辑发送时精确搬运）
        try { if (Array.isArray(inputState.imageIds)) latestInputImageIds = inputState.imageIds.slice(); } catch (eMir) { /* ignore */ }
        // v2.4.0：rc.1 input门面（props.inputState）的 imageIds 同步
        try { if (props.inputState && Array.isArray(props.inputState.imageIds)) latestInputImageIds = props.inputState.imageIds.slice(); } catch (eMir2) { /* ignore */ }

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
      var sEditImgs = React.useState([]); // 气泡编辑图片工作集 [{id, url, dataUrl}]
      var editImages = sEditImgs[0];
      var setEditImages = sEditImgs[1];
      var editImagesRef = React.useRef([]); // 渲染期镜像（异步回调读取最新集合，同 draftRef 模式）
      editImagesRef.current = editImages;
      var editRestoredRef = React.useRef(false); // 刷新恢复每挂载只跑一次
      var hadEditPendingAtMount = React.useRef(false); // 挂载瞬间是否已带编辑待定（区分"恢复"与"正常进入编辑"）
      if (hadEditPendingAtMount.current === false && pending && pending.type === "edit" && pending.targetKey === myKey) hadEditPendingAtMount.current = true;
      var sEditSel = React.useState(null); // 编辑态模型选择（null=未动 chip → 维持 v2.1.1 捕获语义）
      var editSel = sEditSel[0];
      var setEditSel = sEditSel[1];
      // 拖入虚线框（dropzone）：dzActive=文件拖拽在窗口内（灰虚线框+毛玻璃浮现）；dzOver=光标悬停在图片预览容器上（变蓝高亮）
      var sDzActive = React.useState(false);
      var dzActive = sDzActive[0];
      var setDzActive = sDzActive[1];
      var sDzOver = React.useState(false);
      var dzOver = sDzOver[0];
      var setDzOver = sDzOver[1];
      var sDzBottomOver = React.useState(false); // 底部输入框悬停高亮
      var dzBottomOver = sDzBottomOver[0];
      var setDzBottomOver = sDzBottomOver[1];
      var dzActiveRef = React.useRef(false); // 事件回调内读最新值（避免闭包旧态）
      var dzOverRef = React.useRef(false);
      var dzBottomOverRef = React.useRef(false);
      var dzWatchdogRef = React.useRef(0);   // 拖拽事件流中断兜底（2.5s 无事件自动复位，防卡死）
      var stagedBottomImageIdsRef = React.useRef([]); // 气泡编辑期间拖入底部输入框的暂存图片 ID 列表
      /** 把当前编辑图片集合同步进 pending（含 dataUrl 字节快照；超限降级只丢字节、引用仍在） */
      function syncEditImgsToPending(items) {
        try {
          var p = readPending(sessionId);
          if (!p || p.type !== "edit") return;
          var total = 0, stripped = 0;
          var snap = items.map(function (it) {
            var du = it && it.dataUrl ? String(it.dataUrl) : null;
            if (du) total += du.length;
            return { id: it.id, dataUrl: du };
          });
          if (total > 4000000) { // localStorage 配额保护：>~4MB 放弃字节持久化（原图仍走 attachRefs 恢复）
            snap = snap.map(function (it) { if (it.dataUrl) { it.dataUrl = null; stripped++; } return it; });
            log("warn", "edit", "编辑图片过大，跳过刷新持久化（本次会话内仍有效）", { stripped: stripped, total: total });
          }
          writePending(sessionId, Object.assign({}, p, { editImgs: snap, updatedAt: Date.now() }));
        } catch (eSp) { /* ignore */ }
      }
      React.useEffect(function () {
        if (!isEditPending || editing) return;
        setEditing(true);
        setEditText(pending.draftText);
        // bug②：刷新/重挂载恢复——原图按 attachRefs 重桥接 + 拖入图按 dataUrl 重建字节。
        // 仅当"挂载时就带着编辑待定"才走恢复（正常点击进入编辑由 enterEdit 自行桥接，避免重复）。
        if (!hadEditPendingAtMount.current || editRestoredRef.current) return;
        editRestoredRef.current = true;
        (async function () {
          try {
            var items = [];
            var refs = (cachedEditMsg[myKey] && cachedEditMsg[myKey].attachRefs) || [];
            for (var ri = 0; ri < refs.length; ri++) {
              try {
                if (!ctxConversationRef || typeof ctxConversationRef.createDraftImages !== "function") break;
                var rUrl = await resolveImageCompat(sessionId, refs[ri], null);
                if (!rUrl) continue;
                var rResp = await fetch(rUrl);
                if (!rResp.ok) continue;
                var rBlob = await rResp.blob();
                var rD = ctxConversationRef.createDraftImages([new File([rBlob], refs[ri].name || "image.png", { type: refs[ri].mediaType || rBlob.type || "image/png" })]);
                if (rD && rD.length > 0) items.push({ id: rD[0].id, url: rD[0].previewUrl, dataUrl: null });
              } catch (eRo) { log("warn", "edit", "恢复原图失败", { err: String(eRo && eRo.message ? eRo.message : eRo) }); }
            }
            var origCount = items.length;
            var savedList = (pending && Array.isArray(pending.editImgs)) ? pending.editImgs : [];
            for (var si = 0; si < savedList.length; si++) {
              var sv = savedList[si];
              if (!sv || !sv.dataUrl) continue;
              try {
                if (!ctxConversationRef || typeof ctxConversationRef.createDraftImages !== "function") break;
                var sD = ctxConversationRef.createDraftImages([dataUrlToFile(sv.dataUrl)]);
                if (sD && sD.length > 0) items.push({ id: sD[0].id, url: sD[0].previewUrl, dataUrl: sv.dataUrl });
              } catch (eRa) { log("warn", "edit", "恢复拖入图失败", { err: String(eRa && eRa.message ? eRa.message : eRa) }); }
            }
            if (items.length > 0) {
              setEditImages(items);
              syncEditImgsToPending(items);
            }
            log("info", "edit", "编辑态刷新恢复完成", { orig: origCount, added: items.length - origCount });
          } catch (eRe) { log("warn", "edit", "编辑态刷新恢复异常", { err: String(eRe && eRe.message ? eRe.message : eRe) }); }
        })();
      }, [isEditPending]);

      // 辅助：获取底部输入组件的操作栏/工具栏容器（包含模型选择、发送键等）
      function getComposerToolbar(card) {
        try {
          if (!card) return null;
          var btn = card.querySelector("button[aria-label*='发送'], button[aria-label*='Send'], button[data-send-button]");
          if (!btn) {
            var btns = card.querySelectorAll("button");
            if (btns.length > 0) btn = btns[btns.length - 1];
          }
          if (btn) {
            var cur = btn;
            while (cur && cur.parentNode && cur.parentNode !== card) {
              cur = cur.parentNode;
            }
            if (cur && cur.parentNode === card) return cur;
          }
        } catch (e) { /* ignore */ }
        return null;
      }

      // 辅助：光标坐标判定是否在底部虚线框的矩形区域内（支持高度扩大后超出卡片上边缘时的精准命中）
      function isPointInBottomDz(e) {
        try {
          if (!e || typeof e.clientX !== "number" || typeof e.clientY !== "number") return false;
          var ov = document.querySelector("[data-easyrewrite-bottom-dz]");
          if (ov) {
            var r = ov.getBoundingClientRect();
            return (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
          }
        } catch (err) { /* ignore */ }
        return false;
      }

      // 辅助：判定事件目标是否在输入框组件区域（排除底部的模型选择和发送键等 UI）
      function isTargetInComposerInput(target) {
        try {
          if (!target) return false;
          var card = target.closest("[data-composer-card='true']") || target.closest("[data-composer-card]");
          if (!card) return false;
          var toolbar = getComposerToolbar(card);
          if (toolbar && (toolbar === target || toolbar.contains(target))) {
            return false;
          }
          return true;
        } catch (e) { return false; }
      }

      // 底部输入框 Dropzone 蒙层与输入框尺寸联动（气泡编辑拖拽时，输入框与虚线框同步按比例放大至 2.5x，严丝合缝贴合输入框组件内；不遮挡底部操作区）
      React.useEffect(function () {
        var card = document.querySelector("[data-composer-card='true']") || document.querySelector("[data-composer-card]");
        var scrollEl = card ? card.querySelector("[data-input-scroll]") : document.querySelector("[data-input-scroll]");

        function restoreInputBox() {
          try {
            var oldOv = document.querySelector("[data-easyrewrite-bottom-dz]");
            if (oldOv && oldOv.parentNode) {
              var pNode = oldOv.parentNode;
              oldOv.remove();
              if (pNode && pNode.dataset && pNode.dataset.easyrewriteOriginPos) {
                pNode.style.position = pNode.dataset.easyrewriteOriginPos;
                delete pNode.dataset.easyrewriteOriginPos;
              }
            }
            if (scrollEl && scrollEl.dataset && scrollEl.dataset.easyrewriteOrigMinH !== undefined) {
              scrollEl.style.minHeight = scrollEl.dataset.easyrewriteOrigMinH;
              delete scrollEl.dataset.easyrewriteOrigMinH;
              delete scrollEl.dataset.easyrewriteBaseH;
            }
          } catch (eR) { /* ignore */ }
        }

        if (!editing || !dzActive) {
          restoreInputBox();
          return;
        }

        if (!card) return;
        var compStyle = window.getComputedStyle ? window.getComputedStyle(card) : null;
        if (compStyle && compStyle.position === "static") {
          card.dataset.easyrewriteOriginPos = card.style.position || "";
          card.style.position = "relative";
        }

        // 1) 输入框组件本身协同平滑放大至 2.5x（严丝合缝扩展，杜绝悬浮超框）
        if (scrollEl) {
          if (!scrollEl.dataset.easyrewriteOrigMinH) {
            scrollEl.dataset.easyrewriteOrigMinH = scrollEl.style.minHeight || "";
            scrollEl.dataset.easyrewriteBaseH = String(Math.max(28, scrollEl.offsetHeight || 32));
          }
          var baseH = parseFloat(scrollEl.dataset.easyrewriteBaseH) || 32;
          var targetH = Math.min(240, Math.max(80, Math.round(baseH * 2.5)));
          scrollEl.style.transition = "min-height .15s ease";
          scrollEl.style.minHeight = targetH + "px";
        }

        // 2) 测量底部工具栏（模型选择与发送键等）
        var toolbar = getComposerToolbar(card);
        var bottomGap = 44;
        try {
          if (toolbar) {
            var cRect = card.getBoundingClientRect();
            var tRect = toolbar.getBoundingClientRect();
            if (tRect.top >= cRect.top && tRect.top < cRect.bottom) {
              bottomGap = Math.max(36, Math.round(cRect.bottom - tRect.top));
            }
          }
        } catch (eG) { /* ignore */ }

        // 3) 虚线框严丝合缝贴合放大的输入框内部（从卡片顶部到工具栏上方，绝不超出输入框卡片）
        var ov = card.querySelector("[data-easyrewrite-bottom-dz]");
        if (!ov) {
          ov = document.createElement("div");
          ov.setAttribute("data-easyrewrite-bottom-dz", "1");
          ov.style.position = "absolute";
          ov.style.top = "6px";
          ov.style.left = "8px";
          ov.style.right = "8px";
          ov.style.bottom = (bottomGap + 4) + "px";
          ov.style.zIndex = "25";
          ov.style.display = "flex";
          ov.style.alignItems = "center";
          ov.style.justifyContent = "center";
          ov.style.borderRadius = "12px";
          ov.style.boxSizing = "border-box";
          ov.style.pointerEvents = "none";
          ov.style.backdropFilter = "blur(14px)";
          ov.style.webkitBackdropFilter = "blur(14px)";
          ov.style.animation = "dshEasyRewriteDzFadeIn 0.16s ease-out";
          ov.style.transition = "border-color .12s ease, background-color .12s ease, color .12s ease";
          var txtSpan = document.createElement("span");
          txtSpan.className = "dsh-easyrewrite-bottom-dz-text";
          txtSpan.style.fontSize = "13.5px";
          txtSpan.style.fontWeight = "500";
          txtSpan.style.textAlign = "center";
          txtSpan.style.padding = "0 14px";
          txtSpan.style.maxWidth = "100%";
          txtSpan.style.overflow = "hidden";
          txtSpan.style.textOverflow = "ellipsis";
          txtSpan.style.whiteSpace = "nowrap";
          ov.appendChild(txtSpan);
          card.appendChild(ov);
        } else {
          ov.style.top = "6px";
          ov.style.bottom = (bottomGap + 4) + "px";
        }
        var dzBlue = "var(--dsw-static-deepseek-500, #4d6bfe)";
        var dzGrey = "rgba(128,128,128,0.45)";
        ov.style.border = "3px dashed " + (dzBottomOver ? dzBlue : dzGrey);
        ov.style.background = dzBottomOver ? "rgba(77,107,254,0.10)" : "rgba(128,128,128,0.06)";
        var spanEl = ov.querySelector(".dsh-easyrewrite-bottom-dz-text");
        if (spanEl) {
          spanEl.textContent = dzBottomOver ? "松开暂存至输入框（新对话中保留）" : "拖入此处暂存至输入框（新对话中保留）";
          spanEl.style.color = dzBottomOver ? dzBlue : "rgba(128,128,128,0.85)";
        }
        return function () {
          restoreInputBox();
        };
      }, [editing, dzActive, dzBottomOver]);

      // 编辑态：document 捕获级接管文件拖拽（bug①）。官方全屏提示层由 dsh-client-ui-attachment
      // 在 document 冒泡阶段以 dragenter/dragleave 计数驱动、drop 时才 reset——旧实现只拦 drop 且
      // stopPropagation，官方收不到任何后续事件 → 提示层永久卡死。现在 dragenter/dragover 一并在
      // 捕获阶段拦下：提示层根本不出现；drop 按目标分流至编辑气泡或底部输入框暂存区。随编辑态启停。
      React.useEffect(function () {
        if (!editing) return;
        function looksLikeFileDrag(e) {
          try { var t = e.dataTransfer; return !!(t && t.types && Array.prototype.indexOf.call(t.types, "Files") !== -1); } catch (eT) { return false; }
        }
        function suppress(e) { e.preventDefault(); e.stopPropagation(); }
        function armWatchdog() {
          try { if (dzWatchdogRef.current) clearTimeout(dzWatchdogRef.current); } catch (eW) { /* ignore */ }
          dzWatchdogRef.current = setTimeout(function () {
            dzActiveRef.current = false; dzOverRef.current = false; dzBottomOverRef.current = false;
            setDzActive(false); setDzOver(false); setDzBottomOver(false);
          }, 2500);
        }
        function onDragEnter(e) {
          if (!looksLikeFileDrag(e)) return;
          suppress(e);
          armWatchdog();
          if (!dzActiveRef.current) { dzActiveRef.current = true; setDzActive(true); }
          // 悬停判定：气泡图片容器
          var over = false;
          try { over = !!(e.target && e.target.closest && e.target.closest("[data-easyrewrite-dropzone]")); } catch (eC) { /* ignore */ }
          if (over !== dzOverRef.current) { dzOverRef.current = over; setDzOver(over); }
          // 悬停判定：底部输入框组件区域（坐标或 target，排除模型选择与发送键）
          var bOver = false;
          try { bOver = isPointInBottomDz(e) || isTargetInComposerInput(e.target); } catch (eBC) { /* ignore */ }
          if (bOver !== dzBottomOverRef.current) { dzBottomOverRef.current = bOver; setDzBottomOver(bOver); }
        }
        function onDragOver(e) {
          if (!looksLikeFileDrag(e)) return;
          suppress(e);
          armWatchdog();
          if (!dzActiveRef.current) { dzActiveRef.current = true; setDzActive(true); }
          var over2 = false;
          try { over2 = !!(e.target && e.target.closest && e.target.closest("[data-easyrewrite-dropzone]")); } catch (eC2) { /* ignore */ }
          if (over2 !== dzOverRef.current) { dzOverRef.current = over2; setDzOver(over2); }
          var bOver2 = false;
          try { bOver2 = isPointInBottomDz(e) || isTargetInComposerInput(e.target); } catch (eBC2) { /* ignore */ }
          if (bOver2 !== dzBottomOverRef.current) { dzBottomOverRef.current = bOver2; setDzBottomOver(bOver2); }
        }
        function dzReset() {
          try { if (dzWatchdogRef.current) { clearTimeout(dzWatchdogRef.current); dzWatchdogRef.current = 0; } } catch (eW2) { /* ignore */ }
          dzActiveRef.current = false; dzOverRef.current = false; dzBottomOverRef.current = false;
          setDzActive(false); setDzOver(false); setDzBottomOver(false);
        }
        function onDrop(e) {
          suppress(e);
          var isBubble = false;
          var isBottom = false;
          try {
            isBubble = !!(e.target && e.target.closest && e.target.closest("[data-easyrewrite-dropzone]"));
            isBottom = isPointInBottomDz(e) || isTargetInComposerInput(e.target);
          } catch (eCl) { /* ignore */ }
          dzReset();
          try {
            var imgFiles = [];
            var dt = e.dataTransfer;
            if (dt && dt.files) {
              for (var di = 0; di < dt.files.length; di++) {
                var df = dt.files[di];
                if (df.type && df.type.indexOf("image") === 0) imgFiles.push(df);
              }
            }
            if (imgFiles.length === 0 || !ctxConversationRef || typeof ctxConversationRef.createDraftImages !== "function") return;

            if (isBottom) {
              // 分流 A：释放到底部输入框暂存区
              var bImgs = ctxConversationRef.createDraftImages(imgFiles);
              if (bImgs && bImgs.length > 0) {
                var bIds = bImgs.map(function (im) { return im.id; });
                if (props.inputActions && typeof props.inputActions.addImages === "function") {
                  props.inputActions.addImages(bIds);
                }
                stagedBottomImageIdsRef.current = stagedBottomImageIdsRef.current.concat(bIds);
                log("info", "edit", "图片已添加到底部输入框暂存区", { count: bIds.length, ids: bIds });
              }
              return;
            }

            if (!isBubble) return;

            // 分流 B：释放到气泡编辑区（修改当前消息）
            var dImgs = ctxConversationRef.createDraftImages(imgFiles);
            var addedItems = dImgs.map(function (im) { return { id: im.id, url: im.previewUrl, dataUrl: null }; });
            // 异步补 dataUrl 字节快照（bug② 刷新后可重建）
            for (var ai = 0; ai < addedItems.length; ai++) {
              (function (item, srcFile) {
                fileToDataUrl(srcFile).then(function (du) {
                  item.dataUrl = du;
                  setEditImages(function (prev) {
                    var nxt = prev.map(function (x) { return x.id === item.id ? Object.assign({}, x, { dataUrl: du }) : x; });
                    syncEditImgsToPending(nxt);
                    return nxt;
                  });
                }).catch(function () { /* ignore */ });
              })(addedItems[ai], imgFiles[ai]);
            }
            setEditImages(function (prev) { var nxt = prev.concat(addedItems); syncEditImgsToPending(nxt); return nxt; });
            log("info", "edit", "拦截到拖入图片至气泡", { count: addedItems.length });
          } catch (eDr) { log("warn", "edit", "拖入拦截异常", { err: String(eDr && eDr.message ? eDr.message : eDr) }); }
        }
        function onDragLeave(e) {
          // 离开窗口（relatedTarget=null）→ 整体复位；跨元素边界的假离开交给 dragover 刷新
          if (!looksLikeFileDrag(e)) return;
          if (e.relatedTarget === null) dzReset();
        }
        document.addEventListener("dragenter", onDragEnter, true);
        document.addEventListener("dragover", onDragOver, true);
        document.addEventListener("drop", onDrop, true);
        document.addEventListener("dragleave", onDragLeave, true);
        return function () {
          document.removeEventListener("dragenter", onDragEnter, true);
          document.removeEventListener("dragover", onDragOver, true);
          document.removeEventListener("drop", onDrop, true);
          document.removeEventListener("dragleave", onDragLeave, true);
          // 编辑退出/组件卸载：清看门狗 + 复位虚线框状态（防下次进入编辑带残留）
          try { if (dzWatchdogRef.current) { clearTimeout(dzWatchdogRef.current); dzWatchdogRef.current = 0; } } catch (eC3) { /* ignore */ }
          dzActiveRef.current = false; dzOverRef.current = false; dzBottomOverRef.current = false;
          setDzActive(false); setDzOver(false); setDzBottomOver(false);
          try {
            var ovOld = document.querySelector("[data-easyrewrite-bottom-dz]");
            if (ovOld && ovOld.parentNode) {
              var pNode2 = ovOld.parentNode;
              ovOld.remove();
              if (pNode2 && pNode2.dataset && pNode2.dataset.easyrewriteOriginPos) {
                pNode2.style.position = pNode2.dataset.easyrewriteOriginPos;
                delete pNode2.dataset.easyrewriteOriginPos;
              }
            }
            var scOld = document.querySelector("[data-input-scroll]");
            if (scOld && scOld.dataset && scOld.dataset.easyrewriteOrigMinH !== undefined) {
              scOld.style.minHeight = scOld.dataset.easyrewriteOrigMinH;
              delete scOld.dataset.easyrewriteOrigMinH;
              delete scOld.dataset.easyrewriteBaseH;
            }
          } catch (eRem) { /* ignore */ }
        };
      }, [editing]);

      // 渲染时无条件缓存消息图片 refs（confirmEdit 异步回调安全读取）
      var _pcCache = contentParts(data.content);
      var _imgsCache = _pcCache && _pcCache.images ? _pcCache.images : [];
      if (_imgsCache.length > 0) {
        var _arC = [];
        for (var _aci = 0; _aci < _imgsCache.length; _aci++) {
          var _ca2 = _imgsCache[_aci].attachment;
          if (_ca2 && typeof _ca2.attachmentId === "string") _arC.push({ attachmentId: _ca2.attachmentId, mediaType: _ca2.mediaType, name: _ca2.name });
        }
        if (_arC.length > 0) cachedEditMsg[myKey] = { seq: (data && typeof data.seq === "number") ? data.seq : anchorSeq, attachRefs: _arC };
      }



      // 统计该消息之后的内容条数（x 条内容）——防御式读取：任何异常都不影响气泡渲染
      var anchorSeq = node && typeof node.anchorSeq === "number" ? node.anchorSeq : (node && typeof node.seq === "number" ? node.seq : 0);
      var afterCount = 0;
      var onlyUser = statOnlyUser();
      try {
        // 注意：useSession 必须传 selector（官方 bindSnapshotSelector 契约），无参调用会崩
        var snapshot = getChatSnapshot(props);
        if (snapshot) {
          // 主路径：order（权威渲染顺序）+ 当前节点 key（v2.4.0：快照经 getChatSnapshot 归一化）
          if (Array.isArray(snapshot.order) && snapshot.nodes && typeof snapshot.nodes.get === "function") {
            var order = snapshot.order;
            var myKey = node && typeof node.key === "string" ? node.key : "";
            var myIdx = order.indexOf(myKey);
            if (myIdx !== -1) {
              for (var k = myIdx + 1; k < order.length; k++) {
                var afterNode = snapshot.nodes.get(order[k]);
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
          if (afterCount === 0 && snapshot.nodes && typeof snapshot.nodes.values === "function") {
            afterCount = countContentAfter(snapshot.nodes.values(), anchorSeq, "anchorSeq", onlyUser);
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
          color: "var(--dsw-alias-label-tertiary)",
          fontSize: "13px",
          lineHeight: "22px",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word"
        };
        var togglePreview = function (e) { e.stopPropagation(); setShowPreview(!showPreview); };
        // v2.4.0：展开态复刻原生结构——图片（独立元素，原生观感）在上 + 文字独立灰字气泡在下；无大一统灰底
        var origImages = null;
        if (showPreview && showOriginalImages()) {
          try {
            var refs = (cachedEditMsg[myKey] && cachedEditMsg[myKey].attachRefs) || [];
            if (refs.length > 0) {
              if (typeof props.renderMessageImages === "function") {
                var imgs = refs.map(function (r2) { return { attachment: r2 }; });
                origImages = React.createElement("div", { key: "orig-images", onClick: togglePreview, style: { cursor: "pointer" } },
                  renderMessageImagesCompat(imgs, props));
              } else if (typeof props.loadImage === "function") {
                origImages = React.createElement("div", { key: "orig-images-self", onClick: togglePreview, style: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", cursor: "pointer" } },
                  refs.map(function (r3, ri3) {
                    return React.createElement(PendingOriginalImage, { key: ri3, ref: r3, loadImage: props.loadImage });
                  }));
              }
            }
          } catch (eOi) { origImages = null; }
        }
        return React.createElement(
          "div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", padding: "2px 0" }, "data-dsh-easyrewrite": "user-pending" },
          showPreview ? origImages : null,
          showPreview ? React.createElement(
            "div", {
              style: grayBubbleStyle,
              title: L.collapse,
              onClick: togglePreview
            },
            text || L.emptyMsg
          ) : React.createElement(
            "div", {
              style: grayBubbleStyle,
              title: L.viewOriginal,
              onClick: togglePreview
            },
            L.greyText
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
        setEditSel(null);
        setEditImages([]); // v2.4.0：每次进入编辑=干净起点（防反复进出叠加）
        stagedBottomImageIdsRef.current = []; // 暂存列表重置
        log("info", "edit", "进入编辑态", { sessionId: sessionId, targetSeq: realSeq, initW: initWidth });
        // 带图编辑：把原消息图片桥接成 draft attachments（供编辑态预览和确认发送）
        try {
          var _er = [];
          var _epc = contentParts(data.content);
          if (_epc.images && _epc.images.length > 0) {
            for (var _ei = 0; _ei < _epc.images.length; _ei++) {
              var _ea = _epc.images[_ei].attachment;
              if (_ea && typeof _ea.attachmentId === "string") _er.push({ attachmentId: _ea.attachmentId, mediaType: _ea.mediaType, name: _ea.name });
            }
          }
          if (_er.length > 0) {
            (async function() {
              try {
                var eFiles = [];
                for (var ei2 = 0; ei2 < _er.length; ei2++) {
                  var eUrl = await resolveImageCompat(sessionId, _er[ei2], props);
                  if (!eUrl) continue;
                  var eResp = await fetch(eUrl); if (!eResp.ok) continue;
                  var eBlob = await eResp.blob();
                  eFiles.push(new File([eBlob], _er[ei2].name || "image.png", { type: _er[ei2].mediaType || eBlob.type || "image/png" }));
                }
                if (eFiles.length > 0 && ctxConversationRef && typeof ctxConversationRef.createDraftImages === "function") {
                  var eDrafts = ctxConversationRef.createDraftImages(eFiles);
                  var newItems = eDrafts.map(function(im) { return { id: im.id, url: im.previewUrl }; });
                  setEditImages(function(prev) { return prev.concat(newItems); });
                  log("info", "edit", "enterEdit 图片桥接完成", { count: newItems.length });
                }
              } catch (eBe) { log("warn", "edit", "enterEdit 图片桥接异常", { err: String(eBe && eBe.message ? eBe.message : eBe) }); }
            })();
          }
        } catch (eEe) { /* ignore */ }
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
        setPrimaryButtonSendingState(true);
        try {
          // 惰性提交：编辑的「确定」= 真正修改点（与撤回的「发送」等价）——截断重发
          var newText = editText;
          var sid = sessionId;
          var realSeq = (data && typeof data.seq === "number") ? data.seq : anchorSeq;
          // v2.4.0：首条/截断场景交由宿主判定树（下方 no-boundary/turn-open 分支统一走 resetConversation），
          // 窗口化快照上的 isFirstUserMessage 本地判定已移除（误判源）。图片桥接随命中分支执行。
          // review M3：pending 不清除前置——失败时保留草稿并恢复编辑态
          // M4：收集本条消息的图片附件引用（随 resume 数据传递，重发保留）
          // 诊断：dump content 块类型
          var editImgIds = editImages.map(function(x) { return x.id; });
          // v2.2：编辑态模型 chip 的本地选择优先；未动 chip → 维持 v2.1.1 捕获（输入框当前值）
          var msel = editSel || (props.modelSel ? props.modelSel.capture(sid) : null);

          // 收集底部输入框暂存草稿（文本与图片）：新会话中隔离保留
          var bDraftText = "";
          try { bDraftText = readCurrentComposerText(""); } catch (eBT) { /* ignore */ }
          var bImgIds = [];
          try {
            var curInState = props.inputState || null;
            if (curInState && Array.isArray(curInState.imageIds)) {
              bImgIds = curInState.imageIds.slice();
            }
          } catch (eBImgs) { /* ignore */ }
          if (bImgIds.length === 0 && stagedBottomImageIdsRef.current.length > 0) {
            bImgIds = stagedBottomImageIdsRef.current.slice();
          }
          var stagedDraftPayload = (bDraftText || (bImgIds && bImgIds.length > 0)) ? {
            text: bDraftText,
            imageIds: bImgIds
          } : null;

          setEditing(false);
          log("info", "edit", "确定：编辑重发", { sessionId: sid, targetSeq: realSeq, len: newText.length, hasStaged: !!stagedDraftPayload });
          var resp = await fetch("/bubble/recall", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId: sid, targetSeq: realSeq })
          });
          var data = await resp.json();
          if (!data || !data.ok) {
            var errCode2 = (data && data.error) || "unknown";
            log("warn", "edit", "编辑重发失败（边界）", { error: errCode2 });
            setPrimaryButtonSendingState(false);
            if (errCode2 === "turn-open" || errCode2 === "no-boundary") {
              // 极限场景（说一半截断 / 首条无边界）：重置对话，编辑文本带到新起点
              setEditing(false);
              setOpError(L.resetNotice);
              setTimeout(function () { setOpError(null); }, 5000);
              resetConversation(sid, "edit", newText, props, editImgIds, editSel, stagedDraftPayload);
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
            setPrimaryButtonSendingState(false);
            setEditing(true); // 恢复编辑态
            return;
          }
          // review M6：resume-send 带 TTL 时间戳；M4：图片附件引用随行（重发保留）；stagedDraft：新会话草稿隔离保留
          try {
            localStorage.setItem("dsh-easyrewrite:resume-send:" + newId, JSON.stringify({
              draftText: newText,
              t: Date.now(),
              imageIds: editImgIds,
              sel: msel,
              stagedDraft: stagedDraftPayload
            }));
          } catch (e) { /* ignore */ }
          try {
            if (props.ctxWorkspaces && typeof props.ctxWorkspaces.archiveSession === "function") {
              // review M8：await + catch
              await Promise.resolve(props.ctxWorkspaces.archiveSession(sid)).catch(function () { /* ignore */ });
            }
          } catch (e) { log("warn", "edit", "归档原会话失败", { err: String(e && e.message ? e.message : e) }); }
          log("info", "edit", "编辑重发：归档原会话 + 打开新会话", { newId: newId });

          var opened2 = safeOpenSession(newId, props);
          if (!opened2) {
            log("error", "edit", "打开新会话失败，回滚状态", { newId: newId });
            try { localStorage.removeItem("dsh-easyrewrite:resume-send:" + newId); } catch (e) {}
            setPrimaryButtonSendingState(false);
            setEditing(true);
            setOpError(L.errGeneric);
            return;
          }
          // 成功打开新会话后再清除 pending
          if (isEditPending) writePending(sid, null);
        } catch (err) {
          log("error", "edit", "编辑重发请求失败", { err: String(err && err.message ? err.message : err) });
          setPrimaryButtonSendingState(false);
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
        // 拖入虚线框 fade-in 动画（官方 DropOverlay 同款 .16s ease-out；幂等注入一次；尊重 reduced-motion）
        try {
          if (typeof document !== "undefined" && document.querySelector("style[data-dsh-easyrewrite-dz]") === null) {
            var dzSt = document.createElement("style");
            dzSt.setAttribute("data-dsh-easyrewrite-dz", "1");
            dzSt.textContent = "@keyframes dshEasyRewriteDzFadeIn{0%{opacity:0}to{opacity:1}}@media (prefers-reduced-motion:reduce){[data-easyrewrite-dropzone-overlay]{animation:none}}";
            document.head.appendChild(dzSt);
          }
        } catch (eDzSt) { /* ignore */ }
        var editBoxW = editWidthFor(editMode, editText, bubbleInitW);
        var lineCount = (editText.match(/\n/g) || []).length + 1;
        var taRows = Math.max(1, Math.min(20, lineCount));
        var editBoxStyle = {
          width: "100%",
          maxWidth: editBoxW,
          boxSizing: "border-box",
          position: "relative",
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
          cursor: "pointer",
          whiteSpace: "nowrap"
        };
        var ghostBtnStyle = {
          border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
          background: "transparent",
          color: "var(--dsw-alias-label-secondary)",
          borderRadius: "999px",
          padding: "4px 16px",
          fontSize: "13px",
          cursor: "pointer",
          whiteSpace: "nowrap"
        };
        // 编辑态：图片缩略图保持在编辑框上方（不因进入编辑而消失）
        var pcEd = contentParts(data.content);
        var editImgs = pcEd && pcEd.images ? pcEd.images : [];
        return React.createElement(
          "div", {
            style: rowStyle,
            "data-dsh-easyrewrite": "user-editing",
            onDrop: function (e) {
              e.preventDefault(); e.stopPropagation();
              try {
                var dt = e.dataTransfer;
                if (!dt || !dt.files) return;
                var imgFiles = [];
                for (var di = 0; di < dt.files.length; di++) {
                  var df = dt.files[di];
                  if (df.type && df.type.indexOf("image") === 0) imgFiles.push(df);
                }
                if (imgFiles.length > 0 && ctxConversationRef && typeof ctxConversationRef.createDraftImages === "function") {
                  var dImgs = ctxConversationRef.createDraftImages(imgFiles);
                  var newItems = dImgs.map(function(im) { return { id: im.id, url: im.previewUrl }; });
                  setEditImages(function(prev) { return prev.concat(newItems); });
                  log("info", "edit", "拖入图片已加入编辑", { count: newItems.length });
                }
              } catch (eDr) { log("warn", "edit", "拖入处理异常", { err: String(eDr && eDr.message ? eDr.message : eDr) }); }
            },
            onDragOver: function (e) { e.preventDefault(); e.stopPropagation(); }
          },
        (function () {
          // 拖入虚线框（dropzone）：dzActive=文件拖拽在窗口内 → 虚线框+毛玻璃浮现；dzOver=光标悬停框内 → 蓝框高亮。
          // 同布局双尺寸模型（用户定稿）：平时与拖入态都是"与输入框等宽的 4 张/行"，差别只在图片尺寸——
          // 平时 padding 0（图片行与输入框左右边缘齐平、尺寸最大）；拖入时框 border 3px+padding 5px 11px 出现，
          // 图片整体微缩进框内（每张缩 ~7px，发生在毛玻璃浮现的 0.16s 里 → "透视收缩+视觉中心转移"效果）。
          // 透明虚线边框两态常驻占位（几何稳定）；覆盖层 pointerEvents:none 纯装饰，事件只在 document 捕获层。
          var dzShow = dzActive;
          var hasImgs = editImages.length > 0;
          if (!hasImgs && !dzShow) return null; // 无图且未拖入：不占任何空间
          var dzGrey = "rgba(128,128,128,0.45)";
          var dzBlue = "var(--dsw-static-deepseek-500, #4d6bfe)";
          var dzBorder = 3, dzPadX = 11, dzGap = 6;
          // 缩略图尺寸：内容宽 = 框宽 − 常驻透明边框 6px −（拖入态再加内边距 22px）；4 张均分，第 5 张起换行；
          // 扩展/自定义 = 固定尺寸平铺（铺满整行再换行，大小与标准档公式值一致：平时84/拖入78——b1cee35 重写时曾丢失此分支致扩展模式图片 180px 过大）
          var dzFixedUsual = Math.max(44, Math.floor((360 - 2 * dzBorder - 3 * dzGap) / 4));
          var dzFixedDrag = Math.max(44, Math.floor((360 - 2 * dzBorder - 2 * dzPadX - 3 * dzGap) / 4));
          var dzThumbUsual = (editMode === "extended" || editMode === "custom") ? dzFixedUsual : Math.max(44, Math.floor((editBoxW - 2 * dzBorder - 3 * dzGap) / 4));
          var dzThumbDrag = (editMode === "extended" || editMode === "custom") ? dzFixedDrag : Math.max(44, Math.floor((editBoxW - 2 * dzBorder - 2 * dzPadX - 3 * dzGap) / 4));
          var thumbSize = dzShow ? dzThumbDrag : dzThumbUsual;
          // 无图占位框：比一张图略大（拖入态图高 + 上下各留 8px 空）
          var dzMinH = !hasImgs ? dzThumbDrag + 16 : void 0;
          return React.createElement(
            "div", {
              "data-easyrewrite-dropzone": "1",
              style: {
                position: "relative",
                width: "100%", maxWidth: editBoxW, boxSizing: "border-box",
                display: "flex", flexWrap: "wrap", gap: dzGap + "px", alignItems: "flex-start",
                padding: dzShow ? "5px " + dzPadX + "px" : "0px",
                marginBottom: "6px",
                minHeight: dzMinH,
                borderRadius: "16px",
                border: dzBorder + "px dashed " + (dzShow ? (dzOver ? dzBlue : dzGrey) : "transparent"),
                transition: "border-color .12s ease, padding .15s ease"
              }
            },
            editImages.map(function(ei, eiIdx) {
              // boxSizing:border-box：1px 边框计入 thumbSize（content-box 下每张多占 2px，会挤走第 4 张——已踩坑）
              return React.createElement("div", { key: ei.id, style: { position: "relative", boxSizing: "border-box", width: thumbSize + "px", height: thumbSize + "px", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))", transition: "width .15s ease, height .15s ease" } },
                React.createElement("img", { src: ei.url, style: { width: "100%", height: "100%", objectFit: "cover", display: "block" } }),
                React.createElement("button", { type: "button", onClick: function(ev) { ev.stopPropagation(); var nxtRm = editImagesRef.current.filter(function(x) { return x.id !== ei.id; }); setEditImages(nxtRm); syncEditImgsToPending(nxtRm); }, style: { position: "absolute", top: "2px", right: "2px", width: "18px", height: "18px", borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: "12px", lineHeight: "18px", textAlign: "center", cursor: "pointer", padding: "0" }, title: "移除图片" }, "\u00d7")
              );
            }),
            dzShow ? React.createElement(
              "div", {
                "data-easyrewrite-dropzone-overlay": "1",
                style: {
                  position: "absolute", inset: "0",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: "13px",
                  background: dzOver ? "rgba(77,107,254,0.10)" : "rgba(128,128,128,0.06)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  pointerEvents: "none",
                  zIndex: 5,
                  boxSizing: "border-box",
                  animation: "dshEasyRewriteDzFadeIn 0.16s ease-out",
                  transition: "background-color .12s ease"
                }
              },
              React.createElement("div", { style: { color: dzOver ? dzBlue : "rgba(128,128,128,0.85)", fontSize: "13px", lineHeight: "20px", fontWeight: 500, padding: "0 12px", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" } },
                editMode === "compact" ? L.dzCompact : L.dzFull
              )
            ) : null
          );
        })(),
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
              onChange: function (e) { setEditText(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; },
              onKeyDown: function (e) {
                if (e.key === "Escape") { e.stopPropagation(); cancelEdit(); }
                else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); confirmEdit(); }
              },
              onPaste: function (e) {
                try {
                  var items = e.clipboardData ? e.clipboardData.items : [];
                  for (var pi = 0; pi < items.length; pi++) {
                    if (items[pi].type && items[pi].type.indexOf("image") === 0) {
                      var pf = items[pi].getAsFile();
                      if (pf) {
                        e.preventDefault();
                        var pImgs = ctxConversationRef && typeof ctxConversationRef.createDraftImages === "function" ? ctxConversationRef.createDraftImages([pf]) : null;
                        if (pImgs && pImgs.length > 0) {
                          var pItem = { id: pImgs[0].id, url: pImgs[0].previewUrl, dataUrl: null };
                          setEditImages(function(prev) { var nxt = prev.concat([pItem]); syncEditImgsToPending(nxt); return nxt; });
                          fileToDataUrl(pf).then(function (du) {
                            pItem.dataUrl = du;
                            setEditImages(function (prev2) {
                              var nxt2 = prev2.map(function (x) { return x.id === pItem.id ? Object.assign({}, x, { dataUrl: du }) : x; });
                              syncEditImgsToPending(nxt2);
                              return nxt2;
                            });
                          }).catch(function () { /* ignore */ });
                        }
                        break;
                      }
                    }
                  }
                } catch (pe) { /* ignore */ }
              },
            }),
            React.createElement(
              "div", { style: btnRowStyle },
              props.modelDirectories ? React.createElement(EditModelPicker, { sessionId: sessionId, modelDirectories: props.modelDirectories, selection: editSel, onChange: setEditSel }) : null,
              React.createElement(
                "div", { style: { display: "flex", gap: "8px", marginLeft: "auto" } },
                React.createElement("button", { type: "button", style: ghostBtnStyle, onClick: function (e) { e.stopPropagation(); cancelEdit(); } }, L.cancel),
                React.createElement("button", { type: "button", style: primaryBtnStyle, onClick: function (e) { e.stopPropagation(); confirmEdit(); } }, L.confirm)
              )
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
                  var sPre = props.inputState || null;
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
                    // v2.4.0：首条/截断场景交由宿主判定树（发送时 no-boundary/turn-open → resetConversation）
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
        "[data-dsh-easyrewrite=\"recall-bar\"] .dbe-recall-x:hover .dbe-recall-x-bg{fill:var(--dsw-alias-interactive-bg-active,rgba(128,128,128,0.28))}" +
        "[data-dsh-easyrewrite=\"recall-bar\"] .dbe-recall-x:hover .dbe-recall-x-glyph{stroke:var(--dsw-alias-label-primary)}" +
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
        // 调试 API：撤回条实时调参（调试模式门控：localStorage dsh-easyrewrite:debug=1；set/get/diagnose/export）
        try {
          var wRef = (typeof window !== "undefined") ? window : null;
          if (wRef && !wRef.__dshEasyRewrite) wRef.__dshEasyRewrite = { bar: {} };
          if (wRef) {
            // 注意：方法内一律用闭包 apiRef 而非 this（用户把方法赋给变量再调用时 this 会断链）
            var apiRef = {
              _on: function () { try { return localStorage.getItem("dsh-easyrewrite:debug") === "1"; } catch (e) { return false; } },
              help: function () {
                try {
                  if (!apiRef._on()) return "调试模式未开启：先执行 localStorage.setItem('dsh-easyrewrite:debug','1')（当前页即时生效，无需刷新）";
                  return [
                    "__dshEasyRewrite.bar.get()                看现状（bar 内缩/圆钮计算样式）",
                    "__dshEasyRewrite.bar.set({inset:-1})       偏移 px：0=与预览图齐平，负=向外，正=向内；null 回退自动测量",
                    "__dshEasyRewrite.bar.set({size:26.4})      圆钮直径 px",
                    "__dshEasyRewrite.bar.set({radius:'999px'}) 圆钮圆角（'0px' 可对照方形）",
                    "__dshEasyRewrite.bar.set({bg:'red'})       圆钮底色（调试对比用）",
                    "__dshEasyRewrite.bar.diagnose()            扫样式表找压圆角规则 + 计算样式",
                    "__dshEasyRewrite.bar.export()              导出 JSON（发给我固化进代码）"
                  ].join("\n");
                } catch (eH) { return "ERR: " + ((eH && eH.stack) || eH); }
              },
              get: function () {
                try {
                  if (!apiRef._on()) return "调试模式未开启：localStorage.setItem('dsh-easyrewrite:debug','1')";
                  var out = { tune: JSON.parse(JSON.stringify(barTune)) };
                  var barEl = document.querySelector('[data-dsh-easyrewrite="recall-bar"]');
                  if (!barEl) { out.bar = "不在 DOM（需先进入撤回态）"; return JSON.stringify(out, null, 2); }
                  var cs = getComputedStyle(barEl);
                  out.bar = { width: cs.width, paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight };
                  var circ = barEl.querySelector(".dbe-recall-x-circ");
                  var btn = barEl.querySelector(".dbe-recall-x");
                  if (circ) {
                    var c2 = getComputedStyle(circ);
                    out.circ = { width: c2.width, height: c2.height, borderRadius: c2.borderTopLeftRadius, background: c2.backgroundColor, display: c2.display, boxSizing: c2.boxSizing };
                  } else out.circ = "不在 DOM";
                  if (btn) { var b2 = getComputedStyle(btn); out.button = { width: b2.width, height: b2.height, background: b2.backgroundColor, borderRadius: b2.borderTopLeftRadius }; }
                  return JSON.stringify(out, null, 2);
                } catch (eG) { return "ERR: " + ((eG && eG.stack) || eG); }
              },
              set: function (o) {
                try {
                  if (!apiRef._on()) return "调试模式未开启：localStorage.setItem('dsh-easyrewrite:debug','1')";
                  if (o && "inset" in o) barTune.inset = (o.inset === null ? null : +o.inset);
                  if (o && "size" in o) barTune.size = (o.size === null ? null : +o.size);
                  if (o && "radius" in o) barTune.radius = (o.radius === null ? null : String(o.radius));
                  if (o && "bg" in o) barTune.bg = (o.bg === null ? null : String(o.bg));
                  return barApplyTune();
                } catch (eS) { return "ERR: " + ((eS && eS.stack) || eS); }
              },
              diagnose: function () {
                try {
                  if (!apiRef._on()) return "调试模式未开启：localStorage.setItem('dsh-easyrewrite:debug','1')";
                  return JSON.stringify(barDiagnose(), null, 2);
                } catch (eDg) { return "ERR: " + ((eDg && eDg.stack) || eDg); }
              },
              export: function () {
                try {
                  if (!apiRef._on()) return "调试模式未开启：localStorage.setItem('dsh-easyrewrite:debug','1')";
                  return JSON.stringify(barTune);
                } catch (eEx) { return "ERR: " + ((eEx && eEx.stack) || eEx); }
              },
              reset: function () {
                try {
                  if (!apiRef._on()) return "调试模式未开启：localStorage.setItem('dsh-easyrewrite:debug','1')";
                  barTune.inset = null; barTune.size = null; barTune.radius = null; barTune.bg = null;
                  document.dispatchEvent(new CustomEvent("dsh-easyrewrite:bar-tune"));
                  var xC = document.querySelector('.dbe-recall-x-circ');
                  if (xC) barApplyCircTune(xC);
                  return "tune 已清空 → 固化默认值（inset=-7 / size=22）";
                } catch (eRz) { return "ERR: " + ((eRz && eRz.stack) || eRz); }
              }
            };
            wRef.__dshEasyRewrite.bar = apiRef;
          }
        } catch (eDbg) { /* ignore */ }
        try { ctxConversationRef = ctx.conversation; } catch (e) { ctxConversationRef = null; }
        try { ctxUiConversationRef = (typeof ctx.get === "function") ? (ctx.get("uiConversation") || null) : null; } catch (eUic) { ctxUiConversationRef = null; }
        try { ctxUiWorkspaceRef = (typeof ctx.get === "function") ? (ctx.get("uiWorkspace") || null) : null; } catch (eUiw) { ctxUiWorkspaceRef = null; }
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
        // ---------- 模型/思考挡位随行（v2.1.1） ----------
        // fork 出的新会话是全新 agent：无进程内选择、无请求日志，host 会落到全局默认——
        // 导致撤回/编辑重发丢失用户在输入框里选的模型与挡位。这里在 fork 前用官方
        // modelDirectories 服务（与选择器同一数据源）捕获当前值，随 resume 标记携带，
        // 新会话自动发送前经官方 selectModel 写回（即用户手动切换的同款通道）。
        var modelSel = {
          capture: function (sessionId) {
            try {
              var md = ctx.modelDirectories;
              if (!md || typeof md.directoryFor !== "function") return null;
              var cur = md.directoryFor(sessionId).store.getSnapshot().current;
              if (cur && cur.provider && cur.model) {
                return { provider: cur.provider, model: cur.model, reasoningEffort: cur.reasoningEffort };
              }
            } catch (e) { log("warn", "model", "读取当前模型/挡位失败（将按默认发送）", { err: String(e && e.message ? e.message : e) }); }
            return null;
          },
          apply: function (sessionId, sel) {
            if (!sel || !sel.provider || !sel.model) return Promise.resolve(false);
            try {
              var md = ctx.modelDirectories;
              if (!md || typeof md.directoryFor !== "function") return Promise.resolve(false);
              return md.directoryFor(sessionId).select(sel).then(function () {
                log("info", "model", "新会话已应用原模型/挡位选择", { provider: sel.provider, model: sel.model });
                return true;
              }, function (e) {
                log("warn", "model", "应用模型/挡位失败（按默认发送）", { err: String(e && e.message ? e.message : e) });
                return false;
              });
            } catch (e) { return Promise.resolve(false); }
          }
        };
        var d = ctx.slots.inject("conversation.chat.node", function () {
          return ctx.slots.register({
            name: "conversation.chat.node",
            key: "user",
            priority: -1,
            inject: function (sessionId) {
              // v2.4.0：chat.node 槽同样经 input 门面自取 inputActions（dsh 0.1.2 不再下发）
              var inputShell2 = null;
              try {
                if (sessionId) {
                  var scope2 = ctx.sessions.scope(sessionId);
                  var conv2 = scope2 ? scope2.get("conversation") : null;
                  if (conv2 && conv2.input && typeof conv2.input.for === "function") inputShell2 = conv2.input.for(scope2);
                }
              } catch (eSh2) { inputShell2 = null; }
              return {
                openSession: function (id) { ctx.sessions.open(id); },
                ctxWorkspaces: ctx.workspaces,
                ctxSessions: ctx.sessions,
                modelSel: modelSel,
                modelDirectories: ctx.modelDirectories,
                inputActions: inputShell2 && inputShell2.actions ? inputShell2.actions : null,
                inputState: inputShell2,
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
            inject: function (sessionId) {
              // v2.4.0：dsh 0.1.2 起宿主不再下发 inputActions——经 input 门面自取（方法名与旧 inputActions 完全一致）
              var actx = null, inputShell = null;
              try {
                if (typeof ctx.sessions.scope === "function" && sessionId) {
                  var scope = ctx.sessions.scope(sessionId);
                  var conversationSvc = scope ? scope.get("conversation") : null;
                  if (conversationSvc && conversationSvc.input && typeof conversationSvc.input.for === "function") {
                    inputShell = conversationSvc.input.for(scope);
                  }
                }
              } catch (eShell) { inputShell = null; }
              return {
                sessionId: sessionId,
                openSession: function (id) { ctx.sessions.open(id); },
                ctxWorkspaces: ctx.workspaces,
                ctxSessions: ctx.sessions,
                updateQueue: function (itemId, action) {
                  try {
                    if (conversationSvc && typeof conversationSvc.updateQueue === "function") {
                      return conversationSvc.updateQueue(itemId, action);
                    }
                    var binding = (ctx.sessions && typeof ctx.sessions.binding === "function")
                      ? ctx.sessions.binding(sessionId)
                      : null;
                    if (binding && binding.session && typeof binding.session.updateQueue === "function") {
                      return binding.session.updateQueue(itemId, action);
                    }
                  } catch (eQ) { /* ignore */ }
                  return Promise.resolve();
                },
                modelSel: modelSel,
                inputActions: inputShell && inputShell.actions ? inputShell.actions : null,
                inputState: inputShell || null,
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
            id: "dsh-easyrewrite",
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

    return { name: "dsh-easyrewrite", inject: ["slots", "sessions", "workspaces", "conversation", "locale", "modelDirectories"], apply: apply };
  }
});
