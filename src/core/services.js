import { log } from "./log.js";

export const serviceRefs = {
  ctx: null,
  conversation: null,
  uiConversation: null,
  uiWorkspace: null,
  sessions: null,
  workspaces: null,
  locale: null,
  modelDirectories: null
};

export function getUiWorkspace() {
  if (serviceRefs.uiWorkspace) return serviceRefs.uiWorkspace;
  try {
    const ctx = serviceRefs.ctx;
    if (ctx) {
      const uiW = ctx.uiWorkspace || ((typeof ctx.get === "function") ? ctx.get("uiWorkspace") : null);
      if (uiW) {
        serviceRefs.uiWorkspace = uiW;
        return uiW;
      }
    }
  } catch (e) {}
  return null;
}

export function getModelDirectories() {
  if (serviceRefs.modelDirectories) return serviceRefs.modelDirectories;
  try {
    const ctx = serviceRefs.ctx;
    if (ctx) {
      const md = ctx.modelDirectories || ((typeof ctx.get === "function") ? ctx.get("modelDirectories") : null);
      if (md) {
        serviceRefs.modelDirectories = md;
        return md;
      }
    }
  } catch (e) {}
  return null;
}

export function setServiceRefs(ctx) {
  serviceRefs.ctx = ctx || null;
  try {
    serviceRefs.conversation = ctx.conversation || ((typeof ctx.get === "function") ? ctx.get("conversation") : null);
  } catch (e) {}
  try {
    serviceRefs.uiConversation = ctx.uiConversation || ((typeof ctx.get === "function") ? ctx.get("uiConversation") : null);
  } catch (e) {}
  try {
    serviceRefs.uiWorkspace = ctx.uiWorkspace || ((typeof ctx.get === "function") ? ctx.get("uiWorkspace") : null);
  } catch (e) {}
  try {
    serviceRefs.sessions = ctx.sessions || null;
  } catch (e) {}
  try {
    serviceRefs.workspaces = ctx.workspaces || null;
  } catch (e) {}
  try {
    serviceRefs.locale = ctx.locale || null;
  } catch (e) {}
  try {
    serviceRefs.modelDirectories = ctx.modelDirectories || ((typeof ctx.get === "function") ? ctx.get("modelDirectories") : null);
  } catch (e) {}
}

/** 图片 URL 解析双宿主兼容——props.loadImage / rc.2 resolveImage / rc.1 uiConversation.imageUrl */
export async function resolveImageCompat(sessionId, ref, props) {
  if (props && typeof props.loadImage === "function") {
    try {
      const u1 = await props.loadImage(ref);
      if (u1) return u1;
    } catch (e1) {
      /* 次选 */
    }
  }
  if (serviceRefs.conversation && typeof serviceRefs.conversation.resolveImage === "function") {
    try {
      const u2 = await serviceRefs.conversation.resolveImage(sessionId, ref);
      if (u2) return u2;
    } catch (e2) {
      /* 次选 */
    }
  }
  if (serviceRefs.uiConversation && typeof serviceRefs.uiConversation.imageUrl === "function") {
    try {
      return await serviceRefs.uiConversation.imageUrl(sessionId, ref);
    } catch (e3) {
      /* ignore */
    }
  }
  return null;
}

const attachmentFileCache = new Map();

export function isImageFileName(filename) {
  if (!filename || typeof filename !== "string") return false;
  return /\.(png|jpe?g|webp|gif|bmp|svg|ico)$/i.test(filename.trim());
}

export function isImageMediaType(mediaType) {
  if (!mediaType || typeof mediaType !== "string") return false;
  return /^image\/(png|jpe?g|webp|gif|bmp|svg\+xml|x-icon)/i.test(mediaType.trim());
}

export function guessMimeType(filename) {
  if (!filename || typeof filename !== "string") return "application/octet-stream";
  var lower = filename.trim().toLowerCase();
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".tar") || lower.endsWith(".gz") || lower.endsWith(".tgz")) return "application/gzip";
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript";
  if (lower.endsWith(".ts")) return "text/plain";
  if (lower.endsWith(".py")) return "text/x-python";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  if (lower.endsWith(".xml")) return "application/xml";
  if (lower.endsWith(".png")) return "image/png";
  if (/\.jpe?g$/.test(lower)) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

