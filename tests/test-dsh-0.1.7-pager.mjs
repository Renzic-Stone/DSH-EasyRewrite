import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.resolve(__dirname, '../lib/client.js');
const bundleCode = fs.readFileSync(bundlePath, 'utf-8');

console.log('--- 开始测试：DSH 0.1.7 翻页器与跨版本会话切换专项测试 ---');

// =========================================================================
// [Test 1] 静态特征与版本上限检测
// =========================================================================
console.log('[Test 1] 静态特征与版本常量检测...');
assert.ok(bundleCode.includes('0.1.7-rc.2'), '构建产物必须包含 0.1.7-rc.2 验证上限');
assert.ok(bundleCode.includes('invokeOpenSession'), '构建产物必须包含 invokeOpenSession 函数');
assert.ok(!bundleCode.includes('openSession: function (id) { ctx.sessions.open(id); }'), '构建产物不得包含裸调 ctx.sessions.open 的注入');
console.log('✓ 静态检测全部通过');

// =========================================================================
// [Test 2] 模拟 DSH 0.1.7 运行环境执行测试
// =========================================================================
console.log('[Test 2] 模拟 DSH 0.1.7 运行环境与翻页器注入验证...');

let loadedPlugin = null;
globalThis.window = {
  __ModuleLoader__: {
    load: function (pluginDef) {
      loadedPlugin = pluginDef;
    }
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    length: 0,
    key: () => null
  },
  document: {
    dispatchEvent: () => {},
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ setAttribute: () => {}, textContent: "", style: {}, dataset: {}, remove: () => {} }),
    head: { appendChild: () => {} }
  }
};
globalThis.localStorage = globalThis.window.localStorage;
globalThis.document = globalThis.window.document;
globalThis.CustomEvent = class CustomEvent {};

// 执行 bundle 代码
eval(bundleCode);
assert.ok(loadedPlugin, 'bundle 必须成功注册到 __ModuleLoader__');

const factory = loadedPlugin.factory;
const fakeRequire = (mod) => {
  if (mod === 'react') {
    return {
      createElement: () => ({}),
      useState: (init) => [init, () => {}],
      useEffect: () => {},
      useRef: () => ({ current: null }),
      useCallback: (fn) => fn,
      useMemo: (fn) => fn()
    };
  }
  if (mod === '@deepseek-ai/dsh-client-ui-primitives') {
    return {};
  }
  return {};
};

const clientModule = factory(fakeRequire);
assert.ok(typeof clientModule.apply === 'function', 'client 模块必须导出 apply 函数');

// 模拟 DSH 0.1.7 的 ctx
let openedSessionByUiWorkspace = null;
const mockUiWorkspace = {
  openSession: (id) => {
    openedSessionByUiWorkspace = id;
  }
};

const registeredSlots = new Map();
const mockCtx017 = {
  // 0.1.7 中 ctx.sessions 仅为数据层，完全没有 open 方法
  sessions: {
    list: {
      getSnapshot: () => ({
        byId: {
          'sess-old': { id: 'sess-old', retainedBy: { mainView: 0 } },
          'sess-active': { id: 'sess-active', retainedBy: { mainView: 1 } }
        }
      })
    }
  },
  workspaces: {
    archiveSession: async (id) => true
  },
  slots: {
    inject: (slotName, fn) => {
      const result = fn();
      return () => {};
    },
    register: (desc, comp) => {
      registeredSlots.set(desc.name, desc);
      return desc;
    }
  },
  effect: (fn) => fn(), locale: {
    register: () => {}
  },
  get: (serviceName) => {
    if (serviceName === 'uiWorkspace') return mockUiWorkspace;
    return null;
  }
};

// 执行 0.1.7 模式下的 apply
clientModule.apply(mockCtx017);

// 验证 assistant-actions (翻页器) 注册项
const pagerSlot = registeredSlots.get('conversation.chat.assistant-actions');
assert.ok(pagerSlot, '翻页器插槽必须已注册');
assert.ok(typeof pagerSlot.inject === 'function', '翻页器插槽必须提供 inject 函数');

const pagerProps = pagerSlot.inject();
assert.ok(typeof pagerProps.openSession === 'function', '翻页器必须提供 openSession 接口');

// 执行翻页器的 openSession！
pagerProps.openSession('target-sess-017');
assert.equal(openedSessionByUiWorkspace, 'target-sess-017', '翻页器必须成功通过 uiWorkspace 打开会话');

// 验证 0.1.7 下 currentSessionId 能准确返回主视图激活会话
const activeSessionId = pagerProps.currentSessionId();
assert.equal(activeSessionId, 'sess-active', '0.1.7 下 currentSessionId 必须通过 retainedBy.mainView 获取到 sess-active');

console.log('✓ DSH 0.1.7 运行环境与翻页器测试通过');

// =========================================================================
// [Test 3] 模拟 DSH ≤0.1.5 老版本运行环境
// =========================================================================
console.log('[Test 3] 模拟 DSH ≤0.1.5 老版本兼容性验证...');

let openedSessionByLegacySessions = null;
const registeredSlotsLegacy = new Map();
const mockCtxLegacy = {
  // 老版本中没有 uiWorkspace，只有 ctx.sessions.open
  sessions: {
    open: (id) => {
      openedSessionByLegacySessions = id;
    },
    list: {
      getSnapshot: () => ({
        current: 'sess-legacy-current'
      })
    }
  },
  workspaces: {},
  slots: {
    inject: (slotName, fn) => {
      fn();
      return () => {};
    },
    register: (desc) => {
      registeredSlotsLegacy.set(desc.name, desc);
      return desc;
    }
  },
  effect: (fn) => fn(), locale: {
    register: () => {}
  },
  get: () => null
};

clientModule.apply(mockCtxLegacy);
const legacyPager = registeredSlotsLegacy.get('conversation.chat.assistant-actions').inject();
legacyPager.openSession('target-sess-legacy');
assert.equal(openedSessionByLegacySessions, 'target-sess-legacy', '老版本下必须成功通过 ctx.sessions.open 打开会话');
assert.equal(legacyPager.currentSessionId(), 'sess-legacy-current', '老版本下必须通过 s.current 获取会话 ID');

console.log('✓ DSH ≤0.1.5 老版本运行环境测试通过');

console.log('\n======================================');
console.log('✔ 所有 DSH 0.1.7 翻页器与跨版本会话测试全部通过！');
console.log('======================================');


