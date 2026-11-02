import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { calcBtnRowMinWidth, editWidthFor } from "../src/features/bubble/width.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

console.log("--- 开始测试：社区 PR & Issue 改进自研融合专项测试 ---");

// =========================================================================
// [Test 1] 翻页器 Hook 顺位前置与顶层快照执行静态防御
// =========================================================================
console.log("[Test 1] 验证 VersionPager 中 Hook 顺位顶层前置...");
const pagerSrc = await readFile(join(root, "src", "features", "history", "pager.js"), "utf8");
const pagerFnStart = pagerSrc.indexOf("function VersionPager(props)");
const pagerBody = pagerSrc.slice(pagerFnStart);
const snapCallIdx = pagerBody.indexOf("var snapshot = getChatSnapshot(props);");
const earlyReturnIdx = pagerBody.indexOf("return null;");
assert.ok(snapCallIdx > 0, "必须存在 snapshot 顶层调用");
assert.ok(earlyReturnIdx > 0 && snapCallIdx < earlyReturnIdx, "getChatSnapshot（包含 Hook）必须在任何 return null 之前无条件执行以防 React #300");
console.log("✓ VersionPager Hook 顺位防护验证通过");

// =========================================================================
// [Test 2] 编辑框极短消息安全宽度与防塌陷算法验证
// =========================================================================
console.log("[Test 2] 验证编辑框按钮行安全宽度与短消息防溢出...");
const zhSafetyW = calcBtnRowMinWidth("取消", "确定");
const enSafetyW = calcBtnRowMinWidth("Cancel", "Confirm");
assert.ok(zhSafetyW >= 150, "中文字符下按钮行宽度应保底至少 150px");
assert.ok(enSafetyW >= 180, "英文字符下按钮行宽度应保底至少 180px");

// 测试极短消息（如 "好"），compact 模式下绝不塌陷到 40px
const shortWidthCompact = editWidthFor("compact", "好", 42, zhSafetyW);
assert.ok(typeof shortWidthCompact === "number" && shortWidthCompact >= zhSafetyW, "极短消息宽度必须被抬升至安全宽度以上，防止按钮溢出");

const shortWidthStandard = editWidthFor("standard", "好", 42, zhSafetyW);
assert.ok(typeof shortWidthStandard === "number" && shortWidthStandard >= 360, "标准模式必须保持 360px 起步");
console.log("✓ 编辑框极短消息按钮安全宽度验证通过");

// =========================================================================
// [Test 3] 多层级图片渲染与纯图消息空气泡消除静态契约
// =========================================================================
console.log("[Test 3] 验证 DSH 0.2.x 图片三层降级与纯图空气泡消除契约...");
const uiSrc = await readFile(join(root, "src", "core", "ui.js"), "utf8");
assert.ok(uiSrc.includes("renderFactorySlot"), "ui.js 必须支持 DSH 0.2.x 官方图片工厂槽");
assert.ok(uiSrc.includes("FallbackImageGallery"), "ui.js 必须具备 loadImage 自绘画廊兜底以防图片静默消失");

const viewSrc = await readFile(join(root, "src", "features", "bubble", "view.js"), "utf8");
assert.ok(viewSrc.includes("shouldRenderBubble"), "view.js 必须有纯图消息气泡判定，避免产生 (空消息) 冗余气泡");
assert.ok(viewSrc.includes("taEl.__autoHeightDone"), "view.js 必须在 textarea 挂载瞬间自适应撑高防高度塌陷");
console.log("✓ 图片多层降级与纯图气泡契约验证通过");

// =========================================================================
// [Test 4] 客户端日志节流限频机制验证
// =========================================================================
console.log("[Test 4] 验证客户端高频日志限频节流机制...");
const logSrc = await readFile(join(root, "src", "core", "log.js"), "utf8");
assert.ok(logSrc.includes("recentLogTimestamps"), "log.js 必须实现限频时间戳记录");
assert.ok(logSrc.includes("4000"), "log.js 必须设置合理的节流时间窗口（4秒）");
console.log("✓ 客户端日志高频限频机制验证通过");

