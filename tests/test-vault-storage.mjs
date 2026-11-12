import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { zstdCompressSync } from 'node:zlib';
import { __test } from '../lib/index.js';

console.log('--- 开始测试：EasyRewrite 嵌套 fork 影子仓储（Vault）与智能归档迁移专项测试 ---');

const {
  resolveVaultDir,
  readVaultConfig,
  writeVaultConfig,
  saveVaultSnapshotInternal,
  restoreVaultSnapshotInternal,
  cloneVaultInternal,
  migrateArchivedSessionsInternal
} = __test;

// =========================================================================
// [Test 1] 影子仓储目录解析验证（全局 vs 工作区）
// =========================================================================
console.log('[Test 1] 影子仓储路径解析验证...');
const testSid = 'session-test-uuid-1234';
const testWs = 'ws-test-project-5678';

const globalDir = resolveVaultDir(testSid, testWs, 'global');
assert.ok(globalDir.includes('EasyRewrited_Sessions'), '全局路径应包含 EasyRewrited_Sessions');
assert.ok(globalDir.endsWith(testSid), '全局路径应以 sessionId 结尾');
assert.ok(globalDir.includes('dsh-easyrewrite'), '全局路径应包含 dsh-easyrewrite');

const wsDir = resolveVaultDir(testSid, testWs, 'workspace');
assert.ok(wsDir.includes('.easyrewrite_vault'), '工作区路径应包含 .easyrewrite_vault');
assert.ok(wsDir.includes('EasyRewrited_Sessions'), '工作区路径应包含 EasyRewrited_Sessions');
assert.ok(wsDir.includes(testWs), '工作区路径应包含 workspaceId');
assert.ok(wsDir.endsWith(testSid), '工作区路径应以 sessionId 结尾');
console.log('✓ 影子仓储全局与工作区路径解析验证通过');

// =========================================================================
// [Test 2] 配置读写与持久化验证
// =========================================================================
console.log('[Test 2] Vault 配置读写与持久化验证...');
const origCfg = await readVaultConfig();

await writeVaultConfig({ storageMode: 'workspace' });
const updatedCfg = await readVaultConfig();
assert.equal(updatedCfg.storageMode, 'workspace', '配置应成功更新为 workspace');

// 恢复默认 global
await writeVaultConfig({ storageMode: 'global' });
const restoredCfg = await readVaultConfig();
assert.equal(restoredCfg.storageMode, 'global', '配置应成功恢复为 global');
console.log('✓ Vault 配置读写与持久化验证通过');

// =========================================================================
// [Test 3] 影子仓储版本快照保存、查重与原子覆盖还原验证
// =========================================================================
console.log('[Test 3] 影子快照保存、查重与原子覆盖还原测试...');

const mockDshHome = join(tmpdir(), 'dsh-vault-test-' + Date.now());
const oldHome = process.env.DSH_HOME;
process.env.DSH_HOME = mockDshHome;

try {
  const wsId = 'test-ws-abc';
  const sessId = 'test-sess-xyz';
  const sessDir = join(mockDshHome, 'sessions', wsId, sessId);
  await mkdir(sessDir, { recursive: true });

  const sessionFile = join(sessDir, 'session.v4.jsonl.zstd');

  // 1. 写入版本 1 内容
  const contentV1 = 'VERSION_1_EVENT_DATA_AABBCC';
  await writeFile(sessionFile, contentV1, 'utf8');

  // 2. 保存快照 V1
  const save1 = await saveVaultSnapshotInternal(sessId, wsId, '初始版本 1');
  assert.ok(save1.ok, '保存 V1 应成功');
  assert.equal(save1.versionNumber, 1, '首个版本应为 1');
  assert.equal(save1.manifest.versions.length, 1);

  // 3. 查重：未修改内容再次保存，应幂等
  const save1Dup = await saveVaultSnapshotInternal(sessId, wsId, '重复保存 V1');
  assert.ok(save1Dup.ok, '查重应成功');
  assert.ok(save1Dup.unchanged, '内容未修改应标记 unchanged');
  assert.equal(save1Dup.manifest.versions.length, 1, '不应追加多余版本');

  // 4. 写入版本 2 内容并保存快照 V2
  const contentV2 = 'VERSION_2_REWRITE_EVENT_DATA_DDEEFF';
  await writeFile(sessionFile, contentV2, 'utf8');

  const save2 = await saveVaultSnapshotInternal(sessId, wsId, '撤回修改重发版本 2');
  assert.ok(save2.ok, '保存 V2 应成功');
  assert.equal(save2.versionNumber, 2, '版本号应递增为 2');
  assert.equal(save2.manifest.versions.length, 2);

  // 5. 模拟翻页器：将 V1 原样覆盖还原回 sessionFile
  const mockCtx = {
    agents: { get: () => null },
    sessions: { get: () => null }
  };
  const restoreRes = await restoreVaultSnapshotInternal(mockCtx, sessId, wsId, 1);
  assert.ok(restoreRes.ok, '还原 V1 应成功');

  const restoredContent = await readFile(sessionFile, 'utf8');
  assert.equal(restoredContent, contentV1, '物理文件应原样恢复为版本 1 内容');

  // 6. 再次翻页回到 V2
  const restoreV2 = await restoreVaultSnapshotInternal(mockCtx, sessId, wsId, 2);
  assert.ok(restoreV2.ok, '还原 V2 应成功');
  const restoredV2Content = await readFile(sessionFile, 'utf8');
  assert.equal(restoredV2Content, contentV2, '物理文件应原样恢复为版本 2 内容');

  console.log('✓ 影子快照保存、查重、覆盖还原与原子一致性验证全部通过');
} finally {
  await rm(mockDshHome, { recursive: true, force: true }).catch(() => {});
  if (oldHome) process.env.DSH_HOME = oldHome;
  else delete process.env.DSH_HOME;
}

