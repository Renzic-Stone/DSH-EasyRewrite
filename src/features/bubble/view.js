import * as React from "react";
import { IconCheckOutline, IconChevronLeftOutline, IconChevronRightOutline, ICONS } from "../../core/icons.js";
import { useUILocaleDict } from "../../core/i18n.js";
import { log } from "../../core/log.js";
import { serviceRefs, resolveImageCompat } from "../../core/services.js";
import {
  extractText,
  contentParts,
  renderMessageImagesCompat,
  iconImg,
  actionButton,
  pad2,
  formatClock,
  CopyButton
} from "../../core/ui.js";
import { readPending, writePending } from "../recall/store.js";
import { safeOpenSession } from "../recall/safe-session.js";
import { PendingOriginalImage } from "../recall/image.js";
import { EditModelPicker } from "./model-picker.js";
import { editWidthFor, editWidthMode, editWidthCustom } from "./width.js";
import { fileToDataUrl, dataUrlToFile } from "./image-utils.js";
import {
  pendingAttachIds,
  cachedEditMsg,
  latestInputImageIds, setLatestInputImageIds,
  rebuildDraftAttachments
} from "./attachments.js";
import {
  rewriteOnClick,
  showOriginalImages,
  draftConflictMode,
  recallVisualMode
} from "../../core/constants.js";
import { goToVersion, isFirstUserMessage, resetConversation } from "../history/pager.js";
import { countContentAfter, statOnlyUser } from "../other/helpers.js";

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
        try { if (Array.isArray(inputState.imageIds)) setLatestInputImageIds(inputState.imageIds.slice()); } catch (eMir) { /* ignore */ }
        // v2.4.0：rc.1 input门面（props.inputState）的 imageIds 同步
        try { if (props.inputState && Array.isArray(props.inputState.imageIds)) setLatestInputImageIds(props.inputState.imageIds.slice()); } catch (eMir2) { /* ignore */ }

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
                if (!serviceRefs.conversation || typeof serviceRefs.conversation.createDraftImages !== "function") break;
                var rUrl = await resolveImageCompat(sessionId, refs[ri], null);
                if (!rUrl) continue;
                var rResp = await fetch(rUrl);
                if (!rResp.ok) continue;
                var rBlob = await rResp.blob();
                var rD = serviceRefs.conversation.createDraftImages([new File([rBlob], refs[ri].name || "image.png", { type: refs[ri].mediaType || rBlob.type || "image/png" })]);
                if (rD && rD.length > 0) items.push({ id: rD[0].id, url: rD[0].previewUrl, dataUrl: null });
              } catch (eRo) { log("warn", "edit", "恢复原图失败", { err: String(eRo && eRo.message ? eRo.message : eRo) }); }
            }
            var origCount = items.length;
            var savedList = (pending && Array.isArray(pending.editImgs)) ? pending.editImgs : [];
            for (var si = 0; si < savedList.length; si++) {
              var sv = savedList[si];
              if (!sv || !sv.dataUrl) continue;
              try {
                if (!serviceRefs.conversation || typeof serviceRefs.conversation.createDraftImages !== "function") break;
                var sD = serviceRefs.conversation.createDraftImages([dataUrlToFile(sv.dataUrl)]);
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
            if (imgFiles.length === 0 || !serviceRefs.conversation || typeof serviceRefs.conversation.createDraftImages !== "function") return;

            if (isBottom) {
              // 分流 A：释放到底部输入框暂存区
              var bImgs = serviceRefs.conversation.createDraftImages(imgFiles);
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
            var dImgs = serviceRefs.conversation.createDraftImages(imgFiles);
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
        fontSize: "var(--dsh-content-font-size, 14px)",
        lineHeight: "calc(22px + var(--dsh-content-font-delta, 0px))",
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
          fontSize: "var(--dsh-content-font-size, 14px)",
          lineHeight: "calc(22px + var(--dsh-content-font-delta, 0px))",
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
              className: "dsh-easyrewrite-bubble",
              style: grayBubbleStyle,
              title: L.collapse,
              onClick: togglePreview
            },
            text || L.emptyMsg
          ) : React.createElement(
            "div", {
              className: "dsh-easyrewrite-bubble",
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
                if (eFiles.length > 0 && serviceRefs.conversation && typeof serviceRefs.conversation.createDraftImages === "function") {
                  var eDrafts = serviceRefs.conversation.createDraftImages(eFiles);
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
          // Issue #10 根治防御：fork 成功返回即请求 Host 端物理拔除继承的幽灵旧消息
          await requestCleanGhostQueue(newId);
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
          fontSize: "var(--dsh-content-font-size, 14px)",
          lineHeight: "calc(22px + var(--dsh-content-font-delta, 0px))",
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
                if (imgFiles.length > 0 && serviceRefs.conversation && typeof serviceRefs.conversation.createDraftImages === "function") {
                  var dImgs = serviceRefs.conversation.createDraftImages(imgFiles);
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
                        var pImgs = serviceRefs.conversation && typeof serviceRefs.conversation.createDraftImages === "function" ? serviceRefs.conversation.createDraftImages([pf]) : null;
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
          "div", { className: "dsh-easyrewrite-bubble", style: bubbleStyle, onClick: onBubbleClick, title: L.clickEdit },
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

export { UserBubbleView };