// =========================================================================
// [Test 5] 气泡编辑态蓝框 Dropzone 提示与官方同款蓝框推理档位药丸契约
// =========================================================================
console.log("[Test 5] 验证气泡编辑态 Dropzone 蓝框提示与推理档位蓝框 Badge 契约...");
const i18nSrc = await readFile(join(root, "src", "core", "i18n.js"), "utf8");
assert.ok(i18nSrc.includes('dzFull: "拖入此处添加文件至正在编辑的消息"'), "zh 字典必须包含 dzFull");
assert.ok(i18nSrc.includes('dzCompact: "插入文件"'), "zh 字典必须包含 dzCompact");
assert.ok(i18nSrc.includes('dzFull: "Drop to add files to the message being edited"'), "en 字典必须包含 dzFull");
assert.ok(i18nSrc.includes('dzCompact: "Insert file"'), "en 字典必须包含 dzCompact");

const pickerSrc = await readFile(join(root, "src", "features", "bubble", "model-picker.js"), "utf8");
assert.ok(pickerSrc.includes("getModelDirectories"), "model-picker.js 必须具备动态读取 modelDirectories 服务能力");
assert.ok(pickerSrc.includes("rgba(77, 107, 254, 0.12)"), "effortLabel 必须具备官方同款蓝底蓝框药丸胶囊样式");

console.log("✓ Dropzone 蓝框提示与推理档位蓝框药丸胶囊契约验证通过");

// =========================================================================
// [Test 6] DSH 0.2 通用文件附件与对话流官方同款 FileCard 渲染契约
// =========================================================================
console.log("[Test 6] 验证对话流与编辑态通用文件附件与官方同款 FileCard 契约...");
const uiSrc2 = await readFile(join(root, "src", "core", "ui.js"), "utf8");
assert.ok(uiSrc2.includes("renderMessageAttachmentsCompat"), "ui.js 必须提供 renderMessageAttachmentsCompat 统一附件渲染器");
assert.ok(uiSrc2.includes("FileCardView"), "ui.js 必须提供官方同款 FileCardView 预览组件");
assert.ok(uiSrc2.includes('flexDirection: "column"'), "FileCardView 必须为垂直居中布局（图标在上，文件名在下）");
assert.ok(uiSrc2.includes("formatFileSize"), "ui.js 必须包含标准文件大小格式化算法");
assert.ok(uiSrc2.includes("renderFileTypeIcon"), "ui.js 必须包含折角文件矢量图标生成器");

const viewSrc2 = await readFile(join(root, "src", "features", "bubble", "view.js"), "utf8");
assert.ok(viewSrc2.includes("renderMessageAttachmentsCompat(pc, props"), "view.js 气泡上方必须使用 renderMessageAttachmentsCompat 渲染");
assert.ok(viewSrc2.includes("ei.isFile"), "view.js 编辑态必须支持通用文件卡片显示与移除");
assert.ok(viewSrc2.includes("width: thumbSize + \"px\", height: thumbSize + \"px\""), "view.js 编辑态普通文件必须保持与图片完全一致的方形大小");

console.log("✓ 通用文件附件与对话流官方同款 FileCard 渲染契约验证通过");