// =========================================================================
// [Test 4] 用户 Fork 对话时影子仓储（Fork 链）原样克隆与两链完全独立验证
// =========================================================================
console.log('[Test 4] Fork 对话影子仓储原样复制与独立演进测试...');
const mockForkHome = join(tmpdir(), 'dsh-fork-test-' + Date.now());
process.env.DSH_HOME = mockForkHome;

try {
  const wsId = 'ws-fork-demo';
  const parentId = 'sess-parent-root';
  const childId = 'sess-child-forked';

  const parentDir = join(mockForkHome, 'sessions', wsId, parentId);
  const childDir = join(mockForkHome, 'sessions', wsId, childId);
  await mkdir(parentDir, { recursive: true });
  await mkdir(childDir, { recursive: true });

  const parentFile = join(parentDir, 'session.v4.jsonl.zstd');
  const childFile = join(childDir, 'session.v4.jsonl.zstd');
  await writeFile(parentFile, 'PARENT_INITIAL_DATA', 'utf8');
  await writeFile(childFile, 'CHILD_INITIAL_DATA', 'utf8');

  // 为父会话建立两个历史版本
  await saveVaultSnapshotInternal(parentId, wsId, '父会话版本 1');
  await writeFile(parentFile, 'PARENT_DATA_MODIFIED_V2', 'utf8');
  await saveVaultSnapshotInternal(parentId, wsId, '父会话版本 2');

  // 执行克隆
  const cloneResult = await cloneVaultInternal(parentId, childId, wsId);
  assert.ok(cloneResult.ok, '克隆应该成功');
  assert.ok(cloneResult.cloned, '应标记已克隆');
  assert.equal(cloneResult.versionCount, 2, '子会话应继承父会话全部 2 个版本');

  // 验证子会话 Vault 文件已到位
  const childVaultDir = resolveVaultDir(childId, wsId, 'global');
  const childManifest = JSON.parse(await readFile(join(childVaultDir, 'manifest.json'), 'utf8'));
  assert.equal(childManifest.sessionId, childId, '子会话 manifest sessionId 应为 childId');
  assert.equal(childManifest.clonedFrom, parentId, '应记录源 parentId');
  assert.equal(childManifest.versions.length, 2);

  // 验证两链完全独立：在子会话中追加版本 3
  await writeFile(childFile, 'CHILD_DATA_V3', 'utf8');
  await saveVaultSnapshotInternal(childId, wsId, '子会话专属版本 3');

  const childUpdatedManifest = JSON.parse(await readFile(join(childVaultDir, 'manifest.json'), 'utf8'));
  assert.equal(childUpdatedManifest.versions.length, 3, '子会话应演进为 3 个版本');

  // 父会话依然保持 2 个版本，不受任何污染
  const parentVaultDir = resolveVaultDir(parentId, wsId, 'global');
  const parentManifest = JSON.parse(await readFile(join(parentVaultDir, 'manifest.json'), 'utf8'));
  assert.equal(parentManifest.versions.length, 2, '父会话应依然保持 2 个版本，绝不受子会话影响');

  console.log('✓ Fork 对话影子仓储原样复制、独立继承与物理隔离验证通过');
} finally {
  await rm(mockForkHome, { recursive: true, force: true }).catch(() => {});
  if (oldHome) process.env.DSH_HOME = oldHome;
  else delete process.env.DSH_HOME;
}

// =========================================================================
// [Test 5] 历史归档智能自动迁移验证（防误判用户主动归档 + 零数据丢失）
// =========================================================================
console.log('[Test 5] 历史归档智能转化与防误判测试...');
const mockMigrateHome = join(tmpdir(), 'dsh-migrate-test-' + Date.now());
process.env.DSH_HOME = mockMigrateHome;

