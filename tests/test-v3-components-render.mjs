/**
 * test-v3-components-render.mjs — 验证 v3.0.0 全部 Slot 组件浅渲染无 ReferenceError / 未定义变量
 */
import assert from "node:assert/strict";

const React = {
  useState: (init) => [typeof init === "function" ? init() : init, () => {}],
  useEffect: (fn) => {},
  useLayoutEffect: (fn) => {},
  useRef: (init) => ({ current: init }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: "Fragment"
};

globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  document: {
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, dataset: {} }),
    head: { appendChild: () => {} }
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    key: () => null,
    length: 0
  },
  location: { search: "" },
  getComputedStyle: () => ({ width: "100px", height: "20px" })
};
globalThis.document = globalThis.window.document;
globalThis.localStorage = globalThis.window.localStorage;
globalThis.location = globalThis.window.location;

let loaded = null;
globalThis.window.__ModuleLoader__ = {
  load: (mod) => {
    loaded = mod.factory((pkg) => {
      if (pkg === "react") return React;
      return {};
    });
  }
};

await import("../lib/client.js");

const registeredSlots = [];
const mockCtx = {
  effect: (fn) => fn(),
  slots: {
    inject: (name, cb) => cb(),
    register: (desc, comp) => {
      registeredSlots.push({ desc, comp });
      return () => {};
    }
  },
  sessions: {
    list: { getSnapshot: () => ({ current: "s1", byId: {} }) },
    scope: () => ({ get: () => null })
  },
  workspaces: {
    archiveSession: () => Promise.resolve(true),
    openSession: () => {}
  },
  locale: {
    register: () => {}
  }
};

loaded.apply(mockCtx);

assert.ok(registeredSlots.length >= 8, "应至少注册 8 个插槽");

function invokeAllCallbacks(vnode, visited = new Set()) {
  if (!vnode || visited.has(vnode)) return;
  if (Array.isArray(vnode)) {
    for (const item of vnode) invokeAllCallbacks(item, visited);
    return;
  }
  if (typeof vnode !== "object") return;
  visited.add(vnode);

  const mockEvent = {
    stopPropagation: () => {},
    preventDefault: () => {},
    currentTarget: {
      offsetWidth: 100,
      offsetHeight: 30,
      style: {}
    },
    target: {
      value: "test value",
      checked: true
    },
    key: "Enter",
    keyCode: 13,
    ctrlKey: true
  };

  if (vnode.props) {
    for (const [key, val] of Object.entries(vnode.props)) {
      if (typeof val === "function") {
        try {
          val(mockEvent);
        } catch (e) {
          // 仅允许明确预期的业务异常，不允许未声明变量错误
          if (e instanceof ReferenceError) {
            throw e;
          }
        }
      } else if (key === "children") {
        invokeAllCallbacks(val, visited);
      }
    }
  }
  if (vnode.children) {
    invokeAllCallbacks(vnode.children, visited);
  }
}

for (const s of registeredSlots) {
  if (typeof s.comp === "function") {
    const injectedProps = typeof s.desc.inject === "function" ? s.desc.inject("s1") : {};
    const baseProps = {
      ...injectedProps,
      node: {
        key: "n1",
        anchorSeq: 1,
        data: { seq: 1, content: "测试消息", role: "user" }
      },
      sessionId: "s1",
      inputActions: {
        setDraft: () => {},
        submit: () => {}
      },
      useChat: () => ({ nodes: [] }),
      useSession: () => ({ chat: { nodes: [] } })
    };

    const tree1 = s.comp({ ...baseProps, view: "summary" });
    invokeAllCallbacks(tree1);

    const tree2 = s.comp({ ...baseProps, view: "page" });
    invokeAllCallbacks(tree2);
  }
}

console.log("✓ v3.0.0 全量 Slot 组件渲染与事件交互模拟通过（无 ReferenceError）");