// =========================================================================
// [Test 7] 气泡编辑态原消息文档转 File 实例与单图+单文档重发完整保留
// =========================================================================
console.log("[Test 7] 验证原消息文档转 File 实例与单图+单文档重发完整保留...");
const servicesSrc = await readFile(join(root, "src", "core", "services.js"), "utf8");
assert.ok(servicesSrc.includes("export async function resolveAttachmentFile"), "services.js 必须导出 resolveAttachmentFile");
assert.ok(servicesSrc.includes("/bubble/attachment/raw"), "services.js 必须支持通过 /bubble/attachment/raw 读取普通文档物理字节");
assert.ok(viewSrc2.includes("resolveAttachmentFile"), "view.js 必须引入 resolveAttachmentFile");
assert.ok(viewSrc2.includes("curItem.file = resolvedFile"), "view.js enterEdit 必须异步补齐附件项的 File 实体");
assert.ok(viewSrc2.includes("fallbackFile instanceof File"), "view.js confirmEdit 必须具备同步兜底拉取 File 保证，防止快速点击时遗漏附件");

// 逻辑模拟：测试 resolveAttachmentFile 在模拟 session.readAttachment 下的行为
import { pathToFileURL } from "node:url";
const { resolveAttachmentFile } = await import(pathToFileURL(join(root, "src", "core", "services.js")).href);
const mockData = new TextEncoder().encode("hello test file");
const mockSession = {
  readAttachment: async (id) => ({
    ok: true,
    value: {
      attachment: { attachmentId: id, name: "432.txt", mediaType: "text/plain" },
      data: Array.from(mockData)
    }
  })
};
const mockProps = {
  ctxSessions: {
    manager: {
      get: () => mockSession
    }
  }
};
const resolved = await resolveAttachmentFile("test-sess", { attachmentId: "att-432", name: "432.txt", mediaType: "text/plain" }, mockProps);
assert.ok(resolved instanceof File, "resolveAttachmentFile 必须返回合法的 File 对象");
assert.strictEqual(resolved.name, "432.txt");
assert.strictEqual(resolved.size, mockData.byteLength);

console.log("✓ 原消息文档转 File 实例与重发完整保留验证通过");

// =========================================================================
// [Test 8] DSH 0.2.1 最新版源码对照 Review 回归防护（Composer 选择器隔离、SessionInput 兼容、重启恢复）
// =========================================================================
console.log("[Test 8] 验证 DSH 0.2.1 源码对照 Review 修复项...");
const buttonsSrc = await readFile(join(root, "src", "features", "recall", "buttons.js"), "utf8");
assert.ok(buttonsSrc.includes('cand.closest(\'[data-dsh-easyrewrite="user-editing"]\')'), "readCurrentComposerText 必须显式排除气泡编辑框内的 textarea，防止误判为底部草稿");

const bubbleIdxSrc = await readFile(join(root, "src", "features", "bubble", "index.js"), "utf8");
const recallIdxSrc = await readFile(join(root, "src", "features", "recall", "index.js"), "utf8");
assert.ok(bubbleIdxSrc.includes("if (resolvedActions2) injected2.inputActions = resolvedActions2;"), "bubble inject 绝不能用 null 覆盖宿主标准注入的 inputActions");
assert.ok(recallIdxSrc.includes("if (resolvedActions) injected.inputActions = resolvedActions;"), "recall inject 绝不能用 null 覆盖宿主标准注入的 inputActions");

assert.ok(servicesSrc.includes("sessions.binding(sessionId)"), "services.js 必须优先使用 DSH 0.2.1 标准接口 sessions.binding(sessionId).session");
assert.ok(viewSrc2.includes("editImgsTrackedOriginals: true"), "view.js 必须支持重启恢复时原附件增删状态与拖入文件的完整恢复");

const hostIdxSrc = await readFile(join(root, "lib", "index.js"), "utf8");
assert.ok(!hostIdxSrc.includes("path.dirname("), "lib/index.js 不得使用未导入的 path.dirname");
assert.ok(hostIdxSrc.includes('join(home, "profiles", "node_modules", "@deepseek-ai", "dsh", "package.json")'), "readDshVersion 必须支持检索 profiles/node_modules/@deepseek-ai/dsh");

console.log("✓ DSH 0.2.1 源码对照 Review 修复项验证通过");