try {
  const storagesDir = join(mockMigrateHome, 'storages');
  const sessionsDir = join(mockMigrateHome, 'sessions', 'ws-test');
  await mkdir(storagesDir, { recursive: true });
  await mkdir(sessionsDir, { recursive: true });

  const wsJsonPath = join(storagesDir, 'workspace.json');

  // 创建三种会话：
  // 1. 空白残留会话（<= 2行）: session-empty-trash
  const emptyDir = join(sessionsDir, 'session-empty-trash');
  await mkdir(emptyDir, { recursive: true });
  const emptyContent = JSON.stringify({ type: 'session', id: 'session-empty-trash' }) + '\n';
  await writeFile(join(emptyDir, 'session.v4.jsonl.zstd'), zstdCompressSync(Buffer.from(emptyContent)));

  // 2. 撤回历史会话（> 2行且带 parentSession）: session-recall-history
  const recallDir = join(sessionsDir, 'session-recall-history');
  await mkdir(recallDir, { recursive: true });
  const recallContent = [
    JSON.stringify({ type: 'session', id: 'session-recall-history', parentSession: 'session-active-parent' }),
    JSON.stringify({ type: 'user/message', data: { text: '旧问题1' } }),
    JSON.stringify({ type: 'assistant/message', data: { text: '旧回答1' } })
  ].join('\n') + '\n';
  await writeFile(join(recallDir, 'session.v4.jsonl.zstd'), zstdCompressSync(Buffer.from(recallContent)));

  // 3. 用户主动归档会话（> 2行且无 parentSession）: session-user-manual-archived
  const manualDir = join(sessionsDir, 'session-user-manual-archived');
  await mkdir(manualDir, { recursive: true });
  const manualContent = [
    JSON.stringify({ type: 'session', id: 'session-user-manual-archived' }),
    JSON.stringify({ type: 'user/message', data: { text: '用户重要的独立对话' } }),
    JSON.stringify({ type: 'assistant/message', data: { text: '重要回复' } })
  ].join('\n') + '\n';
  await writeFile(join(manualDir, 'session.v4.jsonl.zstd'), zstdCompressSync(Buffer.from(manualContent)));

  const mockWsJson = {
    global: {
      archivedSessionIds: [
        'session-empty-trash',
        'session-recall-history',
        'session-user-manual-archived'
      ]
    },
    tables: {
      workspaces: {
        'ws-test': {
          sessionIds: ['session-active-parent']
        }
      }
    }
  };
  await writeFile(wsJsonPath, JSON.stringify(mockWsJson, null, 2), 'utf8');

  // 运行智能迁移
  const mockCtx = { get: () => null };
  const migRes = await migrateArchivedSessionsInternal(mockCtx, true);

  assert.ok(migRes.ok, '迁移应该成功');
  assert.equal(migRes.migratedCount, 1, '应有 1 个撤回历史会话转化为影子仓储');
  assert.equal(migRes.prunedEmptyCount, 1, '应有 1 个空白废会话被拔除');
  assert.equal(migRes.retainedCount, 1, '必须严格保留 1 个用户主动手动归档的会话');

  // 校验 workspace.json 结果
  const afterWsJson = JSON.parse(await readFile(wsJsonPath, 'utf8'));
  assert.deepEqual(
    afterWsJson.global.archivedSessionIds,
    ['session-user-manual-archived'],
    '只有用户主动手动归档的会话被保留，撤回垃圾与空白会话全部从侧栏归档中拔除'
  );

  // 校验被转化的撤回历史会话是否成功进入影子仓储（确保数据不丢失）
  const activeParentVaultDir = resolveVaultDir('session-active-parent', 'ws-test', 'global');
  const activeParentManifest = JSON.parse(await readFile(join(activeParentVaultDir, 'manifest.json'), 'utf8'));
  assert.ok(activeParentManifest.versions.length >= 1, '撤回历史会话应成功作为快照录入父会话影子仓储');

  console.log('✓ 历史归档智能转化与防误判验证全部通过（零数据丢失 + 用户主动归档 100% 保护）');
} finally {
  await rm(mockMigrateHome, { recursive: true, force: true }).catch(() => {});
  if (oldHome) process.env.DSH_HOME = oldHome;
  else delete process.env.DSH_HOME;
}

// =========================================================================
// [Test 6] 多帧 Zstd 会话解析、Header ID 重写与多版本谱系树自动收纳验证
// =========================================================================
console.log('[Test 6] 多帧 Zstd（Concatenated Frames）解析与谱系收纳测试...');
const mockMultiFrameHome = join(tmpdir(), 'dsh-multiframe-test-' + Date.now());
process.env.DSH_HOME = mockMultiFrameHome;

