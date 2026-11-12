import * as React from "react";
import { IconCheckOutline, IconChevronLeftOutline, IconChevronRightOutline, ICONS } from "../../core/icons.js";
import { useUILocaleDict } from "../../core/i18n.js";
import { renderWithChatAndInputGate } from "../../core/hook-gates.js";
import { log } from "../../core/log.js";
import { serviceRefs, resolveImageCompat, resolveAttachmentFile, createDraftImagesCompat, addInputImagesCompat, getInputImageIdsCompat, pruneInputImagesCompat, getModelDirectories, isImageFileName, isImageMediaType, guessMimeType } from "../../core/services.js";
import {
  extractText,
  contentParts,
  renderMessageImagesCompat,
  renderMessageAttachmentsCompat,
  FileCardView,
  renderFileTypeIcon,
  iconImg,
  actionButton,
  pad2,
  formatClock,
  CopyButton
} from "../../core/ui.js";
import { usePending, readPending, writePending } from "../recall/store.js";
import { safeOpenSession } from "../recall/safe-session.js";
import { PendingOriginalImage } from "../recall/image.js";
import { EditModelPicker } from "./model-picker.js";
import { editWidthFor, editWidthMode, editWidthCustom, calcBtnRowMinWidth } from "./width.js";
import { fileToDataUrl, dataUrlToFile } from "./image-utils.js";
import {
  pendingAttachIds,
  cachedEditMsg, setCachedEditMsg,
  latestInputImageIds, setLatestInputImageIds,
  rebuildDraftAttachments,
  stageOutgoingFiles,
  stageBottomDraftFiles,
  extractBottomDraftFiles,
  stageRecallOriginalFiles,
  clearRecallOriginalFiles,
  getDraggedAttachment,
  clearDraggedAttachment,
  handleAttachmentDragStart,
  handleAttachmentDragEnd
} from "./attachments.js";

