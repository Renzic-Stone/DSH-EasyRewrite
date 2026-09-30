import { log } from "../../core/log.js";
import { serviceRefs, resolveImageCompat, createDraftImagesCompat, addInputImagesCompat, getInputImageIdsCompat } from "../../core/services.js";

// ---------- 图片桥接（review #3）：跨会话传递交官方全局 draftAttachments 单例，只记 imageIds ----------
export const pendingAttachIds = [];
export const cachedEditMsg = {}; // 消息图refs缓存（渲染时填充，confirmEdit 异步回调读取）
export const latestInputImageIds = []; // 输入框当前图 id 镜像
export const cachedRebuiltFiles = {}; // 会话图文件缓存（rebuildDraftAttachments 填充）
export const stagedSessionFiles = new Map(); // 跨会话暂存文件池：targetSessionId -> File[]

    // ---------- 编辑附件保留（M4 闭环）：历史图片附件 → 官方草稿附件 ----------
    // 流程：props.loadImage(ref) 取会话授权 URL → fetch → File → ctx.conversation.createDraftImages → inputActions.addImages
    async function rebuildDraftAttachments(attachmentRefs, props, sessionId, recordPending) {
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
        if (files.length > 0) {
          if (sessionId) cachedRebuiltFiles[sessionId] = files.slice();
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

/** 将收集到的 File 列表暂存给目标新会话 */
export function stageOutgoingFiles(targetSessionId, files) {
  if (!targetSessionId || !Array.isArray(files) || files.length === 0) return;
  stagedSessionFiles.set(targetSessionId, files.slice());
  log("info", "attach", "已为新会话暂存发送文件", { targetSessionId: targetSessionId, count: files.length });
}

/** 消费新会话暂存的文件列表 */
export function consumeStagedFiles(targetSessionId) {
  if (!targetSessionId) return [];
  var files = stagedSessionFiles.get(targetSessionId) || [];
  stagedSessionFiles.delete(targetSessionId);
  return files;
}