try {
  const { scanZstdSessionFile, rewriteZstdHeaderId, retireSessionToVaultInternal } = __test;
  const storagesDir = join(mockMultiFrameHome, 'storages');
  const sessionsDir = join(mockMultiFrameHome, 'sessions', 'ws-multi');
  await mkdir(storagesDir, { recursive: true });
  await mkdir(sessionsDir, { recursive: true });

  // 构造真实 DSH 多帧拼接 Zstd 文件（Frame 1 仅 1 行 header，Frame 2/3 为后续事件行）
  function makeConcatenatedZstd(lines) {
    return Buffer.concat(lines.map(l => zstdCompressSync(Buffer.from(l + '\n', 'utf8'))));
  }

  const rootSid = 'session-root-v1';
  const childSid = 'session-child-v2';
  await mkdir(join(sessionsDir, rootSid), { recursive: true });
  await mkdir(join(sessionsDir, childSid), { recursive: true });

  const rootBuf = makeConcatenatedZstd([
    JSON.stringify({ type: 'session', version: 4, id: rootSid, cwd: 'D:\\test' }),
    JSON.stringify({ type: 'turn/start', seq: 0 }),
    JSON.stringify({ type: 'user/message', data: { text: '第一版问题' } }),
    JSON.stringify({ type: 'session-log-deepseek/delivery-accepted', seq: 1, data: { sessionId: rootSid, sessionFormatVersion: 4, throughSeq: 0 } }),
    JSON.stringify({ type: 'assistant/message', data: { text: '第一版回答' } })
  ]);
  const rootFilePath = join(sessionsDir, rootSid, 'session.v4.jsonl.zstd');
  await writeFile(rootFilePath, rootBuf);

  // 验证多帧 Zstd 解析不会只读出 1 行
  const scanRes = await scanZstdSessionFile(rootFilePath);
  assert.equal(scanRes.lineCount, 5, '多帧 Zstd 解析应完整读出全部 5 行而非仅第 1 帧');
  assert.equal(scanRes.turnStartCount, 1, '应准确统计 turn/start 数量');

  // 验证跨会话恢复时 Header ID 与 delivery-accepted 中的 sessionId 同步重写
  const rewrittenBuf = rewriteZstdHeaderId(rootBuf, childSid);
  const tmpCheckPath = join(sessionsDir, childSid, 'session.v4.jsonl.zstd');
  await writeFile(tmpCheckPath, rewrittenBuf);
  const scanRewritten = await scanZstdSessionFile(tmpCheckPath);
  assert.equal(scanRewritten.header.id, childSid, '重写后第 1 帧 Header ID 应严格等于目标会话 ID');
  assert.equal(scanRewritten.lineCount, 5, '重写后后续事件帧应 100% 保留');

  // 验证 delivery-accepted 中的 sessionId 已同步更新为目标会话 childSid（防 SessionFormatError）
  const deliveryAcceptedLine = scanRewritten.lines.find(l => l.includes('delivery-accepted'));
  assert.ok(deliveryAcceptedLine, '应包含 delivery-accepted 事件');
  assert.equal(JSON.parse(deliveryAcceptedLine).data.sessionId, childSid, 'delivery-accepted 中的 sessionId 必须同步重写为目标 childSid');

  // 写入 childSid 第二版内容
  const childBuf = makeConcatenatedZstd([
    JSON.stringify({ type: 'session', version: 4, id: childSid, parentSession: rootSid, cwd: 'D:\\test' }),
    JSON.stringify({ type: 'turn/start', seq: 0 }),
    JSON.stringify({ type: 'user/message', data: { text: '第二版修改后问题' } }),
    JSON.stringify({ type: 'assistant/message', data: { text: '第二版回答' } })
  ]);
  await writeFile(tmpCheckPath, childBuf);

  const wsJsonPath = join(storagesDir, 'workspace.json');
  await writeFile(wsJsonPath, JSON.stringify({
    global: { archivedSessionIds: [] },
    tables: {
      workspaces: {
        'ws-multi': {
          sessionIds: [childSid, rootSid]
        }
      }
    }
  }, null, 2), 'utf8');

  // 执行 retireSessionToVaultInternal：将旧版本 rootSid 移入影子仓储并把版本链继承给 childSid
  let detachedCalled = false;
  const mockCtx = {
    sessions: {
      store: new Map([
        [rootSid, { id: rootSid, detach: () => { detachedCalled = true; } }]
      ])
    }
  };
  const retireRes = await retireSessionToVaultInternal(mockCtx, rootSid, 'ws-multi', childSid);
  assert.ok(retireRes.ok, 'retireSessionToVaultInternal 应成功');
  assert.ok(detachedCalled, '应触发 SessionStore entry.detach() 释放内核文件写锁');

  const afterWs = JSON.parse(await readFile(wsJsonPath, 'utf8'));
  assert.deepEqual(afterWs.tables.workspaces['ws-multi'].sessionIds, [childSid], '侧边栏 sessionIds 应仅保留最新激活会话 childSid');

  const childVaultDir = resolveVaultDir(childSid, 'ws-multi', 'global');
  const childManifest = JSON.parse(await readFile(join(childVaultDir, 'manifest.json'), 'utf8'));
  assert.equal(childManifest.versions.length, 2, '新会话 childSid 的影子仓储应完整拥有 V1 与 V2 两个版本');

  console.log('✓ 多帧 Zstd 解析、Header ID 重写与物理进出仓验证全部通过');
} finally {
  await rm(mockMultiFrameHome, { recursive: true, force: true }).catch(() => {});
  if (oldHome) process.env.DSH_HOME = oldHome;
  else delete process.env.DSH_HOME;
}

// =========================================================================
// [Test 7] Issue #23 / #24 / #25 专项回归测试：
//   1. 500 帧拼接 Zstd 零重复解压 + 跨帧 UTF-8 多字节字符完整性 (#23 & #25)
//   2. vault-config.json 的 archivedMigrated 完成标记持久化与二次启动短路 (#23)
//   3. 侧边栏活跃单节点会话（含 turnStartCount === 0 旧格式或空白新会话）防误删保护 (#23)
//   4. 前端文件拖拽选择器精确限定 FileCard，杜绝污染输入框 [data-composer-card] (#24)
// =========================================================================
console.log('[Test 7] Issue #23 / #24 / #25 专项回归验证...');
const mockIssueHome = join(tmpdir(), 'dsh-issue23-25-test-' + Date.now());
process.env.DSH_HOME = mockIssueHome;