// =========================================================================
// [Test 9] 普通文件卡片防文本选中与像图片一样自由拖拽流转契约
// =========================================================================
console.log("[Test 9] 验证普通文件卡片防文本选中与像图片一样自由拖拽流转契约...");
const attachSrc = await readFile(join(root, "src", "features", "bubble", "attachments.js"), "utf8");
assert.ok(attachSrc.includes("handleAttachmentDragStart"), "attachments.js 必须导出 handleAttachmentDragStart 统一拖拽起点处理器");
assert.ok(attachSrc.includes("getDraggedAttachment"), "attachments.js 必须导出 getDraggedAttachment 内部拖拽提取器");
assert.ok(attachSrc.includes("setDraggedAttachment"), "attachments.js 必须导出 setDraggedAttachment");
assert.ok(attachSrc.includes("clearDraggedAttachment"), "attachments.js 必须导出 clearDraggedAttachment");
assert.ok(attachSrc.includes("application/x-dsh-easyrewrite-file"), "attachments.js 必须注册应用专属 MIME 类型标识");

assert.ok(uiSrc2.includes("draggable: true"), "ui.js FileCardView 必须配置 draggable: true");
assert.ok(uiSrc2.includes('userSelect: "none"'), "ui.js FileCardView 必须显式声明 userSelect: none 防止拖拽时选中文字");
assert.ok(uiSrc2.includes("handleAttachmentDragStart"), "ui.js FileCardView 必须绑定 handleAttachmentDragStart");

assert.ok(viewSrc2.includes("getDraggedAttachment"), "view.js 必须引入 getDraggedAttachment 支持接收内部拖拽文件");
assert.ok(viewSrc2.includes("application/x-dsh-easyrewrite-file"), "view.js looksLikeFileDrag 必须识别应用专属拖拽文件类型");
assert.ok(viewSrc2.includes('data-easyrewrite-file-card": "1"'), "view.js 编辑态文件项必须标记 data-easyrewrite-file-card");
assert.ok(viewSrc2.includes('userSelect: "none"'), "view.js 编辑态文件项必须声明 userSelect: none");

const themeSrc = await readFile(join(root, "src", "features", "bubble", "theme.js"), "utf8");
assert.ok(themeSrc.includes("installGlobalFileCardDragSupport"), "theme.js 必须提供 installGlobalFileCardDragSupport 全局拖拽支持");
assert.ok(themeSrc.includes("user-select:none!important"), "theme.js 必须全局注入 user-select:none!important 样式彻底消除拖动产生选择框");
assert.ok(themeSrc.includes('div[class*=\'gSkjMW_card\']'), "theme.js 必须将官方输入框上方的文件卡片纳入防选中与拖拽支持");

console.log("✓ 普通文件卡片防文本选中与自由拖拽流转契约验证通过");

// =========================================================================
// [Test 10] 普通文件拖入底部输入框防破图与通用文件无损流转契约
// =========================================================================
console.log("[Test 10] 验证普通文件卡片拖入底部输入框防破图与通用文件无损流转契约...");
const { isImageFileName, isImageMediaType, guessMimeType, createDraftImagesCompat } = await import(pathToFileURL(join(root, "src", "core", "services.js")).href);

// 1. 验证类型推断
assert.strictEqual(isImageFileName("432.txt"), false, "432.txt 绝不得判定为图片文件名");
assert.strictEqual(isImageFileName("doc.pdf"), false, "doc.pdf 绝不得判定为图片文件名");
assert.strictEqual(isImageFileName("test.png"), true, "test.png 必须判定为图片文件名");
assert.strictEqual(isImageFileName("avatar.jpg"), true, "avatar.jpg 必须判定为图片文件名");

assert.strictEqual(guessMimeType("432.txt"), "text/plain", "432.txt 必须推断为 text/plain，严禁默认推断为 image/png");
assert.strictEqual(guessMimeType("doc.pdf"), "application/pdf");

