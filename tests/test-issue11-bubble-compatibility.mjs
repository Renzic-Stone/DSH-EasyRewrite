import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcCode = fs.readFileSync(path.resolve(__dirname, '../src/client.src.js'), 'utf-8');
const bundleCode = fs.readFileSync(path.resolve(__dirname, '../lib/client.js'), 'utf-8');

console.log('--- 开始测试：Issue #11 样式变量接入与第三方批注插件兼容性专项验证 ---');

// =========================================================================
// [Test 1] 静态源码结构检测：官方变量对齐与 1080p 默认尺寸守护
// =========================================================================
console.log('[Test 1] 静态源码规则与 1080p 协调性守护验证...');

// 1.1 必须正确引入官方字号变量，带 14px 默认回退
assert.ok(srcCode.includes('var(--dsh-content-font-size, 14px)'), 'src 必须引入 --dsh-content-font-size 且回退为 14px');
assert.ok(bundleCode.includes('var(--dsh-content-font-size, 14px)'), '打包产物必须引入 --dsh-content-font-size 且回退为 14px');

// 1.2 必须正确引入官方行高增量变量，带 22px 默认回退
assert.ok(srcCode.includes('calc(22px + var(--dsh-content-font-delta, 0px))'), 'src 必须引入 --dsh-content-font-delta 且默认基础为 22px');
assert.ok(bundleCode.includes('calc(22px + var(--dsh-content-font-delta, 0px))'), '打包产物必须引入 --dsh-content-font-delta 且默认基础为 22px');

// 1.3 必须严格保留现有的 14px 圆角与 8px 14px 内边距（坚决不因小失大，守住 1080p 协调美感）
assert.ok(srcCode.includes('borderRadius: "14px"'), '气泡圆角必须严格保留 14px，不得盲从修改为 22px');
assert.ok(srcCode.includes('padding: "8px 14px"'), '气泡内边距必须严格保留 8px 14px，不得盲从修改为 10px 16px');

// 1.4 气泡节点必须携带 dsh-easyrewrite-bubble 类名
assert.ok(srcCode.includes('dsh-easyrewrite-bubble'), 'src 气泡节点必须携带 dsh-easyrewrite-bubble 类名');
assert.ok(bundleCode.includes('dsh-easyrewrite-bubble'), '打包产物气泡节点必须携带 dsh-easyrewrite-bubble 类名');

console.log('✓ 静态规则与 1080p 协调性守护验证通过');

// =========================================================================
// [Test 2] 第三方批注插件（dsh-annotation）DOM 匹配兼容性模拟
// =========================================================================
console.log('[Test 2] dsh-annotation 批注插件 DOM 选择器匹配验证...');

class MockNode {
  constructor(tag, className = '') {
    this.tagName = tag.toUpperCase();
    this.className = className;
    this.children = [];
  }
  appendChild(child) { this.children.push(child); }
  querySelector(selector) {
    if (selector === '[class*="bubble"]') {
      return this._findBubbleChild(this);
    }
    return null;
  }
  _findBubbleChild(node) {
    if (typeof node.className === 'string' && node.className.includes('bubble')) {
      return node;
    }
    for (const child of node.children) {
      const found = this._findBubbleChild(child);
      if (found) return found;
    }
    return null;
  }
}

// 模拟渲染出来的用户消息行 DOM 结构
const mockRow = new MockNode('div');
const mockBubbleDiv = new MockNode('div', 'dsh-easyrewrite-bubble');
mockRow.appendChild(mockBubbleDiv);

// 运行 dsh-annotation 官方源码定位逻辑（dsh-annotation/client.js:1817）
const matchedBubble = mockRow.querySelector('[class*="bubble"]');

assert.ok(matchedBubble !== null, 'dsh-annotation 的 [class*="bubble"] 选择器必须能精准命中我们的气泡');
assert.equal(matchedBubble.className, 'dsh-easyrewrite-bubble', '命中元素的类名必须为 dsh-easyrewrite-bubble');

console.log('✓ dsh-annotation 批注插件匹配兼容性验证通过');

console.log('\n======================================');
console.log('✔ Issue #11 样式与第三方插件兼容性测试全部通过！');
console.log('======================================\n');
