import assert from "node:assert/strict";
import {
  serviceRefs,
  setServiceRefs,
  createDraftImagesCompat,
  addInputImagesCompat,
  removeInputImageCompat,
  pruneInputImagesCompat,
  getInputImageIdsCompat
} from "../src/core/services.js";

console.log("--- 开始测试：DSH 0.1.7+ 草稿附件与带图原地编辑兼容性专项测试 ---");

// [Test 1] 模拟 DSH 0.1.7+ 新版环境（conversation.createDrafts + inputActions.addAttachments + inputState.attachmentIds）
console.log("[Test 1] 模拟 DSH 0.1.7+ 新版草稿与附件 API 验证...");
{
  let calledDrafts = false;
  let passedSessionId = null;
  let passedFiles = null;

  const mockCtx = {
    conversation: {
      createDrafts(sessionId, files) {
        calledDrafts = true;
        passedSessionId = sessionId;
        passedFiles = files;
        return files.map((f, idx) => ({
          kind: "image",
          id: "uuid-" + idx,
          previewUrl: "blob:http://localhost/" + idx,
          file: f
        }));
      }
    },
    uiConversation: {
      imageUrl(sessionId, attachment) {
        return Promise.resolve("blob:http://localhost/resolved-" + attachment.attachmentId);
      }
    }
  };

  setServiceRefs(mockCtx);

  const mockFiles = [
    { name: "test1.png", type: "image/png" },
    { name: "test2.jpg", type: "image/jpeg" }
  ];

  const drafts = createDraftImagesCompat(mockFiles, "session-123");
  assert.equal(calledDrafts, true, "应调用 conv.createDrafts");
  assert.equal(passedSessionId, "session-123", "应正确传递 sessionId");
  assert.equal(passedFiles.length, 2, "传递的文件数量应为 2");
  assert.equal(drafts.length, 2, "返回草稿数量应为 2");
  assert.equal(drafts[0].id, "uuid-0");
  assert.equal(drafts[0].previewUrl, "blob:http://localhost/0");

  // 验证 addAttachments
  let addedIds = null;
  const mockActions = {
    addAttachments(ids) {
      addedIds = ids;
      return true;
    }
  };
  const addRes = addInputImagesCompat(mockActions, ["uuid-0", "uuid-1"]);
  assert.equal(addRes, true);
  assert.deepEqual(addedIds, ["uuid-0", "uuid-1"], "应正确调用 addAttachments 传入 ids");

  // 验证 removeAttachment
  let removedId = null;
  mockActions.removeAttachment = (id) => {
    removedId = id;
    return true;
  };
  const rmRes = removeInputImageCompat(mockActions, "uuid-0");
  assert.equal(rmRes, true);
  assert.equal(removedId, "uuid-0");

  // 验证 pruneAttachments
  let prunedIds = null;
  mockActions.pruneAttachments = (ids) => {
    prunedIds = ids;
    return true;
  };
  const prRes = pruneInputImagesCompat(mockActions, ["uuid-1"]);
  assert.equal(prRes, true);
  assert.deepEqual(prunedIds, ["uuid-1"]);

  // 验证 getInputImageIdsCompat（优先 attachmentIds）
  const stateNew = { attachmentIds: ["uuid-a", "uuid-b"] };
  assert.deepEqual(getInputImageIdsCompat(stateNew), ["uuid-a", "uuid-b"]);

  console.log("✓ DSH 0.1.7+ 新版环境全套草稿附件接口验证通过");
}

// [Test 2] 模拟 DSH ≤0.1.5 老版本环境（conversation.createDraftImages + inputActions.addImages + inputState.imageIds）
console.log("[Test 2] 模拟 DSH ≤0.1.5 老版本兼容性验证...");
{
  let calledDraftImages = false;

  const mockCtxLegacy = {
    conversation: {
      createDraftImages(files) {
        calledDraftImages = true;
        return files.map((f, idx) => ({
          id: "old-uuid-" + idx,
          previewUrl: "blob:http://legacy/" + idx
        }));
      }
    }
  };

  setServiceRefs(mockCtxLegacy);

  const mockFiles = [{ name: "legacy.png", type: "image/png" }];
  const drafts = createDraftImagesCompat(mockFiles, "session-old");
  assert.equal(calledDraftImages, true, "应降级调用 conv.createDraftImages");
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].id, "old-uuid-0");
  assert.equal(drafts[0].previewUrl, "blob:http://legacy/0");

  // 验证老版 addImages
  let legacyAddedIds = null;
  const mockLegacyActions = {
    addImages(ids) {
      legacyAddedIds = ids;
      return true;
    }
  };
  const addRes = addInputImagesCompat(mockLegacyActions, ["old-uuid-0"]);
  assert.equal(addRes, true);
  assert.deepEqual(legacyAddedIds, ["old-uuid-0"]);

  // 验证老版 removeImage 与 pruneImages
  let legacyRemovedId = null;
  mockLegacyActions.removeImage = (id) => { legacyRemovedId = id; return true; };
  assert.equal(removeInputImageCompat(mockLegacyActions, "old-uuid-0"), true);
  assert.equal(legacyRemovedId, "old-uuid-0");

  let legacyPruned = null;
  mockLegacyActions.pruneImages = (ids) => { legacyPruned = ids; return true; };
  assert.equal(pruneInputImagesCompat(mockLegacyActions, []), true);
  assert.deepEqual(legacyPruned, []);

  // 验证老版 inputState.imageIds
  const stateOld = { imageIds: ["old-1", "old-2"] };
  assert.deepEqual(getInputImageIdsCompat(stateOld), ["old-1", "old-2"]);

  console.log("✓ DSH ≤0.1.5 老版本全套降级接口验证通过");
}

console.log("\n======================================");
console.log("✔ 所有 DSH 0.1.7+ 草稿与附件专项测试全部通过！");
console.log("======================================\n");