// 2. 验证非图片文件 File 实例构造
const textResolved = await resolveAttachmentFile("test-sess", { attachmentId: "att-txt-1", name: "432.txt" }, mockProps);
assert.ok(textResolved instanceof File, "普通文本文件必须解析为 File 实例");
assert.notStrictEqual(textResolved.type, "image/png", "普通文本文件 File.type 严禁为 image/png，防止官方输入框按图片渲染破图");
assert.strictEqual(textResolved.type, "text/plain");

// 3. 验证草稿创建与 kind / previewUrl 隔离（严禁为普通文档生成 previewUrl）
const mockDraftSession = {
  createDrafts: (sessId, files) => files.map(f => ({
    id: "draft-" + f.name,
    file: f,
    kind: isImageFileName(f.name) ? "image" : "file"
  }))
};
const prevConv = (await import(pathToFileURL(join(root, "src", "core", "services.js")).href)).serviceRefs.conversation;
(await import(pathToFileURL(join(root, "src", "core", "services.js")).href)).serviceRefs.conversation = mockDraftSession;
try {
  const mixedDrafts = createDraftImagesCompat([textResolved, new File(["img"], "pic.png", { type: "image/png" })], "test-sess");
  assert.strictEqual(mixedDrafts.length, 2);
  assert.strictEqual(mixedDrafts[0].kind, "file", "432.txt 草稿必须为 kind: file");
  assert.strictEqual(mixedDrafts[0].previewUrl, "", "432.txt 必须保持 previewUrl 为空字符串，防止官方输入框当作图片渲染破图");
  assert.strictEqual(mixedDrafts[1].kind, "image", "pic.png 草稿必须为 kind: image");
  assert.ok(mixedDrafts[1].previewUrl.length > 0, "pic.png 必须包含 previewUrl");
} finally {
  (await import(pathToFileURL(join(root, "src", "core", "services.js")).href)).serviceRefs.conversation = prevConv;
}

// 4. 源码静态防护：view.js onDrop 释放到底部不得过滤普通文件，且必须在完成后调用 clearDraggedAttachment
assert.ok(!viewSrc2.includes("rawFiles.filter(function (f) { return f.type && f.type.indexOf(\"image\") === 0; })"), "view.js onDrop 释放到底部不得过滤丢弃普通文档");
assert.ok(viewSrc2.includes("isImageFile"), "view.js 必须使用 isImageFile 严格结合扩展名与 MIME 区分图片与通用文档");
assert.ok(viewSrc2.includes("clearDraggedAttachment()"), "view.js 必须在拖拽完成后清空当前拖拽状态，保证后续拖拽顺畅");

console.log("✓ 普通文件卡片拖入底部输入框防破图与通用文件无损流转契约验证通过");

// =========================================================================
// [Test 11] 底部输入框文件/图片在气泡编辑发送后跨会话完整保留契约
// =========================================================================
console.log("[Test 11] 验证底部输入框文件/图片在气泡编辑发送后跨会话完整保留契约...");
const { stageBottomDraftFiles, consumeBottomDraftFiles, extractBottomDraftFiles } = await import(pathToFileURL(join(root, "src", "features", "bubble", "attachments.js")).href);

assert.ok(typeof stageBottomDraftFiles === "function", "attachments.js 必须导出 stageBottomDraftFiles");
assert.ok(typeof consumeBottomDraftFiles === "function", "attachments.js 必须导出 consumeBottomDraftFiles");
assert.ok(typeof extractBottomDraftFiles === "function", "attachments.js 必须导出 extractBottomDraftFiles");

// 1. 验证底部文件提取与暂存池读写
const testFile1 = new File(["test1"], "1.txt", { type: "text/plain" });
const testFile2 = new File(["test2"], "2.png", { type: "image/png" });

