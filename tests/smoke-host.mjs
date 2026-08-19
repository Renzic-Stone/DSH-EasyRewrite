/**
 * smoke-host.mjs — host 核心逻辑冒烟测试（无依赖，node tests/smoke-host.mjs 运行）。
 * 覆盖：边界定位（turn/end 查找）的各类事件序列。
 */
import { __test } from '../lib/index.js';
import assert from 'node:assert/strict';

const { findTurnEndBefore } = __test;

function ev(seq, type) { return { seq, type }; }

// 1) 正常：目标前有闭合回合
{
  const events = [
    ev(0, 'session'), ev(1, 'permission/preset'), ev(2, 'turn/start'), ev(3, 'user/message'),
    ev(4, 'assistant/message'), ev(5, 'turn/end'), ev(6, 'turn/start'), ev(7, 'user/message'),
    ev(8, 'assistant/message'), ev(9, 'turn/end'), ev(10, 'turn/start'), ev(11, 'user/message'),
  ];
  const b = findTurnEndBefore(events, 11); // 目标=第 11 个事件（user/message）
  assert.equal(b, 9, '应找到目标前最近的 turn/end(9)');
  console.log('✓ 闭合回合定位');
}

// 2) 目标在未闭合回合内（前面无 turn/end）
{
  const events = [
    ev(0, 'session'), ev(1, 'turn/start'), ev(2, 'user/message'), ev(3, 'assistant/message'),
    ev(4, 'turn/start'), ev(5, 'user/message'),
  ];
  const b = findTurnEndBefore(events, 5);
  assert.equal(b, -1, '无闭合回合应返回 -1');
  console.log('✓ 未闭合回合返回 -1');
}

// 3) 目标前有多个回合（取最近）
{
  const events = [
    ev(0, 'session'), ev(1, 'turn/start'), ev(2, 'user/message'), ev(3, 'turn/end'),
    ev(4, 'turn/start'), ev(5, 'user/message'), ev(6, 'turn/end'), ev(7, 'turn/start'), ev(8, 'user/message'),
  ];
  const b = findTurnEndBefore(events, 8);
  assert.equal(b, 6, '应取最近的 turn/end(6)');
  console.log('✓ 最近回合定位');
}

// 4) 目标前无 turn/end 但有空转事件（首个回合前）
{
  const events = [ev(0, 'session'), ev(1, 'user/message')];
  const b = findTurnEndBefore(events, 1);
  assert.equal(b, -1, '首个消息前无边界');
  console.log('✓ 首消息无边界');
}

// 5) 目标不存在（-1 防御）
{
  const events = [ev(0, 'session'), ev(1, 'user/message')];
  const b = findTurnEndBefore(events, -1);
  assert.equal(b, -1, '无效 index 返回 -1');
  console.log('✓ 无效 index 防御');
}

console.log('\nAll smoke tests passed ✔');

// 6) resolveBoundary：截断会话首条消息（新会话从 turn/start 开始，目标后回合已闭合）→ no-boundary（M10 语义）
{
  const ctx = { sessions: { get: () => ({ events: [
    { seq: 0, type: 'session' }, { seq: 1, type: 'turn/start' }, { seq: 2, type: 'user/message' },
    { seq: 3, type: 'assistant/message' }, { seq: 4, type: 'turn/end' }
  ] }) } };
  const r = __test.resolveBoundary(ctx, 'session-x', 2); // 截断后第一条 user
  assert.equal(r.code, 'no-boundary', '截断会话首条消息应报 no-boundary（而非 turn-open）');
  console.log('✓ 截断会话首条消息 → no-boundary');
}

// 7) resolveBoundary：目标回合未闭合（目标后无 turn/end）→ turn-open
{
  const ctx = { sessions: { get: () => ({ events: [
    { seq: 0, type: 'session' }, { seq: 1, type: 'turn/start' }, { seq: 2, type: 'user/message' },
    { seq: 3, type: 'assistant/message' }  // 无 turn/end（回合进行中）
  ] }) } };
  const r = __test.resolveBoundary(ctx, 'session-y', 2);
  assert.equal(r.code, 'turn-open', '未闭合回合应报 turn-open');
  console.log('✓ 未闭合回合 → turn-open');
}

// 8) resolveBoundary：首回合已闭合但目标为首回合消息 → no-boundary（M10 修复：不误报 turn-open）
{
  const ctx = { sessions: { get: () => ({ events: [
    { seq: 0, type: 'session' }, { seq: 1, type: 'turn/start' }, { seq: 2, type: 'user/message' },
    { seq: 3, type: 'assistant/message' }, { seq: 4, type: 'turn/end' },
    { seq: 5, type: 'turn/start' }, { seq: 6, type: 'user/message' }
  ] }) } };
  const r = __test.resolveBoundary(ctx, 'session-z', 2); // 首回合 user，回合已闭合
  assert.equal(r.code, 'no-boundary', '首回合已闭合应报 no-boundary（M10）');
  console.log('✓ 首回合已闭合 → no-boundary（非 turn-open）');
}

// 9) resolveBoundary：目标在闭合回合 2 内（前有回合 1 边界）→ 正常返回边界
{
  const ctx = { sessions: { get: () => ({ events: [
    { seq: 0, type: 'session' }, { seq: 1, type: 'turn/start' }, { seq: 2, type: 'user/message' },
    { seq: 3, type: 'assistant/message' }, { seq: 4, type: 'turn/end' },
    { seq: 5, type: 'turn/start' }, { seq: 6, type: 'user/message' }, { seq: 7, type: 'assistant/message' },
    { seq: 8, type: 'turn/end' }, { seq: 9, type: 'turn/start' }, { seq: 10, type: 'user/message' }
  ] }) } };
  const r = __test.resolveBoundary(ctx, 'session-w', 10);
  assert.equal(r.boundary, 8, '边界应为最近的 turn/end(8)');
  console.log('✓ 闭合回合内目标 → 边界正常');
}

// 10) resolveBoundary：会话不存在 → session-not-found
{
  const r = __test.resolveBoundary({ sessions: { get: () => undefined } }, 'session-nope', 1);
  assert.equal(r.code, 'session-not-found', '未知会话应 404');
  console.log('✓ 未知会话 → session-not-found');
}
