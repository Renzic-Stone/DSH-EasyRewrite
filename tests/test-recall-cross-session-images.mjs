import assert from "node:assert/strict";
import {
  serviceRefs,
  setServiceRefs,
  createDraftImagesCompat,
  addInputImagesCompat,
  getInputImageIdsCompat
} from "../src/core/services.js";
import {
  collectOutgoingFiles,
  stageOutgoingFiles,
  consumeStagedFiles,
  cachedRebuiltFiles
} from "../src/features/bubble/attachments.js";

console.log("--- 开始测试：撤回重发跨会话图片草稿生命周期保护专项测试 ---");

// [Test 1] 验证 getInputImageIdsCompat 的 Snapshot 与直接属性多级读取
console.log("[Test 1] 验证 getInputImageIdsCompat 对 direct 属性与 state.getSnapshot() 的兼容...");
{
  const directState = { attachmentIds: ["id-1", "id-2"] };
  assert.deepEqual(getInputImageIdsCompat(directState), ["id-1", "id-2"]);

  const snapshotState = {
    state: {
      getSnapshot() {
        return { attachmentIds: ["snap-1", "snap-2"] };
      }
    }
  };
  assert.deepEqual(getInputImageIdsCompat(snapshotState), ["snap-1", "snap-2"]);
  console.log("✓ getInputImageIdsCompat 多级解析正常");
}

// [Test 2] 验证 collectOutgoingFiles 能够从全局 draftAttachments 提取 File 对象
console.log("[Test 2] 验证 collectOutgoingFiles 从输入框与缓存提取 File...");
{
  const mockFile1 = new File(["dummy1"], "pic1.png", { type: "image/png" });
  const mockFile2 = new File(["dummy2"], "pic2.jpg", { type: "image/jpeg" });

  const mockDraftAttachments = new Map();
  mockDraftAttachments.set("att-1", { id: "att-1", file: mockFile1 });
  mockDraftAttachments.set("att-2", { id: "att-2", file: mockFile2 });

  setServiceRefs({
    conversation: {
      draftAttachments: mockDraftAttachments
    }
  });

  const inputState = { attachmentIds: ["att-1", "att-2"] };
  const collected = collectOutgoingFiles("old-session", inputState);
  assert.equal(collected.length, 2, "应成功提取 2 个 File 对象");
  assert.equal(collected[0], mockFile1);
  assert.equal(collected[1], mockFile2);
  console.log("✓ collectOutgoingFiles 成功提取原生 File 实例");
}

// [Test 3] 模拟跨会话草稿生命周期：老会话归档触发 releaseDraftAttachment，新会话通过暂存 File 完美重建
console.log("[Test 3] 模拟老会话 release 销毁与新会话带图恢复重建完整时序...");
{
  const mockFile = new File(["img-data"], "photo.png", { type: "image/png" });
  const mockDraftAttachments = new Map();
  mockDraftAttachments.set("old-draft-id", { id: "old-draft-id", file: mockFile });

  let newSessionCreatedDrafts = null;
  setServiceRefs({
    conversation: {
      draftAttachments: mockDraftAttachments,
      createDrafts(sessionId, files) {
        newSessionCreatedDrafts = { sessionId, files };
        return files.map((f, i) => ({
          id: "new-draft-" + sessionId + "-" + i,
          previewUrl: "blob://new-" + i,
          file: f
        }));
      },
      releaseDraftAttachment(id) {
        mockDraftAttachments.delete(id);
      }
    }
  });

  // 1. 用户点击撤回并在输入框准备发送
  const oldSessionId = "session-old";
  const newSessionId = "session-new-forked";
  const inputState = { attachmentIds: ["old-draft-id"] };

  // 2. 发送前夕（doRecallThenSend）：收集并暂存 File
  const outgoingFiles = collectOutgoingFiles(oldSessionId, inputState);
  assert.equal(outgoingFiles.length, 1);
  stageOutgoingFiles(newSessionId, outgoingFiles);

  // 3. 模拟 DSH 官方行为：归档老会话，销毁老会话输入框，释放草稿
  serviceRefs.conversation.releaseDraftAttachment("old-draft-id");
  assert.equal(mockDraftAttachments.has("old-draft-id"), false, "老会话草稿已按官方逻辑被销毁释放");

  // 4. 新会话挂载（resume-send 消费）：
  const stagedFiles = consumeStagedFiles(newSessionId);
  assert.equal(stagedFiles.length, 1, "新会话应成功拿到暂存的文件");

  // 为新会话生成合法 draft
  const newDrafts = createDraftImagesCompat(stagedFiles, newSessionId);
  assert.equal(newSessionCreatedDrafts.sessionId, newSessionId);
  assert.equal(newDrafts.length, 1);
  assert.equal(newDrafts[0].id, "new-draft-session-new-forked-0");

  let attachedIds = null;
  const mockInputActions = {
    addAttachments(ids) {
      attachedIds = ids;
      return true;
    }
  };
  addInputImagesCompat(mockInputActions, newDrafts.map(d => d.id));
  assert.deepEqual(attachedIds, ["new-draft-session-new-forked-0"], "新会话输入框应成功注入新草稿附件 ID");

  console.log("✓ 跨会话图片草稿生命周期保护时序完全闭环");
}

console.log("\n======================================");
console.log("✔ 撤回跨会话带图发送所有专项测试通过！");
console.log("======================================\n");