const mockBottomConv = {
  draftAttachments: new Map([
    ["b-1", { id: "b-1", file: testFile1 }],
    ["b-2", { id: "b-2", file: testFile2 }]
  ])
};
const prevConv2 = (await import(pathToFileURL(join(root, "src", "core", "services.js")).href)).serviceRefs.conversation;
(await import(pathToFileURL(join(root, "src", "core", "services.js")).href)).serviceRefs.conversation = mockBottomConv;
try {
  const extracted = await extractBottomDraftFiles("sess-1", ["b-1", "b-2"], mockProps, []);
  assert.strictEqual(extracted.length, 2, "extractBottomDraftFiles 必须成功提取两个原生 File 实例");
  assert.strictEqual(extracted[0].name, "1.txt");
  assert.strictEqual(extracted[1].name, "2.png");

  stageBottomDraftFiles("target-sess-1", extracted);
  const consumed = consumeBottomDraftFiles("target-sess-1");
  assert.strictEqual(consumed.length, 2, "consumeBottomDraftFiles 必须完整取出暂存的底部文件");
  assert.strictEqual(consumed[0].name, "1.txt");
  assert.strictEqual(consumeBottomDraftFiles("target-sess-1").length, 0, "暂存池消费后必须自动清空");
} finally {
  (await import(pathToFileURL(join(root, "src", "core", "services.js")).href)).serviceRefs.conversation = prevConv2;
}

// 2. 静态契约验证：banner.js 与 view.js 联动
const bannerSrc = await readFile(join(root, "src", "features", "recall", "banner.js"), "utf8");
assert.ok(bannerSrc.includes("consumeBottomDraftFiles(sessionId)"), "banner.js 必须在 Phase 2 从 consumeBottomDraftFiles 获取底部文件");
assert.ok(bannerSrc.includes("createDraftImagesCompat(bFiles, sessionId)"), "banner.js 必须为底部文件在新会话重新生成正式草稿");

const latestViewSrc = await readFile(join(root, "src", "features", "bubble", "view.js"), "utf8");
assert.ok(latestViewSrc.includes("extractBottomDraftFiles"), "view.js confirmEdit 必须调用 extractBottomDraftFiles 提取底部附件");
assert.ok(latestViewSrc.includes("stageBottomDraftFiles"), "view.js 必须为新会话暂存底部草稿文件");

console.log("✓ 底部输入框文件/图片在气泡编辑发送后跨会话完整保留契约验证通过");

// =========================================================================
// [Test 12] 底部输入框含文字与文件时撤回隔离、发送不混入及原草稿自动复原契约
// =========================================================================
console.log("[Test 12] 验证底部输入框含文字与文件时撤回隔离、发送不混入及原草稿自动复原契约...");

const {
  stageRecallOriginalFiles,
  getRecallOriginalFiles,
  clearRecallOriginalFiles,
  restoreDraftFilesCompat
} = await import(pathToFileURL(join(root, "src", "features", "bubble", "attachments.js")).href);

// 1. 暂存池生命周期行为验证
const mockF1 = new File(["test data 432"], "432.txt", { type: "text/plain" });
stageRecallOriginalFiles("sess-recall-test", [mockF1]);
const recalledFiles = getRecallOriginalFiles("sess-recall-test");
assert.strictEqual(recalledFiles.length, 1, "getRecallOriginalFiles 必须能正确取出暂存的原草稿文件");
assert.strictEqual(recalledFiles[0].name, "432.txt");

clearRecallOriginalFiles("sess-recall-test");
assert.strictEqual(getRecallOriginalFiles("sess-recall-test").length, 0, "clearRecallOriginalFiles 后必须清空暂存");

// 2. restoreDraftFilesCompat 原生 addFiles 与降级验证
let nativeAddCalled = false;
const mockIaNative = {
  addFiles: (files) => {
    nativeAddCalled = true;
    assert.strictEqual(files.length, 1);
  }
};
const resNative = restoreDraftFilesCompat(mockIaNative, [mockF1], "sess-recall-test");
assert.strictEqual(resNative, true, "restoreDraftFilesCompat 优先走原生 addFiles");
assert.strictEqual(nativeAddCalled, true);

