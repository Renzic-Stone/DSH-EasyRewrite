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
