import { log } from "../../core/log.js";
import { serviceRefs, resolveImageCompat, resolveAttachmentFile, createDraftImagesCompat, addInputImagesCompat, getInputImageIdsCompat } from "../../core/services.js";

// ---------- 图片桥接（review #3）：跨会话传递交官方全局 draftAttachments 单例，只记 imageIds ----------
export const pendingAttachIds = [];
export const cachedEditMsg = {}; // 消息图refs缓存（渲染时填充，confirmEdit 异步回调读取）
export const latestInputImageIds = []; // 输入框当前图 id 镜像
export const cachedRebuiltFiles = {}; // 会话图文件缓存（rebuildDraftAttachments 填充）
export const stagedSessionFiles = new Map(); // 跨会话暂存文件池：targetSessionId -> File[]

// ---------- 文件/图片卡片拖拽与全局传输流转管理器 ----------
let currentDraggedAttachment = null;

export function setDraggedAttachment(item) {
  currentDraggedAttachment = item;
  if (typeof window !== "undefined") {
    window.__dshEasyRewrite_draggedFile = item && item.file ? item.file : null;
    window.__dshEasyRewrite_draggedItem = item;
  }
}

export function getDraggedAttachment() {
  if (currentDraggedAttachment) return currentDraggedAttachment;
  if (typeof window !== "undefined" && window.__dshEasyRewrite_draggedItem) {
    return window.__dshEasyRewrite_draggedItem;
  }
  return null;
}

export function clearDraggedAttachment() {
  currentDraggedAttachment = null;
  if (typeof window !== "undefined") {
    delete window.__dshEasyRewrite_draggedFile;
    delete window.__dshEasyRewrite_draggedItem;
  }
}

export function handleAttachmentDragStart(e, item, sessionId, props) {
  if (!e) return;
  var file = item && item.file;
  var dragInfo = {
    id: item.id || (item.attachment && item.attachment.attachmentId),
    name: item.name || (file && file.name) || "file",
    file: file instanceof File ? file : null,
    isFile: !!item.isFile,
    sessionId: sessionId,
    attachment: item.attachment || null
  };
  setDraggedAttachment(dragInfo);

  if (e.dataTransfer) {
    try {
      e.dataTransfer.effectAllowed = "copyMove";
      e.dataTransfer.setData("application/x-dsh-easyrewrite-file", JSON.stringify({
        id: dragInfo.id,
        name: dragInfo.name,
        isFile: dragInfo.isFile
      }));
      e.dataTransfer.setData("text/plain", dragInfo.name);

      if (file instanceof File && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
        try {
          var u = URL.createObjectURL(file);
          e.dataTransfer.setData("text/uri-list", u);
          var mime = file.type || (dragInfo.isFile ? "application/octet-stream" : "image/png");
          e.dataTransfer.setData("DownloadURL", mime + ":" + dragInfo.name + ":" + u);
          setTimeout(function () {
            try { URL.revokeObjectURL(u); } catch (eU) {}
          }, 60000);
        } catch (eBlob) {}
      }
    } catch (eDt) { /* ignore */ }
  }
}