// 3. 静态源码契约验证
const latestViewSrcForT12 = await readFile(join(root, "src", "features", "bubble", "view.js"), "utf8");
assert.ok(latestViewSrcForT12.includes("stageRecallOriginalFiles(sessionId, userOrigFiles)"), "view.js 确认撤回必须暂存原草稿文件");
assert.ok(latestViewSrcForT12.includes("stageRecallOriginalFiles(sessionId, userOrigFiles2)"), "view.js 直接撤回必须暂存原草稿文件");
assert.ok(latestViewSrcForT12.includes("pruneInputImagesCompat(ia, [])"), "view.js 撤回时必须清空原有输入框附件防止混杂");
assert.ok(latestViewSrcForT12.includes("ia.setDraft(text)"), "view.js 撤回时必须纯净填入撤回消息，严禁与原草稿合并");

const latestBannerSrcForT12 = await readFile(join(root, "src", "features", "recall", "banner.js"), "utf8");
assert.ok(latestBannerSrcForT12.includes("getRecallOriginalFiles"), "banner.js 必须引入并使用 getRecallOriginalFiles");
assert.ok(latestBannerSrcForT12.includes("restoreDraftFilesCompat"), "banner.js 必须使用 restoreDraftFilesCompat 恢复原草稿文件");
assert.ok(latestBannerSrcForT12.includes("stageBottomDraftFiles(newId, stagedUserFiles)"), "banner.js doRecallThenSend 发送时必须为新会话暂存原草稿文件");
assert.ok(latestBannerSrcForT12.includes("stagedDraft: stagedDraftPayload"), "banner.js doRecallThenSend 发送时必须在 resume-send 中携带 stagedDraft");

console.log("✓ 底部输入框含文字与文件时撤回隔离、发送不混入及原草稿自动复原契约验证通过");

// =========================================================================
// [Test 13] 消息预览大小（“小”紧凑方块默认 vs “放大”大图大卡片）契约验证
// =========================================================================
console.log("[Test 13] 验证消息预览大小（默认“小”收成小方框 vs “放大”模式图片放大呈现官方高度）契约...");

const { messagePreviewSize, SETTING_KEYS } = await import(pathToFileURL(join(root, "src", "core", "constants.js")).href);
assert.strictEqual(typeof messagePreviewSize, "function", "constants.js 必须导出 messagePreviewSize");
assert.ok(SETTING_KEYS.messagePreviewSize, "SETTING_KEYS 必须包含 messagePreviewSize 配置键");
assert.strictEqual(messagePreviewSize(), "small", "messagePreviewSize 默认值必须为 small");

const settingsSrc = await readFile(join(root, "src", "features", "settings-card", "index.js"), "utf8");
assert.ok(settingsSrc.includes("messagePreviewSize"), "设置面板必须包含消息预览大小状态");
assert.ok(settingsSrc.includes("L.messagePreviewSize"), "设置面板必须渲染消息预览大小选项标签");
assert.ok(settingsSrc.includes("L.previewSizeSmall") && settingsSrc.includes("L.previewSizeLarge"), "设置面板必须包含小与放大分段选项");

const otherIndexSrc = await readFile(join(root, "src", "features", "other", "index.js"), "utf8");
assert.ok(otherIndexSrc.includes("messagePreviewSize"), "OtherSettingsPage 必须包含消息预览大小状态");
assert.ok(otherIndexSrc.includes("L.messagePreviewSize"), "OtherSettingsPage 必须渲染消息预览大小选项标签");
assert.ok(otherIndexSrc.includes("L.previewSizeSmall") && otherIndexSrc.includes("L.previewSizeLarge"), "OtherSettingsPage 必须包含小与放大分段选项");

