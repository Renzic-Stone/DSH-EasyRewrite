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
