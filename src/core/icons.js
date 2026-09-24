import * as Primitives from "@deepseek-ai/dsh-client-ui-primitives";

/**
 * 取第一个可用的图标导出。
 * dsh 0.1.7 重排了图标导出名：名字里的数字从尺寸改成了字重。
 * 旧名在新版解析为 undefined，都取不到时退回空组件。
 */
export function pickIcon(...icons) {
  for (let i = 0; i < icons.length; i++) {
    if (icons[i]) return icons[i];
  }
  return function EmptyIcon() { return null; };
}

export const IconCheckOutline = pickIcon(Primitives.IconCheckOutline16, Primitives.IconCheckOutlineRegular);
export const IconCopyOutline = pickIcon(Primitives.IconCopyOutline16, Primitives.IconCopyOutlineRegular);
export const IconChevronLeftOutline = pickIcon(Primitives.IconChevronLeftOutline14, Primitives.IconChevronLeftOutlineRegular);
export const IconChevronRightOutline = pickIcon(Primitives.IconChevronRightOutline14, Primitives.IconChevronRightOutlineRegular);

/** 操作区图标（构建期内联，自包含） */
export const ICONS = {
  edit: "data:image/png;base64,__DASH_EDIT_ICON__",
  recall: "data:image/png;base64,__DASH_RECALL_ICON__"
};