export function handleAttachmentDragEnd(e) {
  clearDraggedAttachment();
}

    // ---------- 编辑附件保留（M4 闭环）：历史图片与文件附件 → 官方草稿附件 ----------
    // 流程：resolveAttachmentFile 取 File 实例 → ctx.conversation.createDrafts → inputActions.addAttachments
    async function rebuildDraftAttachments(attachmentRefs, props, sessionId, recordPending) {
      var added = 0;
      if (!attachmentRefs || !Array.isArray(attachmentRefs) || attachmentRefs.length === 0) return added;
      try {
        var files = [];
        for (var i = 0; i < attachmentRefs.length; i++) {
          var ref = attachmentRefs[i];
          if (!ref || typeof ref.attachmentId !== "string") { log("warn", "attach", "附件引用缺 attachmentId", { i: i }); continue; }
          try {
            var fileObj = await resolveAttachmentFile(sessionId, ref, props);
            if (fileObj && fileObj instanceof File) {
              files.push(fileObj);
              log("info", "attach", "已构造 File 并写缓存", { name: fileObj.name, type: fileObj.type, size: fileObj.size });
            } else {
              log("warn", "attach", "resolveAttachmentFile 返回空", { attachmentId: ref.attachmentId, name: ref.name });
            }
          } catch (e) { log("warn", "attach", "重建单个附件失败", { attachmentId: ref.attachmentId, err: String(e && e.message ? e.message : e) }); }
        }
        if (files.length > 0) {
          if (sessionId) cachedRebuiltFiles[sessionId] = files.slice();
          // 优先尝试官方通用附件直注接口 addFiles（DSH 0.2+ 标准）
          var ia = props && props.inputActions;
          if (ia && typeof ia.addFiles === "function") {
            try {
              ia.addFiles(files);
              log("info", "attach", "通过 inputActions.addFiles 原生重建附件成功", { count: files.length });
              return files.length;
            } catch (eAf) {
              log("warn", "attach", "inputActions.addFiles 抛错，降级至图片草稿接口", { err: String(eAf && eAf.message ? eAf.message : eAf) });
            }
          }
          try {
            var images = createDraftImagesCompat(files, sessionId);
            if (images && images.length > 0) {
              var ids = images.map(function (img) { return img.id; });
              var addOk = addInputImagesCompat(props.inputActions, ids);
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
          log("warn", "attach", "无可重建文件（缓存未命中+resolveImage/fetch 均失败）", { refsLen: attachmentRefs.length });
        }
      } catch (e) { log("error", "attach", "rebuildDraftAttachments 外层异常", { err: String(e && e.message ? e.message : e) }); }
      return added;
    }

export { rebuildDraftAttachments };

export function clearPendingAttachIds() {
  pendingAttachIds.length = 0;
}
export function setLatestInputImageIds(ids) {
  latestInputImageIds.length = 0;
  if (Array.isArray(ids)) {
    for (let i = 0; i < ids.length; i++) latestInputImageIds.push(ids[i]);
  }
}

/** 跨会话带图重发：从当前会话与输入框收集待发送的原生 File 列表（不受会话卸载 releaseDraftAttachment 影响） */
export function collectOutgoingFiles(sessionId, inputState) {
  var collected = [];
  try {
    var ids = getInputImageIdsCompat(inputState);
    var conv = serviceRefs.conversation;
    if (ids.length > 0 && conv && conv.draftAttachments && typeof conv.draftAttachments.get === "function") {
      for (var i = 0; i < ids.length; i++) {
        var item = conv.draftAttachments.get(ids[i]);
        if (item && item.file instanceof File) {
          collected.push(item.file);
        }
      }
    }
  } catch (e) {
    log("warn", "attach", "从输入框草稿收集 File 失败", { err: String(e && e.message ? e.message : e) });
  }
  if (collected.length === 0 && sessionId && cachedRebuiltFiles[sessionId] && cachedRebuiltFiles[sessionId].length > 0) {
    collected = cachedRebuiltFiles[sessionId].slice();
  }
  return collected;
}

/** 将收集到的 File 列表暂存给目标新会话（用于气泡消息重发） */
export function stageOutgoingFiles(targetSessionId, files) {
  if (!targetSessionId || !Array.isArray(files) || files.length === 0) return;
  stagedSessionFiles.set(targetSessionId, files.slice());
  log("info", "attach", "已为新会话暂存发送文件", { targetSessionId: targetSessionId, count: files.length });
}

/** 消费新会话暂存的文件列表（用于气泡消息重发） */
export function consumeStagedFiles(targetSessionId) {
  if (!targetSessionId) return [];
  var files = stagedSessionFiles.get(targetSessionId) || [];
  stagedSessionFiles.delete(targetSessionId);
  return files;
}

// ---------- 底部输入框草稿文件隔离保护池（解决编辑发送后输入框附件消失） ----------
export const stagedBottomDraftFiles = new Map(); // targetSessionId -> File[]

export function stageBottomDraftFiles(targetSessionId, files) {
  if (!targetSessionId || !Array.isArray(files) || files.length === 0) return;
  stagedBottomDraftFiles.set(targetSessionId, files.slice());
  log("info", "attach", "已为新会话暂存底部草稿文件", { targetSessionId: targetSessionId, count: files.length });
}

export function consumeBottomDraftFiles(targetSessionId) {
  if (!targetSessionId) return [];
  var files = stagedBottomDraftFiles.get(targetSessionId) || [];
  stagedBottomDraftFiles.delete(targetSessionId);
  return files;
}

// ---------- 撤回待定时底部草稿文件隔离保护池（解决撤回时草稿文件混杂与发送后丢失） ----------
export const stagedRecallOriginalFiles = new Map(); // sessionId -> File[]

export function stageRecallOriginalFiles(sessionId, files) {
  if (!sessionId) return;
  if (Array.isArray(files) && files.length > 0) {
    stagedRecallOriginalFiles.set(sessionId, files.slice());
    log("info", "attach", "已暂存撤回前输入框原生草稿文件", { sessionId: sessionId, count: files.length });
  } else {
    stagedRecallOriginalFiles.delete(sessionId);
  }
}

export function getRecallOriginalFiles(sessionId) {
  if (!sessionId) return [];
  return stagedRecallOriginalFiles.get(sessionId) || [];
}

export function clearRecallOriginalFiles(sessionId) {
  if (!sessionId) return;
  stagedRecallOriginalFiles.delete(sessionId);
}

/**
 * 统一草稿文件恢复接口：优先走原生 addFiles，支持普通文档并防止图片解析破图降级
 */
export function restoreDraftFilesCompat(inputActions, files, sessionId) {
  if (!inputActions || !Array.isArray(files) || files.length === 0) return false;
  if (typeof inputActions.addFiles === "function") {
    try {
      inputActions.addFiles(files);
      log("info", "attach", "通过 inputActions.addFiles 恢复草稿文件成功", { count: files.length });
      return true;
    } catch (eAf) {
      log("warn", "attach", "inputActions.addFiles 抛错，降级至 createDraftImagesCompat", { err: String(eAf && eAf.message ? eAf.message : eAf) });
    }
  }
  try {
    var drafts = createDraftImagesCompat(files, sessionId);
    if (drafts && drafts.length > 0) {
      var ids = drafts.map(function (d) { return d.id; });
      var ok = addInputImagesCompat(inputActions, ids);
      log("info", "attach", "通过 createDraftImagesCompat 恢复草稿文件成功", { count: ids.length, ok: ok });
      return ok;
    }
  } catch (eDrafts) {
    log("warn", "attach", "createDraftImagesCompat 恢复文件草稿异常", { err: String(eDrafts && eDrafts.message ? eDrafts.message : eDrafts) });
  }
  return false;
}

/**
 * 完整提取当前底部输入框中的文件/图片原生 File 对象（跨会话保留草稿附件）
 */
export async function extractBottomDraftFiles(sessionId, bottomIds, props, fallbackFiles) {
  var collected = [];
  var seenKeys = new Set();

  // 1. 优先从官方 conversation.draftAttachments 单例提取
  try {
    var conv = serviceRefs.conversation;
    if (conv && conv.draftAttachments && typeof conv.draftAttachments.get === "function" && Array.isArray(bottomIds)) {
      for (var i = 0; i < bottomIds.length; i++) {
        var id = bottomIds[i];
        if (!id) continue;
        var item = conv.draftAttachments.get(id);
        if (item && item.file instanceof File) {
          var k1 = item.file.name + "::" + item.file.size;
          if (!seenKeys.has(k1)) {
            collected.push(item.file);
            seenKeys.add(k1);
          }
        } else if (item && item.attachment) {
          try {
            var resF = await resolveAttachmentFile(sessionId, item, props);
            if (resF instanceof File) {
              var k2 = resF.name + "::" + resF.size;
              if (!seenKeys.has(k2)) {
                collected.push(resF);
                seenKeys.add(k2);
              }
            }
          } catch (eRes) {}
        }
      }
    }
  } catch (eConv) {
    log("warn", "attach", "从 draftAttachments 提取底部文件异常", { err: String(eConv && eConv.message ? eConv.message : eConv) });
  }

  // 2. 结合编辑期间拖入底部的 fallbackFiles 补充
  if (Array.isArray(fallbackFiles)) {
    for (var j = 0; j < fallbackFiles.length; j++) {
      var ff = fallbackFiles[j];
      if (ff instanceof File) {
        var k3 = ff.name + "::" + ff.size;
        if (!seenKeys.has(k3)) {
          collected.push(ff);
          seenKeys.add(k3);
        }
      }
    }
  }

  return collected;
}