/** 跨宿主附件对象转 File 实例（支持普通文档与图片，带内存级缓存与 Host 原始字节通道兜底） */
export async function resolveAttachmentFile(sessionId, att, props) {
  if (!att) return null;

  // 1. 如果已具备原生 File 实例
  if (typeof File !== "undefined") {
    if (att instanceof File) return att;
    if (att.file instanceof File) return att.file;
    if (att.attachment && att.attachment.file instanceof File) return att.attachment.file;
  }

  var rawAtt = att.attachment || att;
  var attId = rawAtt.attachmentId || att.attachmentId || rawAtt.id || att.id || "";
  var name = rawAtt.name || att.name || "";
  var mediaType = rawAtt.mediaType || att.mediaType || (typeof att.type === "string" && att.type !== "file" && att.type !== "image" ? att.type : "") || "";

  var hasExplicitFileKind = !!(att.isFile || att.kind === "file" || rawAtt.kind === "file" || rawAtt.type === "file");
  var isImgByExt = isImageFileName(name);
  var isImgByMime = isImageMediaType(mediaType);
  var hasNonImgExt = !!(name && /\.[a-z0-9]+$/i.test(name.trim()) && !isImgByExt);

  var isFileKind = hasExplicitFileKind || hasNonImgExt || (!isImgByExt && !isImgByMime);
  if (!name) name = isFileKind ? "file" : "image.png";

  var type = mediaType;
  if (!type) {
    if (isFileKind) {
      type = guessMimeType(name);
    } else {
      var lower = String(name).toLowerCase();
      if (/\.jpe?g$/.test(lower)) type = "image/jpeg";
      else if (lower.endsWith(".webp")) type = "image/webp";
      else if (lower.endsWith(".gif")) type = "image/gif";
      else type = "image/png";
    }
  }

  // 2. 命中内存级 File 缓存或官方草稿池（避免二次气泡编辑、刷新恢复或快速确定时丢失 File）
  var cacheKey = attId ? (attId + "::" + name) : "";
  if (cacheKey && attachmentFileCache.has(cacheKey)) {
    var cached = attachmentFileCache.get(cacheKey);
    if (cached instanceof File) return cached;
  }
  try {
    var conv = serviceRefs.conversation;
    if (attId && conv && conv.draftAttachments && typeof conv.draftAttachments.get === "function") {
      var draftItem = conv.draftAttachments.get(attId);
      if (draftItem && draftItem.file instanceof File) return draftItem.file;
    }
  } catch (eDraftPool) { /* ignore */ }
  var directUrl = att.url || att.dataUrl || rawAtt.url || rawAtt.dataUrl || "";
  if (typeof directUrl === "string" && (directUrl.indexOf("blob:") === 0 || directUrl.indexOf("data:") === 0)) {
    try {
      var dResp = await fetch(directUrl);
      if (dResp.ok) {
        var dBlob = await dResp.blob();
        var dFile = new File([dBlob], name, { type: type || dBlob.type || (isFileKind ? "application/octet-stream" : "image/png") });
        if (cacheKey) attachmentFileCache.set(cacheKey, dFile);
        return dFile;
      }
    } catch (eDu) { /* ignore */ }
  }

  // 3. 全类型附件通道：优先尝试从 session.readAttachment 读取官方物理数据
  try {
    var sessions = (props && props.ctxSessions) || serviceRefs.sessions;
    var session = null;
    if (sessions && typeof sessions.binding === "function" && sessionId) {
      var b = sessions.binding(sessionId);
      if (b && b.session) session = b.session;
    }
    if (!session && sessions && sessions.manager && typeof sessions.manager.get === "function") {
      session = sessions.manager.get(sessionId);
    } else if (!session && sessions && typeof sessions.get === "function") {
      session = sessions.get(sessionId);
    }
    if (session && typeof session.readAttachment === "function" && attId) {
      var res = null;
      try {
        res = await session.readAttachment({
          type: isFileKind ? "file" : "image",
          attachment: {
            attachmentId: attId,
            mediaType: type || (isFileKind ? "application/octet-stream" : "image/png")
          }
        });
      } catch (eBlock) {
        res = await session.readAttachment(attId);
      }
      if (res instanceof Uint8Array && res.byteLength > 0) {
        var f0 = new File([res], name, { type: type || (isFileKind ? "application/octet-stream" : "image/png") });
        if (cacheKey) attachmentFileCache.set(cacheKey, f0);
        return f0;
      }
      if (res && res.ok && res.value && res.value.data) {
        var u8 = Uint8Array.from(res.value.data);
        var mType = (res.value.attachment && res.value.attachment.mediaType) || type || (isFileKind ? "application/octet-stream" : "image/png");
        var f1 = new File([u8], name, { type: mType });
        if (cacheKey) attachmentFileCache.set(cacheKey, f1);
        return f1;
      }
    }
  } catch (eS) { /* ignore */ }

  // 4. 图片特有链接通道（resolveImageCompat）
  if (!isFileKind) {
    try {
      var url = await resolveImageCompat(sessionId, rawAtt, props);
      if (url) {
        var resp = await fetch(url);
        if (resp.ok) {
          var blob = await resp.blob();
          var f2 = new File([blob], name, { type: type || blob.type || "image/png" });
          if (cacheKey) attachmentFileCache.set(cacheKey, f2);
          return f2;
        }
      }
    } catch (eU) { /* ignore */ }
  }

  // 4. 通用物理附件通道（普通文档必走通道 + 图片兜底通道）：请求 Host /bubble/attachment/raw
  if (typeof attId === "string" && /^sha256:[0-9a-f]{64}$/i.test(attId.trim())) {
    try {
      var rawResp = await fetch("/bubble/attachment/raw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attachmentId: attId.trim(), name: name })
      });
      if (rawResp && rawResp.ok) {
        var rawBlob = await rawResp.blob();
        var finalType = type || (isFileKind ? "application/octet-stream" : "image/png");
        var f3 = new File([rawBlob], name, { type: finalType });
        if (cacheKey) attachmentFileCache.set(cacheKey, f3);
        return f3;
      }
    } catch (eRaw) {
      log("warn", "attach", "请求 /bubble/attachment/raw 失败", { attachmentId: attId, name: name, err: String(eRaw && eRaw.message ? eRaw.message : eRaw) });
    }
  }

  return null;
}

