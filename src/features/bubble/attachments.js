import { log } from "../../core/log.js";
import { serviceRefs, resolveImageCompat } from "../../core/services.js";

// ---------- 图片桥接（review #3）：跨会话传递交官方全局 draftAttachments 单例，只记 imageIds ----------
export const pendingAttachIds = [];
export const cachedEditMsg = {}; // 消息图refs缓存（渲染时填充，confirmEdit 异步回调读取）
export const latestInputImageIds = []; // 输入框当前图 id 镜像

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
        if (files.length > 0 && serviceRefs.conversation && typeof serviceRefs.conversation.createDraftImages === "function" && typeof props.inputActions !== "undefined" && typeof props.inputActions.addImages === "function") {
          try {
            var images = serviceRefs.conversation.createDraftImages(files);
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
          else log("warn", "attach", "缺 createDraftImages 或 addImages 能力", { hasCCI: !!(serviceRefs.conversation && typeof serviceRefs.conversation.createDraftImages === "function"), hasAdd: !!(props.inputActions && typeof props.inputActions.addImages === "function") });
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
