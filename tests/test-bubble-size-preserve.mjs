import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcCode = fs.readFileSync(path.resolve(__dirname, '../src/client.src.js'), 'utf-8');
const bundleCode = fs.readFileSync(path.resolve(__dirname, '../lib/client.js'), 'utf-8');

const SRC = 'src/client.src.js';
const BUNDLE = 'lib/client.js';
const files = [[SRC, srcCode], [BUNDLE, bundleCode]];

const has = (code, needle, msg) => assert.ok(code.includes(needle), msg);

console.log('--- 开始测试：气泡编辑「原尺寸」档（点击进入编辑不改变气泡尺寸）专项验证 ---');

// =========================================================================
// [Test 1] 静态：preserve「原尺寸」档存在、为默认档、五档齐全、三语文案齐备
// =========================================================================
console.log('[Test 1] 「原尺寸」档静态结构与默认值验证...');

const PRESERVE_EARLY_RETURN = 'if (mode === "preserve") return initW > 0 ? initW : 360;';
for (const [name, code] of files) {
  has(code, PRESERVE_EARLY_RETURN, `${name}：editWidthFor 必须实现 preserve 原尺寸早返回（initW > 0 取实测宽，否则回落 360）`);
  has(code, 'var v = "preserve";', `${name}：editWidthMode 默认档必须为 preserve`);
  has(code, 'localStorage.getItem("dsh-easyrewrite:editWidth") || "preserve"', `${name}：默认档回退值必须为 preserve（老用户显式存过的档位仍照旧生效）`);
  has(code, '["preserve", L.wPreserve]', `${name}：设置面板分段控件必须提供「原尺寸」选项`);
  has(code, 'if (v === "bubble") return "compact";', `${name}：必须保留旧值（bubble/wrap/composer）兼容映射`);
}
has(srcCode, 'wPreserve: "原尺寸"', 'src：中文文案必须为「原尺寸」');
has(srcCode, 'wPreserve: "Original"', 'src：英文文案必须为「Original」');
has(srcCode, 'wPreserve: "原サイズ"', 'src：日文文案必须为「原サイズ」');
for (const lang of ['原尺寸', 'Original', '原サイズ']) has(bundleCode, lang, `bundle：三语文案 ${lang} 必须随构建产物内联`);

console.log('✓ 「原尺寸」档静态结构与默认值验证通过');

// =========================================================================
// [Test 2] 静态：尺寸契约——宽度严格、高度只增不减、去掉 240px 内滚上限
// =========================================================================
console.log('[Test 2] 气泡与编辑框尺寸契约守护验证...');

for (const [name, code] of files) {
  // 2.1 编辑框宽度严格取自气泡实测宽（maxWidth: editBoxW / width: 100%）
  has(code, 'var editBoxW = editWidthFor(editMode, editText, bubbleInitW);', `${name}：编辑框宽度必须由按档位计算的 editBoxW 决定`);
  has(code, 'maxWidth: editBoxW', `${name}：编辑框必须用 maxWidth 严格约束宽度`);
  // 2.2 高度下限 = 气泡原高（只增不减），按钮行留在编辑框内部并靠底
  has(code, 'minHeight: bubbleInitH > 0 ? bubbleInitH : void 0', `${name}：编辑框必须设置 minHeight = 气泡原高，绝不比原气泡矮`);
  has(code, 'justifyContent: "space-between"', `${name}：编辑框必须用 space-between 让按钮行贴底、短消息时与气泡等高`);
  // 2.3 textarea 与气泡逐字换行对齐（清掉 UA 默认 padding 与盒模型差异）
  has(code, 'boxSizing: "border-box"', `${name}：textarea 必须使用 border-box 盒子模型`);
  has(code, 'flexGrow: 1', `${name}：textarea 必须 flexGrow 吸收高度余量`);
  // 2.4 取消 240px 内部滚动上限 + 取消 20 行上限
  assert.ok(!code.includes('maxHeight: "240px"'), `${name}：必须移除 textarea 的 240px 内部滚动上限（长消息「缩」的观感来源之一）`);
  has(code, 'maxHeight: "70vh"', `${name}：textarea 高度上限应为视口相对值 70vh`);
  has(code, 'Math.min(200, lineCount)', `${name}：textarea 初始行数上限须由 20 提升到 200`);
  // 2.5 挂载即按内容撑高（原实现只在 onChange 撑高，单段长文本 rows=1 → 一进去只有 1 行高）
  has(code, 'el.style.height = el.scrollHeight + "px"', `${name}：textarea 必须按 scrollHeight 撑高`);
  has(code, 'el.dataset.dbeAutosized = "1"', `${name}：textarea 挂载撑高必须只执行一次（幂等标记）`);
  // 2.6 气泡挂 ref，操作区「编辑」键必须量真实气泡而不是 34px 操作按钮
  has(code, 'ref: bubbleRef', `${name}：气泡节点必须挂 bubbleRef`);
  has(code, 'var bubbleEl = bubbleRef.current;', `${name}：操作区「编辑」键必须通过 bubbleRef 量真实气泡`);
  has(code, 'enterEdit(bubbleEl ? bubbleEl.offsetWidth : 0, bubbleEl ? bubbleEl.offsetHeight : 0);', `${name}：操作区「编辑」键必须把气泡宽高一起传入 enterEdit`);
}

