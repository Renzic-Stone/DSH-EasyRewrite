import { log } from "./log.js";

export const serviceRefs = {
  conversation: null,
  uiConversation: null,
  uiWorkspace: null,
  sessions: null,
  workspaces: null,
  locale: null,
  modelDirectories: null
};

export function setServiceRefs(ctx) {
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
  if ((!drafts || drafts.length === 0) && typeof conv.createDraftImages === "function") {
    try {
      drafts = conv.createDraftImages(files);
    } catch (e) {
      log("warn", "attach", "conv.createDraftImages 抛错", { err: String(e && e.message ? e.message : e) });
    }
  }
  if (!Array.isArray(drafts)) return [];

  return drafts.map(function (d) {
    if (!d) return null;
    return {
      id: d.id,
      previewUrl: d.previewUrl || d.url || (d.file ? URL.createObjectURL(d.file) : ""),
      file: d.file || null,
      kind: d.kind || "image"
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