/** 双宿主兼容：创建草稿附件（DSH 0.1.7+ createDrafts vs 旧版 createDraftImages） */
export function createDraftImagesCompat(files, sessionId) {
  if (!files || files.length === 0) return [];
  let conv = null;
  try {
    if (sessionId && serviceRefs.sessions && typeof serviceRefs.sessions.scope === "function") {
      const scope = serviceRefs.sessions.scope(sessionId);
      if (scope && typeof scope.get === "function") conv = scope.get("conversation");
    }
  } catch (e) {}
  if (!conv) conv = serviceRefs.conversation;
  if (!conv) return [];

  let drafts = null;
  if (typeof conv.createDrafts === "function") {
    try {
      drafts = conv.createDrafts(sessionId, files);
    } catch (e) {
      log("warn", "attach", "conv.createDrafts 抛错", { err: String(e && e.message ? e.message : e) });
    }
  }

  // 若 createDrafts 缺失或抛错，区分图片与普通文档安全注入
  if (!Array.isArray(drafts) || drafts.length === 0) {
    const imgFiles = [];
    const docFiles = [];
    for (let fi = 0; fi < files.length; fi++) {
      const f = files[fi];
      if (f && isImageFileName(f.name)) imgFiles.push(f);
      else docFiles.push(f);
    }

    drafts = [];
    if (imgFiles.length > 0 && typeof conv.createDraftImages === "function") {
      try {
        const dImgs = conv.createDraftImages(imgFiles);
        if (Array.isArray(dImgs)) drafts = drafts.concat(dImgs);
      } catch (eImg) {
        log("warn", "attach", "conv.createDraftImages 抛错", { err: String(eImg?.message ?? eImg) });
      }
    }

    if (docFiles.length > 0 && conv.draftAttachments && typeof conv.draftAttachments.set === "function") {
      for (let di = 0; di < docFiles.length; di++) {
        const df = docFiles[di];
        const dId = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : ("doc-" + Date.now() + "-" + Math.random().toString(36).slice(2));
        const docAtt = {
          kind: "file",
          id: dId,
          file: df
        };
        conv.draftAttachments.set(dId, docAtt);
        drafts.push(docAtt);
      }
    }
  }

  if (!Array.isArray(drafts)) return [];

  return drafts.map(function (d) {
    if (!d) return null;
    var fileName = (d.file && d.file.name) || "";
    var isExplicitDoc = !!(d.kind === "file" || (fileName && !isImageFileName(fileName)));
    var isRealImg = !isExplicitDoc;

    // 核心安全闭环：确保官方 draftAttachments 单例中的对象具备正确的 kind: "file"，防止官方 ComposerAttachments 误以 <img> 渲染
    if (conv && conv.draftAttachments && typeof conv.draftAttachments.get === "function") {
      try {
        const rawAtt = conv.draftAttachments.get(d.id);
        if (rawAtt) {
          if (isExplicitDoc) {
            rawAtt.kind = "file";
          }
        }
      } catch (eAttKind) {}
    }

    // 初始化官方 uploads 状态为 ready，让 FileCard 能够直接渲染文档图标与文件名
    if (isExplicitDoc && conv && conv.fileUploads && typeof conv.fileUploads.update === "function") {
      try {
        conv.fileUploads.update((draftMap) => {
          if (!draftMap[d.id]) {
            draftMap[d.id] = { status: "ready", loaded: (d.file && d.file.size) || 0, total: (d.file && d.file.size) || 0 };
          }
        });
      } catch (eUpd) {}
    }

    return {
      id: d.id,
      previewUrl: isRealImg ? (d.previewUrl || d.url || (d.file && isImageFileName(d.file.name) ? URL.createObjectURL(d.file) : "")) : "",
      file: d.file || null,
      kind: isRealImg ? "image" : "file"
    };
  }).filter(Boolean);
}