try {
  const { decompressZstdFrames } = __test;

  // 7.1 500 帧拼接 Zstd 测试（防 O(F^2) 重复后缀解压）
  const frameCount = 500;
  const expectedLines = [];
  const frameBuffers = [];
  for (let i = 0; i < frameCount; i++) {
    const line = JSON.stringify({ seq: i, text: 'FrameLine_' + i });
    expectedLines.push(line);
    frameBuffers.push(zstdCompressSync(Buffer.from(line + '\n', 'utf8')));
  }
  const concat500 = Buffer.concat(frameBuffers);
  const t0 = performance.now();
  const decoded500 = decompressZstdFrames(concat500);
  const elapsedMs = performance.now() - t0;
  const actualLines = decoded500.trim().split('\n');
  assert.equal(actualLines.length, frameCount, '500 帧拼接 Zstd 解压后行数必须严格为 500，绝不能重复膨胀');
  assert.deepEqual(actualLines, expectedLines, '500 帧解压内容顺序与预期必须 100% 一致');
  assert.ok(elapsedMs < 500, '500 帧解压耗时应处于毫秒级: ' + elapsedMs.toFixed(2) + 'ms');

  // 7.2 跨帧拆分 UTF-8 多字节字符测试
  const utf8Raw = Buffer.from('你好，EasyRewrite 跨帧多字节测试！\n', 'utf8');
  // 故意在一个 3 字节汉字的中间（第 4 字节处）切开成两个独立 Zstd 帧
  const part1 = zstdCompressSync(utf8Raw.subarray(0, 4));
  const part2 = zstdCompressSync(utf8Raw.subarray(4));
  const decodedUtf8 = decompressZstdFrames(Buffer.concat([part1, part2]));
  assert.equal(decodedUtf8, '你好，EasyRewrite 跨帧多字节测试！\n', '跨帧拆分的 UTF-8 多字节字符必须无损还原');

  // 7.3 归档迁移完成标记持久化、二次启动短路与侧边栏单节点防误删保护
  const storagesDir = join(mockIssueHome, 'storages');
  const sessionsDir = join(mockIssueHome, 'sessions', 'ws-protect');
  await mkdir(storagesDir, { recursive: true });
  await mkdir(sessionsDir, { recursive: true });

  // 创建一个在侧边栏 sessionIds 中可见、但没有 turn/start 的单节点会话（模拟旧格式或新建会话）
  const activeSingleSid = 'session-active-no-turnstart';
  const activeSingleDir = join(sessionsDir, activeSingleSid);
  await mkdir(activeSingleDir, { recursive: true });
  const activeSingleContent = [
    JSON.stringify({ type: 'session', id: activeSingleSid }),
    JSON.stringify({ type: 'custom/legacy-event', data: { text: '没有 turn/start 的有效侧边栏会话' } })
  ].join('\n') + '\n';
  await writeFile(join(activeSingleDir, 'session.v4.jsonl.zstd'), zstdCompressSync(Buffer.from(activeSingleContent)));

  const wsJsonPath = join(storagesDir, 'workspace.json');
  await writeFile(wsJsonPath, JSON.stringify({
    global: { archivedSessionIds: [] },
    tables: {
      workspaces: {
        'ws-protect': {
          sessionIds: [activeSingleSid]
        }
      }
    }
  }, null, 2), 'utf8');

  const mockCtx = { get: () => null };
  // 首次非强制启动迁移
  const firstRun = await migrateArchivedSessionsInternal(mockCtx, false);
  assert.ok(firstRun.ok && !firstRun.skipped, '首次启动迁移应正常执行完成');

  // 验证侧边栏单节点会话绝未被误删
  assert.ok(existsSync(activeSingleDir), '侧边栏可见的单节点会话目录绝不能被误删');
  const wsAfterFirst = JSON.parse(await readFile(wsJsonPath, 'utf8'));
  assert.deepEqual(wsAfterFirst.tables.workspaces['ws-protect'].sessionIds, [activeSingleSid], '侧边栏 sessionIds 必须完整保留');

  // 验证 vault-config.json 已持久化 archivedMigrated: true，且单独修改 storageMode 不会冲掉该标记
  const cfgAfterFirst = await readVaultConfig();
  assert.equal(cfgAfterFirst.archivedMigrated, true, 'readVaultConfig 必须读出 archivedMigrated === true');
  assert.equal(typeof cfgAfterFirst.migratedAt, 'number', 'readVaultConfig 必须读出 migratedAt 时间戳');
  await writeVaultConfig({ storageMode: 'workspace' });
  const cfgAfterModeChange = await readVaultConfig();
  assert.equal(cfgAfterModeChange.storageMode, 'workspace', 'storageMode 应更新为 workspace');
  assert.equal(cfgAfterModeChange.archivedMigrated, true, '更新 storageMode 绝不能丢失 archivedMigrated 标记');

  // 二次启动调用 migrateArchivedSessionsInternal(ctx, false) 必须立即短路跳过
  const secondRun = await migrateArchivedSessionsInternal(mockCtx, false);
  assert.equal(secondRun.skipped, true, '二次启动必须命中 already-migrated 短路跳过');
  assert.equal(secondRun.reason, 'already-migrated', '跳过原因应为 already-migrated');

  // 7.4 验证前端打包产物 lib/client.js 已修复 Issue #24 选择器污染与内存上限守卫
  const clientCode = await readFile(join(process.cwd(), 'lib', 'client.js'), 'utf8');
  assert.ok(clientCode.includes("[class*='_card'][class*='FileCard']"), 'client.js 必须使用精确的 FileCard 选择器');
  assert.ok(!clientCode.includes("[data-easyrewrite-img-card], [class*='_card'],"), 'client.js 绝不能再包含裸的 [class*=_card] 选择器');
  assert.ok(clientCode.includes('data-composer-card'), 'client.js 必须包含输入框卡片排除保护');
  assert.ok(clientCode.includes('MAX_ATTACHMENT_CACHE_BYTES'), 'client.js 必须包含附件缓存容量上限保护');
  assert.ok(clientCode.includes('revokeTrackedObjectUrls'), 'client.js 必须包含编辑态预览 Blob URL 自动释放保护');

  // 7.5 验证局部切片读取、帧数预算控制与尾部闭合检测（杜绝大文件全量解压 OOM）
  const { readFileSlice, isLastTurnClosedInZstdFile } = __test;
  const budgetDecoded = decompressZstdFrames(concat500, { maxFrames: 3 });
  assert.equal(budgetDecoded.trim().split('\n').length, 3, 'maxFrames: 3 预算控制必须严格只解压前 3 帧即提前终止');

  const closedSessionPath = join(sessionsDir, 'closed-check.jsonl.zstd');
  const openTurnBuf = Buffer.concat([
    zstdCompressSync(Buffer.from(JSON.stringify({ type: 'session', id: 's-1' }) + '\n')),
    zstdCompressSync(Buffer.from(JSON.stringify({ type: 'turn/start', seq: 1 }) + '\n'))
  ]);
  await writeFile(closedSessionPath, openTurnBuf);
  assert.equal(await isLastTurnClosedInZstdFile(closedSessionPath), false, '未闭合回合尾部检测应返回 false');

  const closedTurnBuf = Buffer.concat([
    openTurnBuf,
    zstdCompressSync(Buffer.from(JSON.stringify({ type: 'turn/end', seq: 2 }) + '\n'))
  ]);
  await writeFile(closedSessionPath, closedTurnBuf);
  assert.equal(await isLastTurnClosedInZstdFile(closedSessionPath), true, '已闭合回合尾部检测应返回 true');

  const tailSlice = await readFileSlice(closedSessionPath, 32, true);
  assert.equal(tailSlice.buf.length, 32, 'readFileSlice 尾部切片长度应精确受限于 maxBytes');
  assert.equal(tailSlice.truncated, true, '大文件切片应标记 truncated === true');

  console.log('✓ Issue #23 / #24 / #25 专项回归验证与架构内存安全守卫全部通过');
} finally {
  await rm(mockIssueHome, { recursive: true, force: true }).catch(() => {});
  if (oldHome) process.env.DSH_HOME = oldHome;
  else delete process.env.DSH_HOME;
}