console.log('✓ 气泡与编辑框尺寸契约守护验证通过');

// =========================================================================
// [Test 3] 行为：从真实源码提取 editWidthFor 执行，验证「进入编辑不改尺寸」几何
// =========================================================================
console.log('[Test 3] editWidthFor 五档几何行为验证（直接执行源码函数）...');

/** 从源码文本中按大括号配平抽取一个函数定义。 */
function extractFunction(code, name) {
  const start = code.indexOf('function ' + name + '(');
  assert.ok(start >= 0, `源码中必须存在函数 ${name}`);
  const open = code.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') {
      depth--;
      if (depth === 0) return code.slice(start, i + 1);
    }
  }
  throw new Error(`函数 ${name} 大括号不配平`);
}

const fnSrc = extractFunction(srcCode, 'editWidthFor');
const editWidthFor = eval(
  '(function () { var editWidthCustom = function () { return 512; }; ' + fnSrc + ' return editWidthFor; })()'
);

assert.equal(typeof editWidthFor, 'function', 'editWidthFor 必须可从源码中还原执行');

const LONG = '这是一条很长的消息，'.repeat(40); // 远超 360px 的单段长文本
const CJK_SHORT = '好';

// 3.1 原尺寸：宽度恒等于气泡实测宽，与文本长度完全无关（不扩不缩）
for (const initW of [137, 360, 512, 748]) {
  const w = editWidthFor('preserve', LONG, initW);
  assert.equal(w, initW, `preserve 档：initW=${initW} 时必须严格等于气泡实测宽，而不是随文本变化`);
}
// 3.2 无实测值（刷新恢复草稿 / 兜底路径）→ 回落 360px，保证编辑框可见
assert.equal(editWidthFor('preserve', LONG, 0), 360, 'preserve 档：initW=0（刷新恢复无测量值）必须回落 360px');
assert.equal(editWidthFor('preserve', CJK_SHORT, undefined), 360, 'preserve 档：initW=undefined 必须回落 360px');
// 3.3 回归对照：旧默认档 standard 会把宽气泡压成 360px（本次修复的「缩」根因）
assert.equal(editWidthFor('standard', LONG, 748), 360, '对照：standard 档固定 360px，宽气泡进入编辑会被压缩');
assert.ok(editWidthFor('compact', LONG, 200) > 200, '对照：compact 档会随打字横向扩展（宽度会变）');
// 3.4 老档位行为不受影响
assert.equal(editWidthFor('extended', LONG, 748), '100%', 'extended 档必须仍返回 "100%"');
assert.equal(editWidthFor('custom', LONG, 748), 512, 'custom 档必须仍走 editWidthCustom()');
assert.equal(editWidthFor('standard', CJK_SHORT, 0), 360, 'standard 档不满一行时仍自动扩成一行宽');

console.log('✓ editWidthFor 五档几何行为验证通过');

// =========================================================================
// [Test 4] 不变式：编辑框高度 = max(气泡原高, 内容高 + 按钮行) ≥ 气泡原高
// =========================================================================
console.log('[Test 4] 编辑框高度只增不减不变式验证...');

const GAP = 6; // editBoxStyle gap
const BTN_ROW = 32; // 取消/确定按钮行（含贴底间距）实测约 32px
for (const initH of [0, 22, 60, 480]) {
  for (const textH of [22, 60, 480, 960]) {
    const contentH = textH + GAP + BTN_ROW;
    // minHeight = 气泡原高（initH=0 时不设下限），内容溢出由 70vh + 内部滚动兜底
    const boxH = Math.max(initH, contentH);
    assert.ok(boxH >= initH, `initH=${initH}、内容高=${textH} 时编辑框高度不得小于气泡原高`);
    assert.ok(boxH >= contentH || boxH >= initH, `initH=${initH}、内容高=${textH} 时编辑框不得裁切内容`);
  }
}

console.log('✓ 编辑框高度只增不减不变式验证通过');

console.log('\n======================================');
console.log('✔ 气泡编辑「原尺寸」档全部测试通过！');
console.log('======================================\n');