/** 双宿主兼容：向输入框添加附件 ID（DSH 0.1.7+ addAttachments vs 旧版 addImages） */
export function addInputImagesCompat(inputActions, ids) {
  if (!inputActions || !ids || !ids.length) return false;
  try {
    if (typeof inputActions.addAttachments === "function") {
      return !!inputActions.addAttachments(ids);
    }
    if (typeof inputActions.addImages === "function") {
      return !!inputActions.addImages(ids);
    }
  } catch (e) {
    log("warn", "attach", "添加草稿附件失败", { err: String(e && e.message ? e.message : e) });
  }
  return false;
}

/** 双宿主兼容：从输入框移除单张附件（DSH 0.1.7+ removeAttachment vs 旧版 removeImage） */
export function removeInputImageCompat(inputActions, id) {
  if (!inputActions || !id) return false;
  try {
    if (typeof inputActions.removeAttachment === "function") {
      return !!inputActions.removeAttachment(id);
    }
    if (typeof inputActions.removeImage === "function") {
      return !!inputActions.removeImage(id);
    }
  } catch (e) {
    log("warn", "attach", "移除草稿附件失败", { err: String(e && e.message ? e.message : e) });
  }
  return false;
}

/** 双宿主兼容：输入框附件名单裁剪/保留（DSH 0.1.7+ pruneAttachments vs 旧版 pruneImages） */
export function pruneInputImagesCompat(inputActions, keepIds) {
  if (!inputActions || !keepIds) return false;
  try {
    if (typeof inputActions.pruneAttachments === "function") {
      inputActions.pruneAttachments(keepIds);
      return true;
    }
    if (typeof inputActions.pruneImages === "function") {
      inputActions.pruneImages(keepIds);
      return true;
    }
  } catch (e) {
    log("warn", "attach", "裁剪草稿附件失败", { err: String(e && e.message ? e.message : e) });
  }
  return false;
}

/** 双宿主兼容：读取输入框现有附件 ID 列表（DSH 0.1.7+ attachmentIds vs 旧版 imageIds） */
export function getInputImageIdsCompat(inputState) {
  if (!inputState) return [];
  if (Array.isArray(inputState.attachmentIds)) return inputState.attachmentIds.slice();
  if (Array.isArray(inputState.imageIds)) return inputState.imageIds.slice();
  if (inputState.state && typeof inputState.state.getSnapshot === "function") {
    try {
      var snap = inputState.state.getSnapshot();
      if (snap) {
        if (Array.isArray(snap.attachmentIds)) return snap.attachmentIds.slice();
        if (Array.isArray(snap.imageIds)) return snap.imageIds.slice();
      }
    } catch (e) {}
  }
  return [];
}

/** 模型与思考挡位捕获/恢复随行（v2.1.1 起官方通道） */
export function createModelSel(ctx) {
  return {
    capture: function (sessionId) {
      try {
        const md = ctx && ctx.modelDirectories ? ctx.modelDirectories : serviceRefs.modelDirectories;
        if (!md || typeof md.directoryFor !== "function") return null;
        const cur = md.directoryFor(sessionId).store.getSnapshot().current;
        if (cur && cur.provider && cur.model) {
          return { provider: cur.provider, model: cur.model, reasoningEffort: cur.reasoningEffort };
        }
      } catch (e) {
        log("warn", "model", "读取当前模型/挡位失败（将按默认发送）", { err: String(e && e.message ? e.message : e) });
      }
      return null;
    },
    apply: function (sessionId, sel) {
      if (!sel || !sel.provider || !sel.model) return Promise.resolve(false);
      try {
        const md = ctx && ctx.modelDirectories ? ctx.modelDirectories : serviceRefs.modelDirectories;
        if (!md || typeof md.directoryFor !== "function") return Promise.resolve(false);
        return md.directoryFor(sessionId).select(sel).then(function () {
          log("info", "model", "新会话已应用原模型/挡位选择", { provider: sel.provider, model: sel.model });
          return true;
        }, function (e) {
          log("warn", "model", "应用模型/挡位失败（按默认发送）", { err: String(e && e.message ? e.message : e) });
          return false;
        });
      } catch (e) {
        return Promise.resolve(false);
      }
    }
  };
}