const latestUiSrcForT13 = await readFile(join(root, "src", "core", "ui.js"), "utf8");
assert.ok(latestUiSrcForT13.includes("dsh-easyrewrite-images-expanded"), "ui.js 放大模式下多图必须按单图展开呈现官方完整高度");
assert.ok(latestUiSrcForT13.includes("opt.compact = true") || latestUiSrcForT13.includes("compact: true"), "ui.js 小模式下必须传递 compact 请求官方紧凑瓦片");
assert.ok(latestUiSrcForT13.includes('width: "64px"') && latestUiSrcForT13.includes('height: "64px"'), "ui.js 小模式下文件卡片必须收成 64px 小方框");

const latestI18nSrcForT13 = await readFile(join(root, "src", "core", "i18n.js"), "utf8");
assert.ok(latestI18nSrcForT13.includes("消息预览大小"), "i18n.js 中文必须提供消息预览大小文案");
assert.ok(latestI18nSrcForT13.includes('"小"') || latestI18nSrcForT13.includes("previewSizeSmall: \"小\""), "i18n.js 中文必须提供“小”选项");
assert.ok(latestI18nSrcForT13.includes('"放大"') || latestI18nSrcForT13.includes("previewSizeLarge: \"放大\""), "i18n.js 中文必须提供“放大”选项");
assert.ok(latestI18nSrcForT13.includes("Message preview size"), "i18n.js 英文必须提供 Message preview size 文案");

console.log("✓ 消息预览大小设置项与视图自适应渲染契约验证通过");

// =========================================================================
// [Test 14] 设置页版本家族功能（Vault 影子仓储全量扫描 + 响应式树状恢复）契约验证
// =========================================================================
console.log("[Test 14] 验证设置页版本家族（Vault 影子仓储家族打通 + 跨版本恢复）契约...");

const sessionCoreSrc = await readFile(join(root, "src", "core", "session.js"), "utf8");
assert.ok(sessionCoreSrc.includes("useVersionFamilies"), "session.js 必须导出 useVersionFamilies Hook");
assert.ok(sessionCoreSrc.includes("restoreSessionVersion"), "session.js 必须导出 restoreSessionVersion");
assert.ok(sessionCoreSrc.includes("/bubble/vault/families"), "session.js 必须请求 /bubble/vault/families 接口");

const hostIndexSrc = await readFile(join(root, "lib", "index.js"), "utf8");
assert.ok(hostIndexSrc.includes("path: '/bubble/vault/families'"), "Host 必须注册 /bubble/vault/families 路由");
assert.ok(hostIndexSrc.includes("listAllVaultFamilies"), "Host 必须实现 listAllVaultFamilies 扫描算法");

const historyIndexSrc = await readFile(join(root, "src", "features", "history", "index.js"), "utf8");
assert.ok(historyIndexSrc.includes("useVersionFamilies"), "HistorySettingsPage 必须使用 useVersionFamilies 获取全量家族");
assert.ok(historyIndexSrc.includes("restoreSessionVersion"), "HistorySettingsPage 必须使用 restoreSessionVersion 统一恢复版本");
assert.ok(historyIndexSrc.includes("fam.isVault"), "HistorySettingsPage 必须识别 Vault 影子仓储家族");

const settingsCardSrcForT14 = await readFile(join(root, "src", "features", "settings-card", "index.js"), "utf8");
assert.ok(settingsCardSrcForT14.includes("useVersionFamilies"), "EasyRewriteSettingsCard 必须使用 useVersionFamilies");
assert.ok(settingsCardSrcForT14.includes("restoreSessionVersion"), "EasyRewriteSettingsCard 必须使用 restoreSessionVersion");

console.log("✓ 设置页版本家族功能全链路契约验证通过");

console.log("\n======================================");
console.log("✔ 社区 PR & Issue 改进自研融合专项测试全部通过！");
console.log("======================================\n");