// =========================================================================
// [Test 8] Issue #28 专项回归验证（影子仓储数据零丢失 + 防原位覆盖 + 孤儿自愈 + 前端防误触）
// =========================================================================
console.log('[Test 8] Issue #28 专项回归验证（防回退后原位覆盖 v2 + 孤儿快照自愈 + 并发互斥锁 + 前端防误触）...');
const mockIssue28Home = join(tmpdir(), 'dsh-issue28-test-' + Date.now());
process.env.DSH_HOME = mockIssue28Home;

try {
  const { loadVaultManifest, decompressZstdFrames } = __test;
  await writeVaultConfig({ storageMode: 'global' });

  const sid28 = 'session-issue28-guard';
  const sessDir28 = join(mockIssue28Home, 'sessions', 'ws-28', sid28);
  await mkdir(sessDir28, { recursive: true });
  const zstdPath28 = join(sessDir28, 'session.v4.jsonl.zstd');

  // 8.1 构造 v1（早期 2 轮短对话）并保存快照
  const v1Raw = [
    JSON.stringify({ type: 'session', version: 4, id: sid28 }),
    JSON.stringify({ type: 'turn/start', seq: 0 }),
    JSON.stringify({ type: 'user/message', data: { text: '早期问题 v1' } }),
    JSON.stringify({ type: 'assistant/message', data: { text: '早期回答 v1' } })
  ].join('\n') + '\n';
  await writeFile(zstdPath28, zstdCompressSync(Buffer.from(v1Raw, 'utf8')));
  const s1 = await saveVaultSnapshotInternal(sid28, 'ws-28', '版本 1（早期 2 轮）', 'global', null, { immutable: true });
  assert.ok(s1.ok, 'v1 快照保存应成功');
  assert.equal(s1.manifest.versions.length, 1);

  // 8.2 演进到 v2（模拟用户继续聊了 12 轮长对话，通过原位同步生成 v2）
  const v2Lines = [
    JSON.stringify({ type: 'session', version: 4, id: sid28 })
  ];
  for (let turn = 1; turn <= 12; turn++) {
    v2Lines.push(JSON.stringify({ type: 'turn/start', seq: turn }));
    v2Lines.push(JSON.stringify({ type: 'user/message', data: { text: `第 ${turn} 轮深度讨论问题` } }));
    v2Lines.push(JSON.stringify({ type: 'assistant/message', data: { text: `第 ${turn} 轮长篇详细回答内容_${'A'.repeat(120)}` } }));
  }
  const v2Raw = v2Lines.join('\n') + '\n';
  await writeFile(zstdPath28, zstdCompressSync(Buffer.from(v2Raw, 'utf8')));

  // 模拟 /bubble/vault/list 中的最新活跃状态入库（replaceIfSameSource: true）
  const s2 = await saveVaultSnapshotInternal(sid28, 'ws-28', '版本 2（12 轮完整对话）', 'global', null, { replaceIfSameSource: true });
  assert.ok(s2.ok, 'v2 快照保存应成功');
  assert.equal(s2.manifest.versions.length, 2, '此时应有 v1 和 v2 两个版本');
  assert.equal(s2.manifest.currentVersionIndex, 1, '游标应指向 v2 (index 1)');

  // 8.3 模拟用户触发回退到 v1（Issue #28 事故触发点）
  const mockCtx28 = { get: () => null };
  const restoreToV1 = await restoreVaultSnapshotInternal(mockCtx28, sid28, 'ws-28', 1, 'global');
  assert.ok(restoreToV1.ok, '还原到 v1 应成功');
  assert.equal(restoreToV1.manifest.currentVersionIndex, 0, '还原后游标应指向 v1 (index 0)');
  assert.equal(restoreToV1.manifest.versions.length, 2, '版本总数仍为 2');
  assert.equal(restoreToV1.manifest.versions[0].immutable, true, '还原后 v1 必须标记为 immutable');
  assert.equal(restoreToV1.manifest.versions[1].immutable, true, '还原后 v2 必须强制锁定为 immutable，严禁后续被原位覆盖');

  // 8.4 在处于 v1 时再次触发 /bubble/vault/list 原位同步：
  //     由于全版本判重，v1 内容已在 versions[0] 中，必须直接判定为 unchanged，绝不新建重复版本或覆盖 v2
  const dupCheck = await saveVaultSnapshotInternal(sid28, 'ws-28', '切回 v1 后的列表同步', 'global', null, { replaceIfSameSource: true });
  assert.ok(dupCheck.ok && dupCheck.unchanged, '处于历史版本 v1 时未修改内容，应命中全版本列表判重');
  assert.equal(dupCheck.manifest.versions.length, 2, '判重后版本数保持为 2');

  // 8.5 核心防线测试：用户在回退后的 v1 基础上继续发消息（文件依然比 12 轮的 v2 小，但传入了 replaceIfSameSource: true）
  //     旧版 Bug 会把新内容覆盖写进 v2.zstd 导致 12 轮对话永久丢失；新版必须新建 v3.zstd 且 100% 保护 v2.zstd！
  const v3Raw = v1Raw + JSON.stringify({ type: 'user/message', data: { text: '在 v1 基础上分叉出的新问题 v3' } }) + '\n';
  await writeFile(zstdPath28, zstdCompressSync(Buffer.from(v3Raw, 'utf8')));
  const s3 = await saveVaultSnapshotInternal(sid28, 'ws-28', '从 v1 演进的新分支', 'global', null, { replaceIfSameSource: true });
  assert.ok(s3.ok && s3.newSnapshot, '在 v1 基础上修改后保存应新建独立快照');
  assert.equal(s3.manifest.versions.length, 3, '必须新建 v3，绝不能覆盖 v2（版本总数应为 3）');
  assert.equal(s3.versionNumber, 3, '新建版本号必须为 3');

  // 验证 v2.zstd 物理文件内容 100% 完好无损（包含第 12 轮深度讨论）
  const vaultDir28 = resolveVaultDir(sid28, 'ws-28', 'global');
  const v2SnapshotBuf = await readFile(join(vaultDir28, 'v2.zstd'));
  const v2Decoded = decompressZstdFrames(v2SnapshotBuf);
  assert.equal(v2Decoded, v2Raw, 'v2.zstd 物理快照内容必须与原 12 轮完整对话 100% 一致，零数据丢失！');

  // 验证随时可以从 v2 恢复回全部 12 轮对话
  const restoreBackToV2 = await restoreVaultSnapshotInternal(mockCtx28, sid28, 'ws-28', 2, 'global');
  assert.ok(restoreBackToV2.ok, '重新切回 v2 应成功');
  const currentDiskDecoded = decompressZstdFrames(await readFile(zstdPath28));
  assert.equal(currentDiskDecoded, v2Raw, '切回 v2 后会话文件应完整恢复全部 12 轮对话');

  // 8.6 验证 manifest.json 损坏或被清空时的物理孤儿快照自愈恢复
  await writeFile(join(vaultDir28, 'manifest.json'), '{"versions": [BROKEN_JSON', 'utf8');
  const healedManifest = await loadVaultManifest(vaultDir28, sid28);
  assert.equal(healedManifest.versions.length, 3, 'manifest.json 损坏时必须自动从磁盘扫描恢复全部 3 个 .zstd 快照');
  assert.deepEqual(
    healedManifest.versions.map(v => v.versionNumber),
    [1, 2, 3],
    '自愈恢复的版本号序列必须完整为 [1, 2, 3]'
  );

  // 8.7 验证前端 pager.js 安全防护（移除全局方向键监听、接入开关与确认胶囊）
  const pagerSrc = await readFile(join(process.cwd(), 'src', 'features', 'history', 'pager.js'), 'utf8');
  assert.ok(!pagerSrc.includes('ArrowLeft') && !pagerSrc.includes('ArrowRight'), 'pager.js 必须彻底移除全局 ArrowLeft/ArrowRight 键盘监听');
  assert.ok(pagerSrc.includes('pagerEnabled()'), 'pager.js 必须接入 pagerEnabled() 设置开关');
  assert.ok(pagerSrc.includes('pagerConfirmEnabled()'), 'pager.js 必须接入 pagerConfirmEnabled() 确认胶囊开关');
  assert.ok(pagerSrc.includes('pager-confirm-capsule'), 'pager.js 必须包含版本切换确认胶囊 UI');
  assert.ok(pagerSrc.includes('pager-historical-badge'), 'pager.js 必须包含处于历史旧版本时的醒目提醒与回到最新按钮');

  // 8.8 验证 Issue #28 @SimHapQ 场景（goToVersion 绝不删主会话 + 迁移阶段 B 保护侧栏活跃原生 Fork）
  const goToVerStart = pagerSrc.indexOf('function goToVersion(');
  const goToVerEnd = pagerSrc.indexOf('function isFirstUserMessage(');
  assert.ok(goToVerStart >= 0 && goToVerEnd > goToVerStart);
  const goToVerBody = pagerSrc.slice(goToVerStart, goToVerEnd);
  assert.ok(!goToVerBody.includes('/bubble/vault/retire-session'), 'goToVersion 绝不能调用 retire-session 接口将主会话或兄弟会话从侧栏删除');

  // 验证迁移阶段 B 不误删侧栏中均为活跃状态的原生 Fork 分支
  const forkProtHome = join(mockIssue28Home, 'fork-prot');
  process.env.DSH_HOME = forkProtHome;
  await mkdir(join(forkProtHome, 'storages'), { recursive: true });
  const fpSessA = join(forkProtHome, 'sessions', 'ws-fp', 'sess-fp-main');
  const fpSessB = join(forkProtHome, 'sessions', 'ws-fp', 'sess-fp-branch');
  await mkdir(fpSessA, { recursive: true });
  await mkdir(fpSessB, { recursive: true });
  await writeFile(join(fpSessA, 'session.v4.jsonl.zstd'), zstdCompressSync(Buffer.from(JSON.stringify({ type: 'session', id: 'sess-fp-main' }) + '\n' + JSON.stringify({ type: 'user/message', data: { text: 'main' } }) + '\n')));
  await writeFile(join(fpSessB, 'session.v4.jsonl.zstd'), zstdCompressSync(Buffer.from(JSON.stringify({ type: 'session', id: 'sess-fp-branch', parentSession: 'sess-fp-main' }) + '\n' + JSON.stringify({ type: 'user/message', data: { text: 'fork' } }) + '\n')));
  await writeFile(join(forkProtHome, 'storages', 'workspace.json'), JSON.stringify({ global: { archivedSessionIds: [] }, tables: { workspaces: { 'ws-fp': { sessionIds: ['sess-fp-main', 'sess-fp-branch'] } } } }));
  await migrateArchivedSessionsInternal(mockCtx28, true);
  const wsAfterFp = JSON.parse(await readFile(join(forkProtHome, 'storages', 'workspace.json'), 'utf8'));
  assert.deepEqual(wsAfterFp.tables.workspaces['ws-fp'].sessionIds, ['sess-fp-main', 'sess-fp-branch'], '迁移阶段 B 必须完整保留侧边栏中均处于活跃状态的原生 Fork 分支');

  // 8.9 验证 /bubble/vault/list 真实路由并发请求下互斥锁不死锁且自动同步不覆写游标
  process.env.DSH_HOME = mockIssue28Home;
  const routesMap28 = new Map();
  const regMockCtx = {
    get: () => null,
    webServer: {
      register(r) {
        routesMap28.set(r.path, r.handler);
        return () => routesMap28.delete(r.path);
      }
    }
  };
  const { apply: hostApply } = await import('../lib/index.js');
  const hostDispose28 = hostApply(regMockCtx);
  const listHandler = routesMap28.get('/bubble/vault/list');
  assert.equal(typeof listHandler, 'function', '应注册 /bubble/vault/list 路由');

  const v4Raw = v2Raw + JSON.stringify({ type: 'user/message', data: { text: '并发新增内容 v3/v4' } }) + '\n';
  await writeFile(zstdPath28, zstdCompressSync(Buffer.from(v4Raw, 'utf8')));

  const { Readable } = await import('node:stream');
  const callVaultList = (sid) => new Promise((resolve, reject) => {
    const bodyBuf = Buffer.from(JSON.stringify({ sessionId: sid, workspaceId: 'ws-28', storageMode: 'global' }), 'utf8');
    const req = Readable.from([bodyBuf]);
    req.method = 'POST';
    req.headers = {
      host: '127.0.0.1:3000',
      origin: 'http://127.0.0.1:3000',
      'content-type': 'application/json',
      'content-length': String(bodyBuf.length)
    };
    let status = 200;
    const res = {
      writeHead(code) { status = code; },
      end(chunk) {
        try { resolve({ status, body: JSON.parse(String(chunk || '{}')) }); }
        catch (e) { reject(e); }
      }
    };
    listHandler(req, res).catch(reject);
  });

  // 并发触发 /bubble/vault/list 与 saveVaultSnapshotInternal，验证互斥锁串行生效、无死锁、manifest 完整
  const [listResA, listResB, concurrentSave] = await Promise.all([
    callVaultList(sid28),
    callVaultList(sid28),
    saveVaultSnapshotInternal(sid28, 'ws-28', null, 'global', null, { replaceIfSameSource: true })
  ]);
  assert.equal(listResA.status, 200);
  assert.equal(listResB.status, 200);
  assert.ok(listResA.body.ok && listResB.body.ok && concurrentSave.ok, '并发 /bubble/vault/list 与 save 均应成功且不死锁');
  const finalMan28 = await loadVaultManifest(vaultDir28, sid28, 'ws-28');
  assert.ok(finalMan28.versions.length >= 4, `并发新增内容同步后应正确演进出 v4（实际 ${finalMan28.versions.length}）`);
  hostDispose28();

  console.log('✓ Issue #28 专项回归验证全部通过（零数据丢失 + 防覆盖 + 孤儿自愈 + 前端防误触 + 并发互斥锁）');
} finally {
  await rm(mockIssue28Home, { recursive: true, force: true }).catch(() => {});
  if (oldHome) process.env.DSH_HOME = oldHome;
  else delete process.env.DSH_HOME;
}

console.log('\n======================================');
console.log('✔ 所有 EasyRewrite 影子仓储（Vault）与智能归档迁移专项测试全部通过！');
console.log('======================================\n');
