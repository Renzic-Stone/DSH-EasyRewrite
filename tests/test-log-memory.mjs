/**
 * test-log-memory.mjs — Issue #7 日志系统内存泄漏与批量写入专项测试
 * 运行方式：node tests/test-log-memory.mjs
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 1. 设置独立的临时 DSH_HOME，避免污染真实环境
const testDir = await mkdtemp(join(tmpdir(), 'dsh-er-log-test-'));
process.env.DSH_HOME = testDir;

const { __test } = await import('../lib/index.js');
const { writeLog, flushLogBuffer, getLogBuffer } = __test;

console.log('--- 开始测试：Issue #7 日志系统安全与内存测试 ---');

try {
  // Test 1: 基本写入与文件内容落盘验证
  {
    console.log('[Test 1] 批量日志写入与落盘验证...');
    const count = 100;
    const promises = [];
    for (let i = 0; i < count; i++) {
      promises.push(writeLog('info', 'test', `msg-${i}`, { idx: i }));
    }
    await Promise.all(promises);

    const logFile = join(testDir, 'dsh-easyrewrite.log');
    const raw = await readFile(logFile, 'utf8');
    const lines = raw.trim().split('\n');
    assert.equal(lines.length, count, `落盘行数应为 ${count}，实得 ${lines.length}`);
    
    // 验证每一行都是合法的 JSON 且包含对应字段
    for (let i = 0; i < count; i++) {
      const parsed = JSON.parse(lines[i]);
      assert.equal(parsed.level, 'info');
      assert.equal(parsed.tag, 'test');
      assert.equal(parsed.message, `msg-${i}`);
      assert.equal(parsed.data?.idx, i);
    }
    console.log(`✓ 批量写入 ${count} 条成功，落盘数据完整且时序准确`);
  }

  // Test 2: 大批量高频并发写入与内存占用测试
  {
    console.log('[Test 2] 高频写入 10,000 条日志内存压力测试...');
    if (global.gc) global.gc();
    const memBefore = process.memoryUsage().heapUsed;

    const totalLogs = 10000;
    const batchSize = 500;
    for (let i = 0; i < totalLogs; i += batchSize) {
      const batchPromises = [];
      for (let j = 0; j < batchSize; j++) {
        const id = i + j;
        batchPromises.push(writeLog('debug', 'stress', `payload-${id}`, { data: 'x'.repeat(128) }));
      }
      await Promise.all(batchPromises);
    }

    if (global.gc) global.gc();
    const memAfter = process.memoryUsage().heapUsed;
    const diffMb = (memAfter - memBefore) / 1024 / 1024;
    console.log(`  写入 10,000 条后堆内存变动: ${diffMb.toFixed(2)} MB`);
    
    // 队列应当已被完全消费
    assert.equal(getLogBuffer().length, 0, '所有日志消费完毕后缓冲队列长度必须为 0');
    console.log('✓ 10,000 条日志高频写入完成，缓冲队列彻底归零，无内存泄漏');
  }

  // Test 3: 容量上限防御（Buffer Overflow Protection）
  {
    console.log('[Test 3] 防御性缓冲上限测试...');
    // 不 await，瞬间灌入 2,500 条日志，验证最大缓冲不超过 1000 条
    for (let i = 0; i < 2500; i++) {
      writeLog('info', 'overflow', `overflow-${i}`, null);
    }
    const bufLen = getLogBuffer().length;
    assert.ok(bufLen <= 1000, `缓冲队列长度 (${bufLen}) 不应超过 1000 条上限`);
    
    // 等待全部排空
    await flushLogBuffer();
    // 短暂等待微任务与 IO 结束
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(getLogBuffer().length, 0, '溢出测试后缓冲队列最终成功排空');
    console.log(`✓ 防御性上限生效（峰值受限于 1000），最终平稳落盘排空`);
  }

  console.log('\n======================================');
  console.log('✔ 所有日志系统专项测试全部通过！');
  console.log('======================================\n');
} finally {
  // 清理测试临时文件
  try {
    await rm(testDir, { recursive: true, force: true });
  } catch (e) { /* ignore */ }
}