function isImageFile(f) {
  if (!f) return false;
  var name = f.name || "";
  var type = f.type || "";
  if (name && /\.[a-z0-9]+$/i.test(name) && !isImageFileName(name)) {
    return false;
  }
  return isImageMediaType(type) || (type && type.indexOf("image/") === 0) || isImageFileName(name);
}
import {
  rewriteOnClick,
  showOriginalImages,
  draftConflictMode,
  recallVisualMode,
  recallConfirmEnabled,
  getChatSnapshot,
  editOffShowRecall,
  messagePreviewSize
} from "../../core/constants.js";
import { setPrimaryButtonSendingState, readCurrentComposerText } from "../recall/buttons.js";
import { requestCleanGhostQueue } from "../recall/ghost.js";
import { ConfirmCapsule } from "../recall/capsule.js";
import { goToVersion, isFirstUserMessage, createBlankChildSession, resetConversation } from "../history/pager.js";
import { countContentAfter, statOnlyUser } from "../other/helpers.js";

    function UserBubbleViewInner(props) {
      var node = props.node;
      var data = node && node.data ? node.data : {};
      var text = extractText(data.content);
      var L = useUILocaleDict();
      // review M4：附件检测——图片与文件附件可保留重发；其他块无法保留，进入编辑态时提示
      var hasUnpreservable = false;
      try {
        if (data && Array.isArray(data.content)) {
          for (var bi = 0; bi < data.content.length; bi++) {
            var blk = data.content[bi];
            if (blk && blk.type !== "text" && blk.type !== "image" && blk.type !== "file") { hasUnpreservable = true; break; }
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
      var editInFlightRef = React.useRef(false); // review M2：跨重渲染稳定的编辑重发并发锁，置顶于一切 early return 之前防 React #300
      var inputState = (props && props._resolvedInputState !== undefined) ? props._resolvedInputState : (props.inputState || null);
      if (inputState) draftRef.current = typeof inputState.draft === "string" ? inputState.draft : "";
        // 镜像输入框当前图片 id（供撤回/编辑发送时精确搬运）
        try {
          var inImgs = getInputImageIdsCompat(inputState);
          if (inImgs.length > 0) setLatestInputImageIds(inImgs);
        } catch (eMir) { /* ignore */ }
        // v2.4.0：rc.1 input门面的 imageIds/attachmentIds 同步
        try {
          if (props.inputState) {
            var pInImgs = getInputImageIdsCompat(props.inputState);
            if (pInImgs.length > 0) setLatestInputImageIds(pInImgs);
          }
        } catch (eMir2) { /* ignore */ }

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
      var bubbleInitSizeState = React.useState({ w: 0, h: 0 }); // bubble 档：进入编辑时气泡原宽/原高
      var bubbleInitSize = bubbleInitSizeState[0];
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
      var sPSize = React.useState(messagePreviewSize());
      var pSize = sPSize[0];
      var setPSize = sPSize[1];
      React.useEffect(function () {
        function onSettingsChange(e) {
          if (!e || !e.key || e.key === "dsh-easyrewrite:messagePreviewSize" || (e.detail && e.detail.key === "dsh-easyrewrite:messagePreviewSize")) {
            setPSize(messagePreviewSize());
          }
        }
        window.addEventListener("storage", onSettingsChange);
        window.addEventListener("dsh-easyrewrite:settings-change", onSettingsChange);
        return function () {
          window.removeEventListener("storage", onSettingsChange);
          window.removeEventListener("dsh-easyrewrite:settings-change", onSettingsChange);
        };
      }, []);
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
      var stagedBottomFilesRef = React.useRef([]);    // 气泡编辑期间拖入底部输入框的暂存 File 实体列表（跨会话保留）
      var createdBlobUrlsRef = React.useRef([]);      // 编辑态内自建的临时预览 blob: URL 集合，退出编辑或卸载时统一 revoke 防止内存泄漏

      function createTrackedObjectUrl(file) {
        if (!file || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return "";
        try {
          var u = URL.createObjectURL(file);
          if (u) createdBlobUrlsRef.current.push(u);
          return u;
        } catch (e) {
          return "";
        }
      }

      function revokeTrackedObjectUrls() {
        var urls = createdBlobUrlsRef.current;
        if (!urls || urls.length === 0) return;
        createdBlobUrlsRef.current = [];
        for (var ui = 0; ui < urls.length; ui++) {
          try {
            if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
              URL.revokeObjectURL(urls[ui]);
            }
          } catch (e) {}
        }
      }

      React.useEffect(function () {
        if (!editing) {
          revokeTrackedObjectUrls();
        }
        return function () {
          revokeTrackedObjectUrls();
        };
      }, [editing]);
      /** 把当前编辑图片/文件集合同步进 pending（含 dataUrl 字节快照；超限降级只丢字节、引用仍在） */
      function syncEditImgsToPending(items) {
        try {
          var p = readPending(sessionId);
          if (!p || p.type !== "edit") return;
          var total = 0, stripped = 0;
          var snap = items.map(function (it) {
            var du = it && it.dataUrl ? String(it.dataUrl) : null;
            if (du) total += du.length;
            return {
              id: it.id,
              dataUrl: du,
              name: it.name || undefined,
              size: it.size || undefined,
              type: it.type || undefined,
              isFile: !!it.isFile,
              isOriginal: !!(it.attachment && it.attachment.attachmentId)
            };
          });
          if (total > 4000000) { // localStorage 配额保护：>~4MB 放弃字节持久化（原图仍走 attachRefs 恢复）
            snap = snap.map(function (it) { if (it.dataUrl) { it.dataUrl = null; stripped++; } return it; });
            log("warn", "edit", "编辑附件过大，跳过刷新持久化（本次会话内仍有效）", { stripped: stripped, total: total });
          }
          writePending(sessionId, Object.assign({}, p, { editImgs: snap, editImgsTrackedOriginals: true, updatedAt: Date.now() }));
        } catch (eSp) { /* ignore */ }
      }
      React.useEffect(function () {
        if (!isEditPending || editing) return;
        setEditing(true);
        setEditText(pending.draftText);
        // bug②：刷新/重挂载恢复——原图按 attachRefs 重桥接 + 拖入图/文件按 dataUrl 重建字节。
        // 仅当"挂载时就带着编辑待定"才走恢复（正常点击进入编辑由 enterEdit 自行桥接，避免重复）。
        if (!hadEditPendingAtMount.current || editRestoredRef.current) return;
        editRestoredRef.current = true;
        try {
          var _rpc = contentParts(data.content);
          var _rAtts = _rpc && Array.isArray(_rpc.attachments) ? _rpc.attachments : [];
          var savedList = (pending && Array.isArray(pending.editImgs)) ? pending.editImgs : [];
          var trackedOriginals = !!(pending && pending.editImgsTrackedOriginals && Array.isArray(pending.editImgs));
          var restoreInitItems = [];
          for (var _ri = 0; _ri < _rAtts.length; _ri++) {
            var _rEntry = _rAtts[_ri];
            var _rAtt = _rEntry && _rEntry.attachment;
            if (!_rAtt) continue;
            if (trackedOriginals && _rAtt.attachmentId) {
              var stillKept = savedList.some(function (sv) { return sv && sv.id === _rAtt.attachmentId; });
              if (!stillKept) continue;
            }
            var _rIsFile = _rEntry.type === "file";
            restoreInitItems.push({
              id: _rAtt.attachmentId || ((_rIsFile ? "file-" : "img-") + _ri + "-" + Date.now()),
              name: _rAtt.name || (_rIsFile ? "file" : "image.png"),
              size: typeof _rAtt.bytes === "number" ? _rAtt.bytes : (_rAtt.size || 0),
              type: _rAtt.mediaType || (_rIsFile ? "" : "image/png"),
              url: "",
              isFile: _rIsFile,
              file: null,
              attachment: _rAtt
            });
          }
          for (var si = 0; si < savedList.length; si++) {
            var sv = savedList[si];
            if (!sv || !sv.dataUrl || sv.isOriginal) continue;
            try {
              var sFile = dataUrlToFile(sv.dataUrl, sv.name);
              if (sv.isFile) {
                restoreInitItems.push({
                  id: sv.id || ("file-restored-" + si + "-" + Date.now()),
                  name: sv.name || sFile.name || "file",
                  size: sv.size || sFile.size || 0,
                  type: sv.type || sFile.type || "",
                  url: "",
                  dataUrl: sv.dataUrl,
                  file: sFile,
                  isFile: true
                });
              } else {
                var sD = createDraftImagesCompat([sFile], sessionId);
                if (sD && sD.length > 0) {
                  restoreInitItems.push({ id: sD[0].id, url: sD[0].previewUrl, dataUrl: sv.dataUrl, file: sFile, isFile: false });
                } else {
                  var rBlobUrl1 = createTrackedObjectUrl(sFile);
                  if (rBlobUrl1) {
                    restoreInitItems.push({ id: sv.id || ("img-restored-" + si), url: rBlobUrl1, dataUrl: sv.dataUrl, file: sFile, isFile: false });
                  }
                }
              }
            } catch (eRa) { log("warn", "edit", "恢复拖入图/文件失败", { err: String(eRa && eRa.message ? eRa.message : eRa) }); }
          }
          if (restoreInitItems.length > 0) {
            editImagesRef.current = restoreInitItems;
            setEditImages(restoreInitItems);
          }
          (async function () {
            for (var rbi = 0; rbi < restoreInitItems.length; rbi++) {
              var rCur = restoreInitItems[rbi];
              if (rCur.file instanceof File && (rCur.isFile || rCur.url)) continue;
              try {
                var rResolved = await resolveAttachmentFile(sessionId, rCur, props);
                var rPreview = rCur.url || "";
                if (!rCur.isFile) {
                  if (rResolved instanceof File) {
                    var rDrafts = createDraftImagesCompat([rResolved], sessionId);
                    if (rDrafts && rDrafts.length > 0 && rDrafts[0].previewUrl) {
                      rPreview = rDrafts[0].previewUrl;
                    } else {
                      rPreview = createTrackedObjectUrl(rResolved);
                    }
                  } else if (rCur.attachment) {
                    var rUrlFallback = await resolveImageCompat(sessionId, rCur.attachment, props);
                    if (rUrlFallback) rPreview = rUrlFallback;
                  }
                }
                if (rResolved instanceof File || rPreview) {
                  if (rResolved instanceof File) rCur.file = rResolved;
                  if (rPreview) rCur.url = rPreview;
                  setEditImages(function (prev) {
                    var nxt = prev.map(function (x) {
                      if (x.id !== rCur.id) return x;
                      return Object.assign({}, x, {
                        file: rResolved instanceof File ? rResolved : x.file,
                        url: rPreview || x.url
                      });
                    });
                    editImagesRef.current = nxt;
                    return nxt;
                  });
                }
              } catch (eRo) { log("warn", "edit", "恢复单个原附件失败", { err: String(eRo && eRo.message ? eRo.message : eRo) }); }
            }
            log("info", "edit", "编辑态刷新恢复完成", { count: restoreInitItems.length });
          })();
        } catch (eRe) { log("warn", "edit", "编辑态刷新恢复异常", { err: String(eRe && eRe.message ? eRe.message : eRe) }); }
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
          try {
            var t = e.dataTransfer;
            if (!t) return false;
            if (getDraggedAttachment()) return true;
            if (t.types) {
              var arr = Array.prototype.slice.call(t.types);
              if (arr.indexOf("Files") !== -1) return true;
              if (arr.indexOf("application/x-dsh-easyrewrite-file") !== -1) return true;
            }
            return false;
          } catch (eT) { return false; }
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
            var rawFiles = [];
            var dt = e.dataTransfer;
            if (dt && dt.files) {
              for (var di = 0; di < dt.files.length; di++) {
                if (dt.files[di]) rawFiles.push(dt.files[di]);
              }
            }
            var dragged = getDraggedAttachment();
            if (rawFiles.length === 0 && dragged) {
              if (dragged.file instanceof File) {
                rawFiles.push(dragged.file);
              }
            }
            if (rawFiles.length === 0) return;

            if (isBottom) {
              // 分流 A：释放到底部输入框暂存区（通用文件与图片无缝兼容）
              var ia = props.inputActions;
              if (ia && typeof ia.addFiles === "function") {
                try {
                  ia.addFiles(rawFiles);
                  log("info", "edit", "文件已通过 ia.addFiles 暂存至官方输入框", { count: rawFiles.length });
                  clearDraggedAttachment();
                  return;
                } catch (eAf) { /* fallthrough */ }
              }
              var bDrafts = createDraftImagesCompat(rawFiles, sessionId);
              if (bDrafts && bDrafts.length > 0) {
                var bIds = bDrafts.map(function (im) { return im.id; });
                addInputImagesCompat(props.inputActions, bIds);
                stagedBottomImageIdsRef.current = stagedBottomImageIdsRef.current.concat(bIds);
                stagedBottomFilesRef.current = stagedBottomFilesRef.current.concat(rawFiles);
                log("info", "edit", "文件/图片已成功添加到底部输入框暂存区", { count: bIds.length, ids: bIds });
              }
              clearDraggedAttachment();
              return;
            }

            if (!isBubble) {
              clearDraggedAttachment();
              return;
            }

            // 分流 B：释放到气泡编辑区（修改当前消息，同时接纳图片和通用文件）
            if (dragged && dragged.id && editImagesRef.current.some(function (x) { return x.id === dragged.id; })) {
              clearDraggedAttachment();
              return;
            }
            var imgFiles = [];
            var nonImgFiles = [];
            for (var fi = 0; fi < rawFiles.length; fi++) {
              var rf = rawFiles[fi];
              if (isImageFile(rf)) imgFiles.push(rf);
              else nonImgFiles.push(rf);
            }

            var addedItems = [];
            if (imgFiles.length > 0) {
              var dImgs = createDraftImagesCompat(imgFiles, sessionId);
              var imgItems = dImgs.map(function (im, idx) { return { id: im.id, url: im.previewUrl, dataUrl: null, file: imgFiles[idx] }; });
              // 异步补 dataUrl 字节快照（bug② 刷新后可重建）
              for (var ai = 0; ai < imgItems.length; ai++) {
                (function (item, srcFile) {
                  fileToDataUrl(srcFile).then(function (du) {
                    item.dataUrl = du;
                    setEditImages(function (prev) {
                      var nxt = prev.map(function (x) { return x.id === item.id ? Object.assign({}, x, { dataUrl: du }) : x; });
                      syncEditImgsToPending(nxt);
                      return nxt;
                    });
                  }).catch(function () { /* ignore */ });
                })(imgItems[ai], imgFiles[ai]);
              }
              addedItems = addedItems.concat(imgItems);
            }

            if (nonImgFiles.length > 0) {
              var fileItems = nonImgFiles.map(function (nf) {
                return {
                  id: "file-" + Math.random().toString(36).slice(2) + "-" + Date.now(),
                  name: nf.name || "file",
                  size: nf.size || 0,
                  type: nf.type || "",
                  dataUrl: null,
                  isFile: true,
                  file: nf
                };
              });
              for (var nfi = 0; nfi < fileItems.length; nfi++) {
                (function (fItem, srcNf) {
                  if (srcNf && srcNf.size <= 2500000) {
                    fileToDataUrl(srcNf).then(function (du) {
                      fItem.dataUrl = du;
                      setEditImages(function (prev) {
                        var nxt = prev.map(function (x) { return x.id === fItem.id ? Object.assign({}, x, { dataUrl: du }) : x; });
                        editImagesRef.current = nxt;
                        syncEditImgsToPending(nxt);
                        return nxt;
                      });
                    }).catch(function () { /* ignore */ });
                  }
                })(fileItems[nfi], nonImgFiles[nfi]);
              }
              addedItems = addedItems.concat(fileItems);
            }

            setEditImages(function (prev) { var nxt = prev.concat(addedItems); editImagesRef.current = nxt; syncEditImgsToPending(nxt); return nxt; });
            log("info", "edit", "拦截到拖入文件至气泡", { imgs: imgFiles.length, files: nonImgFiles.length, total: addedItems.length });
            clearDraggedAttachment();
          } catch (eDr) { log("warn", "edit", "拖入拦截异常", { err: String(eDr && eDr.message ? eDr.message : eDr) }); clearDraggedAttachment(); }
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

      // 渲染时无条件缓存消息图片与文件 refs（confirmEdit / 撤回 异步回调安全读取）
      var _pcCache = contentParts(data.content);
      var _attsCache = _pcCache && _pcCache.attachments ? _pcCache.attachments : [];
      if (_attsCache.length > 0) {
        var _arC = [];
        for (var _aci = 0; _aci < _attsCache.length; _aci++) {
          var _itemC = _attsCache[_aci];
          var _ca2 = _itemC && _itemC.attachment;
          if (_ca2 && typeof _ca2.attachmentId === "string") {
            _arC.push({
              attachmentId: _ca2.attachmentId,
              mediaType: _ca2.mediaType || "",
              name: _ca2.name || (_itemC.type === "file" ? "file" : "image.png"),
              isFile: _itemC.type === "file"
            });
          }
        }
        if (_arC.length > 0) setCachedEditMsg(myKey, { seq: (data && typeof data.seq === "number") ? data.seq : anchorSeq, attachRefs: _arC });
      }



      // 统计该消息之后的内容条数（x 条内容）——防御式读取：任何异常都不影响气泡渲染
      var anchorSeq = node && typeof node.anchorSeq === "number" ? node.anchorSeq : (node && typeof node.seq === "number" ? node.seq : 0);
      var afterCount = 0;
      var onlyUser = statOnlyUser();
      var snapshot = getChatSnapshot(props);
      try {
        // 注意：useSession 必须传 selector（官方 bindSnapshotSelector 契约），无参调用会崩
        // snapshot 已在 try 外读取（由外层 Hook Gate 预解析注入，避免 try/catch 内调 Hook）
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
      function enterEdit(initWidth, initHeight) {
        if (pending) { log("warn", "edit", "已有待处理操作（单待定约束），请先处理"); return; }
        var realSeq = (data && typeof data.seq === "number") ? data.seq : anchorSeq;
        writePending(sessionId, { type: "edit", targetKey: myKey, targetSeq: realSeq, draftText: text, updatedAt: Date.now() });
        bubbleInitSizeState[1]({ w: initWidth && initWidth > 0 ? initWidth : 0, h: initHeight && initHeight > 0 ? initHeight : 0 });
        setEditing(true);
        setEditText(text);
        setEditSel(null);
        stagedBottomImageIdsRef.current = []; // 暂存列表重置
        stagedBottomFilesRef.current = [];
        log("info", "edit", "进入编辑态", { sessionId: sessionId, targetSeq: realSeq, initW: initWidth, initH: initHeight });
        // 同步按原消息顺序构建附件工作集（杜绝图片异步后置导致顺序颠倒，且确保点击“确定”零延迟可读）
        try {
          var _epc = contentParts(data.content);
          var _rawAtts = _epc && Array.isArray(_epc.attachments) ? _epc.attachments : [];
          var initialItems = [];
          for (var _ai = 0; _ai < _rawAtts.length; _ai++) {
            var _entry = _rawAtts[_ai];
            var _att = _entry && _entry.attachment;
            if (!_att) continue;
            var _isFile = _entry.type === "file" || (_att && !isImageFileName(_att.name));
            initialItems.push({
              id: _att.attachmentId || ((_isFile ? "file-" : "img-") + _ai + "-" + Date.now()),
              name: _att.name || (_isFile ? "file" : "image.png"),
              size: typeof _att.bytes === "number" ? _att.bytes : (_att.size || 0),
              type: _att.mediaType || (_isFile ? guessMimeType(_att.name) : "image/png"),
              url: "",
              isFile: _isFile,
              file: null,
              attachment: _att
            });
          }
          editImagesRef.current = initialItems;
          setEditImages(initialItems);
          if (initialItems.length > 0) {
            log("info", "edit", "enterEdit 附件工作集已同步就绪", { count: initialItems.length });
            (async function () {
              for (var bi2 = 0; bi2 < initialItems.length; bi2++) {
                var curItem = initialItems[bi2];
                try {
                  var resolvedFile = await resolveAttachmentFile(sessionId, curItem, props);
                  var previewUrl = curItem.url || "";
                  if (!curItem.isFile) {
                    if (resolvedFile instanceof File) {
                      var dList = createDraftImagesCompat([resolvedFile], sessionId);
                      if (dList && dList.length > 0 && dList[0].previewUrl) {
                        previewUrl = dList[0].previewUrl;
                      } else {
                        previewUrl = createTrackedObjectUrl(resolvedFile);
                      }
                    } else {
                      var fallbackUrl = await resolveImageCompat(sessionId, curItem.attachment, props);
                      if (fallbackUrl) previewUrl = fallbackUrl;
                    }
                  }
                  if (resolvedFile instanceof File || previewUrl) {
                    if (resolvedFile instanceof File) curItem.file = resolvedFile;
                    if (previewUrl) curItem.url = previewUrl;
                    setEditImages(function (prev) {
                      var nxt = prev.map(function (x) {
                        if (x.id !== curItem.id) return x;
                        return Object.assign({}, x, {
                          file: resolvedFile instanceof File ? resolvedFile : x.file,
                          url: previewUrl || x.url
                        });
                      });
                      editImagesRef.current = nxt;
                      return nxt;
                    });
                  }
                } catch (eBr) {
                  log("warn", "edit", "enterEdit 单个附件解析异常", { id: curItem.id, err: String(eBr && eBr.message ? eBr.message : eBr) });
                }
              }
            })();
          }
        } catch (eEe) { /* ignore */ }
      }
      function cancelEdit() {
        if (isEditPending) writePending(sessionId, null);
        setEditing(false);
        log("info", "edit", "编辑取消（原样不变）");
      }
      // editInFlightRef 已前置到组件顶部 Hook 区（防止 early return 后执行触发 React #300）
      async function confirmEdit() {
        if (editInFlightRef.current) return;
        editInFlightRef.current = true;
        setPrimaryButtonSendingState(true);
        try {
          // 惰性提交：编辑的「确定」= 真正修改点（与撤回的「发送」等价）——截断重发
          var newText = editText;
          var sid = sessionId;
          var realSeq = (data && typeof data.seq === "number") ? data.seq : anchorSeq;
          // 读取最新的附件工作集引用（避免闭包陈旧值导致直接点确定时漏掉附件）
          var activeEditItems = (editImagesRef.current && editImagesRef.current.length > 0) ? editImagesRef.current.slice() : editImages.slice();
          var editImgIds = activeEditItems.map(function(x) { return x.id; });
          // v2.2：编辑态模型 chip 的本地选择优先；未动 chip → 维持 v2.1.1 捕获（输入框当前值）
          var msel = editSel || (props.modelSel ? props.modelSel.capture(sid) : null);

          // 收集底部输入框暂存草稿（文本与图片/通用文档）：新会话中隔离保留
          var bDraftText = "";
          try { bDraftText = readCurrentComposerText(""); } catch (eBT) { /* ignore */ }
          var bImgIds = [];
          try {
            bImgIds = getInputImageIdsCompat(props.inputState);
          } catch (eBImgs) { /* ignore */ }
          if (bImgIds.length === 0 && stagedBottomImageIdsRef.current.length > 0) {
            bImgIds = stagedBottomImageIdsRef.current.slice();
          }
          var bottomFiles = [];
          try {
            bottomFiles = await extractBottomDraftFiles(sid, bImgIds, props, stagedBottomFilesRef.current);
          } catch (eExBf) {
            log("warn", "edit", "提取底部草稿文件异常", { err: String(eExBf && eExBf.message ? eExBf.message : eExBf) });
          }
          var stagedDraftPayload = (bDraftText || (bottomFiles && bottomFiles.length > 0) || (bImgIds && bImgIds.length > 0)) ? {
            text: bDraftText,
            imageIds: bImgIds,
            hasFiles: bottomFiles.length > 0
          } : null;

          setEditing(false);
          log("info", "edit", "确定：编辑重发", { sessionId: sid, targetSeq: realSeq, len: newText.length, hasStaged: !!stagedDraftPayload });
          var resp = await fetch("/bubble/recall", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId: sid, targetSeq: realSeq })
          });
          var data = await resp.json();
          var isNoBoundaryEdit = false;
          if (!data || !data.ok) {
            var errCode2 = (data && data.error) || "unknown";
            log("warn", "edit", "编辑重发边界返回非普通分支", { error: errCode2 });
            if (errCode2 === "no-boundary") {
              isNoBoundaryEdit = true;
            } else if (errCode2 === "turn-open") {
              setPrimaryButtonSendingState(false);
              setEditing(true);
              setOpError(L.turnOpenNotice || L.errGeneric);
              setTimeout(function () { setOpError(null); }, 5000);
              return;
            } else {
              // review M3：失败恢复编辑态（草稿仍在 editText），不丢内容；显示可见原因
              setPrimaryButtonSendingState(false);
              setEditing(true);
              setOpError(L.errGeneric);
              setTimeout(function () { setOpError(null); }, 5000);
              return;
            }
          }
          // 影子仓储预保存：在截断/创建新版本前将当前完整会话备份为快照
          try {
            fetch("/bubble/vault/save", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId: sid, summary: "编辑重发前完整快照" }),
              keepalive: true
            }).catch(function () {});
          } catch (eVs) {}
          var newId = null;
          if (isNoBoundaryEdit) {
            newId = await createBlankChildSession(sid, props);
            if (!newId) {
              log("error", "edit", "首条消息创建空白新会话失败（编辑重发中止）");
              setPrimaryButtonSendingState(false);
              setEditing(true);
              setOpError(L.errGeneric);
              setTimeout(function () { setOpError(null); }, 5000);
              return;
            }
          } else {
            try {
              newId = await props.ctxSessions.fork({ sessionId: sid, atSeq: data.boundary });
            } catch (e) {
              var emEdit = String(e && e.message ? e.message : e);
              log("error", "edit", "fork 失败", { err: emEdit });
              if (/has no completed turn to fork from/i.test(emEdit)) {
                newId = await createBlankChildSession(sid, props);
                if (!newId) {
                  setPrimaryButtonSendingState(false);
                  setEditing(true);
                  setOpError(L.errGeneric);
                  setTimeout(function () { setOpError(null); }, 5000);
                  return;
                }
              } else {
                setPrimaryButtonSendingState(false);
                setEditing(true); // 恢复编辑态
                setOpError(/has not completed the turn/i.test(emEdit) ? (L.turnOpenNotice || L.errGeneric) : L.errGeneric);
                setTimeout(function () { setOpError(null); }, 5000);
                return;
              }
            }
          }
          // Issue #10 根治防御：fork 成功返回即请求 Host 端物理拔除继承的幽灵旧消息
          await requestCleanGhostQueue(newId);
          // review M6：resume-send 带 TTL 时间戳；M4：图片与文件附件引用随行（重发保留）；stagedDraft：新会话草稿隔离保留
          var editAttachRefs = [];
          try {
            var outgoingFiles = [];
            for (var ofi = 0; ofi < activeEditItems.length; ofi++) {
              var it = activeEditItems[ofi];
              if (!it) continue;
              if (it.attachment && typeof it.attachment.attachmentId === "string") {
                editAttachRefs.push({
                  attachmentId: it.attachment.attachmentId,
                  mediaType: it.attachment.mediaType || it.type || "",
                  name: it.attachment.name || it.name || (it.isFile ? "file" : "image.png"),
                  isFile: !!it.isFile
                });
              }
              if (it.file instanceof File) {
                outgoingFiles.push(it.file);
              } else {
                try {
                  var fallbackFile = await resolveAttachmentFile(sid, it, props);
                  if (fallbackFile && fallbackFile instanceof File) {
                    it.file = fallbackFile;
                    outgoingFiles.push(fallbackFile);
                  }
                } catch (eFf) { /* ignore */ }
              }
            }
            if (outgoingFiles.length > 0) stageOutgoingFiles(newId, outgoingFiles);
          } catch (eOf) { /* ignore */ }
          if (bottomFiles && bottomFiles.length > 0) {
            stageBottomDraftFiles(newId, bottomFiles);
          }
          try {
            localStorage.setItem("dsh-easyrewrite:resume-send:" + newId, JSON.stringify({
              draftText: newText,
              t: Date.now(),
              imageIds: editImgIds,
              attachRefs: editAttachRefs,
              sel: msel,
              stagedDraft: stagedDraftPayload
            }));
          } catch (e) { /* ignore */ }

          var opened2 = safeOpenSession(newId, props);
          if (!opened2) {
            log("error", "edit", "打开新会话失败，回滚状态", { newId: newId });
            try { localStorage.removeItem("dsh-easyrewrite:resume-send:" + newId); } catch (e) {}
            setPrimaryButtonSendingState(false);
            setEditing(true);
            setOpError(L.errGeneric);
            return;
          }
          try {
            fetch("/bubble/vault/retire-session", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId: sid, replacementSessionId: newId }),
              keepalive: true
            }).catch(function () {});
          } catch (eRet) { log("warn", "edit", "移入影子仓储失败", { err: String(eRet && eRet.message ? eRet : eRet) }); }
          log("info", "edit", "编辑重发：打开新会话 + 原会话移入影子仓储", { newId: newId });
          // 成功打开新会话后再清除 pending
          if (isEditPending) writePending(sid, null);
        } catch (err) {
          log("error", "edit", "编辑重发请求失败", { err: String(err && err.message ? err.message : err) });
          setPrimaryButtonSendingState(false);
          setEditing(true); // 网络异常也恢复编辑态
        } finally {
          editInFlightRef.current = false;
        }
      }
      function onBubbleClick(e) {
        if (editing || confirming) return;
        if (!rewriteOnClick()) return; // 设置关闭：点击气泡不进入编辑（入口在操作区编辑键）
        var sel = window.getSelection && window.getSelection();
        if (sel && typeof sel.toString === "function" && sel.toString().length > 0) return; // 有选区不进入
        if (e.target && typeof e.target.closest === "function" && e.target.closest("a")) return; // 点链接不进入
        var el = e.currentTarget;
        enterEdit(el ? el.offsetWidth : 0, el ? el.offsetHeight : 0);
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
        var safetyW = calcBtnRowMinWidth(L.cancel, L.confirm);
        var editBoxW = editWidthFor(editMode, editText, bubbleInitSize.w, safetyW);
        var lineCount = (editText.match(/\n/g) || []).length + 1;
        var taRows = Math.max(1, Math.min(100, lineCount));
        var editBoxStyle = {
          width: "100%",
          maxWidth: editBoxW,
          minHeight: bubbleInitSize.h > 0 ? bubbleInitSize.h + "px" : undefined,
          boxSizing: "border-box",
          position: "relative",
          background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.12))",
          borderRadius: "14px",
          padding: "8px 14px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: "6px"
        };
        var taStyle = {
          width: "100%",
          flex: "1 1 auto",
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
          maxHeight: "70vh",
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
                var rawFiles = [];
                if (dt && dt.files) {
                  for (var di = 0; di < dt.files.length; di++) {
                    if (dt.files[di]) rawFiles.push(dt.files[di]);
                  }
                }
                var dragged = getDraggedAttachment();
                if (rawFiles.length === 0 && dragged) {
                  if (dragged.file instanceof File) rawFiles.push(dragged.file);
                }
                if (rawFiles.length === 0) return;
                if (dragged && dragged.id && editImagesRef.current.some(function(x) { return x.id === dragged.id; })) {
                  return;
                }
                var imgFiles = [];
                var nonImgFiles = [];
                for (var fi = 0; fi < rawFiles.length; fi++) {
                  var df = rawFiles[fi];
                  if (isImageFile(df)) imgFiles.push(df);
                  else nonImgFiles.push(df);
                }
                var addedItems = [];
                if (imgFiles.length > 0) {
                  var dImgs = createDraftImagesCompat(imgFiles, sessionId);
                  var newImgs = dImgs.map(function(im, idx) { return { id: im.id, url: im.previewUrl, file: imgFiles[idx] }; });
                  addedItems = addedItems.concat(newImgs);
                }
                if (nonImgFiles.length > 0) {
                  var newFiles = nonImgFiles.map(function(nf) {
                    return {
                      id: "file-" + Math.random().toString(36).slice(2) + "-" + Date.now(),
                      name: nf.name || "file",
                      size: nf.size || 0,
                      type: nf.type || guessMimeType(nf.name),
                      dataUrl: null,
                      isFile: true,
                      file: nf
                    };
                  });
                  addedItems = addedItems.concat(newFiles);
                }
                if (addedItems.length > 0) {
                  setEditImages(function(prev) { var nxt = prev.concat(addedItems); editImagesRef.current = nxt; syncEditImgsToPending(nxt); return nxt; });
                  log("info", "edit", "拖入附件已加入编辑", { count: addedItems.length });
                }
                clearDraggedAttachment();
              } catch (eDr) { log("warn", "edit", "拖入处理异常", { err: String(eDr && eDr.message ? eDr.message : eDr) }); clearDraggedAttachment(); }
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
              if (ei.isFile) {
                return React.createElement("div", {
                  key: ei.id,
                  draggable: true,
                  "data-easyrewrite-file-card": "1",
                  style: {
                    position: "relative",
                    boxSizing: "border-box",
                    width: thumbSize + "px", height: thumbSize + "px",
                    borderRadius: "8px",
                    border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))",
                    background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08))",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "6px 4px",
                    gap: "4px",
                    textAlign: "center",
                    overflow: "hidden",
                    transition: "width .15s ease, height .15s ease",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    MozUserSelect: "none",
                    cursor: "grab"
                  },
                  title: ei.name || "文件",
                  onDragStart: function (e) {
                    handleAttachmentDragStart(e, ei, sessionId, props);
                  },
                  onDragEnd: function (e) {
                    handleAttachmentDragEnd(e);
                  }
                },
                  React.createElement("div", { style: { flex: "none", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" } },
                    renderFileTypeIcon(ei.name, 28)
                  ),
                  React.createElement("span", {
                    style: {
                      width: "100%",
                      maxWidth: "100%",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      overflow: "hidden",
                      fontSize: "11px",
                      lineHeight: "14px",
                      fontWeight: 500,
                      color: "var(--dsw-alias-label-primary)",
                      textAlign: "center",
                      padding: "0 2px",
                      userSelect: "none",
                      pointerEvents: "none"
                    }
                  }, ei.name || "file"),
                  React.createElement("button", {
                    type: "button",
                    onClick: function (ev) {
                      ev.stopPropagation();
                      var nxtRm = editImagesRef.current.filter(function (x) { return x.id !== ei.id; });
                      editImagesRef.current = nxtRm;
                      setEditImages(nxtRm);
                      syncEditImgsToPending(nxtRm);
                    },
                    style: {
                      position: "absolute", top: "2px", right: "2px", width: "18px", height: "18px",
                      borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.55)",
                      color: "#fff", fontSize: "12px", lineHeight: "18px", textAlign: "center",
                      cursor: "pointer", padding: "0"
                    },
                    title: "移除文件"
                  }, "\u00d7")
                );
              }
              // boxSizing:border-box：1px 边框计入 thumbSize（content-box 下每张多占 2px，会挤走第 4 张——已踩坑）
              return React.createElement("div", {
                key: ei.id,
                draggable: true,
                "data-easyrewrite-img-card": "1",
                style: {
                  position: "relative",
                  boxSizing: "border-box",
                  width: thumbSize + "px",
                  height: thumbSize + "px",
                  borderRadius: "8px",
                  overflow: "hidden",
                  border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))",
                  transition: "width .15s ease, height .15s ease",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  MozUserSelect: "none",
                  cursor: "grab"
                },
                onDragStart: function (e) {
                  handleAttachmentDragStart(e, ei, sessionId, props);
                },
                onDragEnd: function (e) {
                  handleAttachmentDragEnd(e);
                }
              },
                ei.url
                  ? React.createElement("img", { src: ei.url, draggable: false, style: { width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" } })
                  : React.createElement("div", { style: { width: "100%", height: "100%", background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08))" } }),
                React.createElement("button", { type: "button", onClick: function(ev) { ev.stopPropagation(); var nxtRm = editImagesRef.current.filter(function(x) { return x.id !== ei.id; }); editImagesRef.current = nxtRm; setEditImages(nxtRm); syncEditImgsToPending(nxtRm); }, style: { position: "absolute", top: "2px", right: "2px", width: "18px", height: "18px", borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: "12px", lineHeight: "18px", textAlign: "center", cursor: "pointer", padding: "0" }, title: "移除图片" }, "\u00d7")
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
              ref: function (taEl) {
                if (taEl && !taEl.__autoHeightDone) {
                  taEl.__autoHeightDone = true;
                  taEl.style.height = "auto";
                  taEl.style.height = Math.max(taEl.scrollHeight, 24) + "px";
                }
              },
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
                  var imgFiles = [];
                  for (var pi = 0; pi < items.length; pi++) {
                    if (items[pi].type && items[pi].type.indexOf("image") === 0) {
                      var pf = items[pi].getAsFile();
                      if (pf) imgFiles.push(pf);
                    }
                  }
                  if (imgFiles.length > 0) {
                    e.preventDefault();
                    var pImgs = createDraftImagesCompat(imgFiles, sessionId);
                    if (pImgs && pImgs.length > 0) {
                      var newItems = pImgs.map(function(im, idx) { return { id: im.id, url: im.previewUrl, dataUrl: null, file: imgFiles[idx] }; });
                      setEditImages(function(prev) { var nxt = prev.concat(newItems); editImagesRef.current = nxt; syncEditImgsToPending(nxt); return nxt; });
                      imgFiles.forEach(function (f, fIdx) {
                        var targetItem = newItems[fIdx];
                        if (targetItem) {
                          fileToDataUrl(f).then(function (du) {
                            targetItem.dataUrl = du;
                            setEditImages(function (prev2) {
                              var nxt2 = prev2.map(function (x) { return x.id === targetItem.id ? Object.assign({}, x, { dataUrl: du }) : x; });
                              editImagesRef.current = nxt2;
                              syncEditImgsToPending(nxt2);
                              return nxt2;
                            });
                          }).catch(function () { /* ignore */ });
                        }
                      });
                    }
                  }
                } catch (pe) { /* ignore */ }
              },
            }),
            React.createElement(
              "div", { style: btnRowStyle },
              (props.modelDirectories || getModelDirectories()) ? React.createElement(EditModelPicker, { sessionId: sessionId, modelDirectories: props.modelDirectories || getModelDirectories(), selection: editSel, onChange: setEditSel }) : null,
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

      // 气泡上方渲染消息中的图片与文件附件（覆盖 chat.node 后官方附件槽不再自动注入）
      var pc = contentParts(data.content);
      var msgImages = pc && pc.images ? pc.images : [];
      var msgFiles = pc && pc.files ? pc.files : [];
      var hasTextContent = typeof text === "string" && text.trim().length > 0;
      var hasAttachments = msgImages.length > 0 || msgFiles.length > 0;
      var shouldRenderBubble = hasTextContent || !hasAttachments;

      return React.createElement(
        "div", { style: rowStyle, "data-dsh-easyrewrite": "user", "data-preview-size": pSize, "data-time-hover-root": true },
        renderMessageAttachmentsCompat(pc, props, pSize),
        shouldRenderBubble ? React.createElement(
          "div", { className: "dsh-easyrewrite-bubble", style: bubbleStyle, onClick: onBubbleClick, title: L.clickEdit },
          text || L.emptyMsg
        ) : null,
        confirming
          ? React.createElement(ConfirmCapsule, {
              text: afterCount === 0 ? L.recallText0 : (onlyUser ? L.recallTextQ.replace("{n}", String(afterCount)) : L.recallTextC.replace("{n}", String(afterCount))),
              onConfirm: async function () {
                setConfirming(false);
                // 惰性提交：此刻只记录 pending + 回填输入框，真正修改发生在「发送」时
                // 注意：anchorSeq 对窗口外历史消息会退化，必须用 node.data.seq（UserMessageNode 的真实事件 seq）
                var conflictMode = draftConflictMode();
                var visualMode = recallVisualMode();
                var realSeq = (data && typeof data.seq === "number") ? data.seq : anchorSeq;
                // 撤回确认：先收集本条消息图片与文件 refs（随 pending 持久化，发送时 imageIds 失效的兜底）
                var rcAt = [];
                try {
                  if (data && Array.isArray(data.content)) {
                    for (var rcAi = 0; rcAi < data.content.length; rcAi++) {
                      var rcAb = data.content[rcAi];
                      if (rcAb && (rcAb.type === "image" || rcAb.type === "file") && rcAb.attachment && typeof rcAb.attachment.attachmentId === "string") {
                        rcAt.push({
                          attachmentId: rcAb.attachment.attachmentId,
                          mediaType: rcAb.attachment.mediaType || "",
                          name: rcAb.attachment.name || (rcAb.type === "image" ? "image.png" : "file"),
                          isFile: rcAb.type === "file"
                        });
                      }
                    }
                  }
                } catch (e) { /* ignore */ }

                // 核心隔离防护：收集用户当前输入框原草稿（文本与真实附件 File 实例）
                var userOrigDraft = (draftRef && typeof draftRef.current === "string") ? draftRef.current : "";
                if (!userOrigDraft && props && props.inputActions) {
                  try { userOrigDraft = readCurrentComposerText("", props); } catch (eText) {}
                }
                var preUserImageIds = [];
                try {
                  preUserImageIds = getInputImageIdsCompat(props.inputState);
                } catch (e) { /* ignore */ }
                var userOrigFiles = [];
                try {
                  userOrigFiles = await extractBottomDraftFiles(sessionId, preUserImageIds, props, []);
                } catch (eExBf) {
                  log("warn", "recall", "提取原草稿附件文件失败", { err: String(eExBf) });
                }
                if (userOrigFiles && userOrigFiles.length > 0) {
                  stageRecallOriginalFiles(sessionId, userOrigFiles);
                } else {
                  clearRecallOriginalFiles(sessionId);
                }

                writePending(sessionId, {
                  type: "recall",
                  targetKey: myKey,
                  targetSeq: realSeq,
                  draftText: text,
                  originalDraft: userOrigDraft,
                  hasOriginalFiles: !!(userOrigFiles && userOrigFiles.length > 0),
                  conflictMode: conflictMode,
                  visualMode: visualMode,
                  attachRefs: rcAt,
                  preUserImageIds: preUserImageIds,
                  updatedAt: Date.now()
                });

                var ia = props.inputActions;
                // 清理输入框原有附件（隔离原草稿附件，严禁与撤回附件混杂或混发）
                try { pruneInputImagesCompat(ia, []); } catch (ePrune) {}

                // 填入被撤回消息纯文本（严禁与下方原有草稿拼接 merge，原草稿由暂存池在取消或发送后负责复原）
                if (ia && typeof ia.setDraft === "function") {
                  ia.setDraft(text);
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
                : actionButton("撤回", "撤回", async function (e) {
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
                      var rcAt2 = [];
                      try {
                        if (data && Array.isArray(data.content)) {
                          for (var rcAi2 = 0; rcAi2 < data.content.length; rcAi2++) {
                            var rcAb2 = data.content[rcAi2];
                            if (rcAb2 && (rcAb2.type === "image" || rcAb2.type === "file") && rcAb2.attachment && typeof rcAb2.attachment.attachmentId === "string") {
                              rcAt2.push({
                                attachmentId: rcAb2.attachment.attachmentId,
                                mediaType: rcAb2.attachment.mediaType || "",
                                name: rcAb2.attachment.name || (rcAb2.type === "image" ? "image.png" : "file"),
                                isFile: rcAb2.type === "file"
                              });
                            }
                          }
                        }
                      } catch (eRc) { /* ignore */ }

                      // 核心隔离防护：收集用户当前输入框原草稿（文本与真实附件 File 实例）
                      var userOrigDraft2 = (draftRef && typeof draftRef.current === "string") ? draftRef.current : "";
                      if (!userOrigDraft2 && props && props.inputActions) {
                        try { userOrigDraft2 = readCurrentComposerText("", props); } catch (eText2) {}
                      }
                      var preUserImageIds2 = [];
                      try {
                        preUserImageIds2 = getInputImageIdsCompat(props.inputState);
                      } catch (ePre) { /* ignore */ }
                      var userOrigFiles2 = [];
                      try {
                        userOrigFiles2 = await extractBottomDraftFiles(sessionId, preUserImageIds2, props, []);
                      } catch (eExBf2) {
                        log("warn", "recall", "提取原草稿附件文件失败", { err: String(eExBf2) });
                      }
                      if (userOrigFiles2 && userOrigFiles2.length > 0) {
                        stageRecallOriginalFiles(sessionId, userOrigFiles2);
                      } else {
                        clearRecallOriginalFiles(sessionId);
                      }

                      writePending(sessionId, {
                        type: "recall", targetKey: myKey, targetSeq: rSeq, draftText: text,
                        originalDraft: userOrigDraft2, hasOriginalFiles: !!(userOrigFiles2 && userOrigFiles2.length > 0),
                        conflictMode: cMode, visualMode: vMode,
                        attachRefs: rcAt2, preUserImageIds: preUserImageIds2,
                        updatedAt: Date.now()
                      });
                      var ia2 = props.inputActions;
                      // 清理输入框原有附件（隔离原草稿附件，严禁与撤回附件混杂或混发）
                      try { pruneInputImagesCompat(ia2, []); } catch (ePrune2) {}

                      // 填入被撤回消息纯文本（严禁与下方原有草稿拼接 merge）
                      if (ia2 && typeof ia2.setDraft === "function") {
                        ia2.setDraft(text);
                      }
                      try {
                        if (rcAt2.length > 0) {
                          rebuildDraftAttachments(rcAt2, props, sessionId, true).then(function (n) {
                            log("info", "attach", "直接撤回后输入框图预览重建", { count: n, total: rcAt2.length });
                          });
                        }
                      } catch (eAt2) { log("warn", "attach", "直接撤回图形预览重建失败", { err: String(eAt2 && eAt2.message ? eAt2.message : eAt2) }); }
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

function UserBubbleView(props) {
  return renderWithChatAndInputGate(UserBubbleViewInner, props);
}

export { UserBubbleView };
