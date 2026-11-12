/**
 * test-issue27-hooks-and-issue29-routes.mjs
 * Issue #29（Host 箭头函数 + ctx.effect 热卸载防 duplicate exact route）与
 * Issue #27（React #300/#310/#321 根除：AST 静态检查 + Hook 计数 Fiber 动态切换压力测试）专项回归测试。
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";
import esbuild from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

console.log("--- 开始测试：Issue #29 (热卸载路由注销) & Issue #27 (React Hooks 不变量) ---");

// =========================================================================
// [Part A] Issue #29: Cordis 生命周期与路由重复注册防御
// =========================================================================
console.log("[Part A] 验证 Host/Client apply 箭头函数形态与 Cordis 重复启用卸载闭环...");
{
  const tempHome = await mkdtemp(join(tmpdir(), "dsh-er-issue29-"));
  const prevHome = process.env.DSH_HOME;
  process.env.DSH_HOME = tempHome;

  try {
    // 1. 验证 lib/index.js 与 lib/row.js 导出的 apply 不是构造函数（无 .prototype）
    //    Cordis 的 isConstructor(func) 判定：Boolean(func?.prototype) && func.prototype.constructor === func
    const isConstructor = (func) => Boolean(func?.prototype) && func.prototype.constructor === func;
    const hostMod = await import(`../lib/index.js?t=${Date.now()}`);
    const rowMod = await import(`../lib/row.js?t=${Date.now()}`);

    assert.equal(typeof hostMod.apply, "function", "lib/index.js 必须导出 apply 函数");
    assert.equal(isConstructor(hostMod.apply), false, "lib/index.js apply 必须是箭头函数（isConstructor === false），否则 Cordis 会丢弃 cleanup 返回值");
    assert.equal(typeof rowMod.apply, "function", "lib/row.js 必须导出 apply 函数");
    assert.equal(isConstructor(rowMod.apply), false, "lib/row.js apply 必须是箭头函数（isConstructor === false）");

    // 2. AST 校验 src/index.js 中的 apply 同样为箭头函数
    const srcIndexAst = parse(await readFile(join(root, "src", "index.js"), "utf8"), { ecmaVersion: "latest", sourceType: "module" });
    let foundArrowApply = false;
    (function walk(n) {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) return n.forEach(walk);
      if (n.type === "VariableDeclarator" && n.id?.name === "apply" && n.init?.type === "ArrowFunctionExpression") {
        foundArrowApply = true;
      }
      for (const k of Object.keys(n)) walk(n[k]);
    })(srcIndexAst);
    assert.ok(foundArrowApply, "src/index.js 中的 apply 必须是 ArrowFunctionExpression");

    // 3. 高保真模拟 @deepseek-ai/cordis + @deepseek-ai/dsh-host-webserver 同进程二次激活
    const createCordisHostHarness = () => {
      const exactRoutes = new Map();
      const eventListeners = new Map();
      const settingsSchemas = new Map();

      function activatePlugin(pluginApply) {
        const fiberDisposables = [];
        const ctx = {
          effect(fn) {
            const ret = fn();
            if (typeof ret === "function") fiberDisposables.push(ret);
            return () => {
              if (typeof ret === "function") ret();
            };
          },
          on(event, handler) {
            if (!eventListeners.has(event)) eventListeners.set(event, new Set());
            const set = eventListeners.get(event);
            set.add(handler);
            const unsub = () => set.delete(handler);
            fiberDisposables.push(unsub);
            return unsub;
          },
          settings: {
            register(ns, schema) {
              settingsSchemas.set(ns, schema);
              return () => settingsSchemas.delete(ns);
            }
          },
          webServer: {
            register(route) {
              const key = `${String(route.method || "GET").toUpperCase()} ${route.path}`;
              if (exactRoutes.has(key)) {
                throw new Error(`duplicate exact route "${route.path}"`);
              }
              exactRoutes.set(key, route);
              return () => {
                exactRoutes.delete(key);
              };
            }
          }
        };

        if (isConstructor(pluginApply)) {
          // 复现 Cordis Bug 现场：class/普通 function apply 被 `new` 执行，直接丢弃返回的 disposer！
          new pluginApply(ctx);
        } else {
          const ret = pluginApply(ctx);
          if (typeof ret === "function") fiberDisposables.push(ret);
        }

        return () => {
          for (let i = fiberDisposables.length - 1; i >= 0; i -= 1) {
            try { fiberDisposables[i](); } catch {}
          }
          fiberDisposables.length = 0;
        };
      }

      return { exactRoutes, eventListeners, settingsSchemas, activatePlugin };
    };

    const harness = createCordisHostHarness();

    // 第一次激活
    const dispose1 = harness.activatePlugin(hostMod.apply);
    assert.equal(harness.exactRoutes.size, 18, `首次激活应注册 18 条路由，实得 ${harness.exactRoutes.size}`);
    assert.ok(harness.exactRoutes.has("POST /bubble/log") || harness.exactRoutes.has("GET /bubble/log") || Array.from(harness.exactRoutes.keys()).some(k => k.endsWith(" /bubble/log")), "应包含 /bubble/log 路由");
    assert.equal(harness.eventListeners.get("session/created")?.size || 0, 1, "应注册 session/created 事件监听");

    // 卸载（包含幂等二次调用测试）
    dispose1();
    dispose1();
    assert.equal(harness.exactRoutes.size, 0, "卸载后所有 18 条路由必须 100% 注销");
    assert.equal(harness.eventListeners.get("session/created")?.size || 0, 0, "卸载后事件监听必须注销");

    // 等待日志落盘并断言包含 "apply: 已卸载"（利用 writeLog 返回的刷盘 Promise 确保全部前置日志已物理写入）
    await hostMod.__test.writeLog("info", "test", "flush-sync");
    const logContent = await readFile(join(tempHome, "dsh-easyrewrite.log"), "utf8");
    const unloadMatches = logContent.match(/apply: 已卸载/g) || [];
    assert.equal(unloadMatches.length, 1, `幂等卸载应只输出 1 次 "apply: 已卸载"，实得 ${unloadMatches.length} 次`);

    // 同进程内第二次激活（Issue #29 报错现场）
    const dispose2 = harness.activatePlugin(hostMod.apply);
    assert.equal(harness.exactRoutes.size, 18, "同进程二次激活必须无缝成功注册全部 18 条路由，不得抛 duplicate exact route");

    // 第二次卸载与第三次激活
    dispose2();
    assert.equal(harness.exactRoutes.size, 0, "二次卸载后路由仍应清零");
    const dispose3 = harness.activatePlugin(hostMod.apply);
    assert.equal(harness.exactRoutes.size, 18, "三次激活路由数量应保持 18");
    dispose3();

    // 4. 注册途中抛错自动回滚验证（防止半套路由泄露）
    const partialRoutes = new Set();
    const partialListeners = new Set();
    let regSeq = 0;
    const partialCtx = {
      effect(fn) { return fn(); },
      on(ev, h) {
        partialListeners.add(h);
        return () => partialListeners.delete(h);
      },
      webServer: {
        register(r) {
          regSeq += 1;
          if (regSeq === 5) throw new Error("mock mid-register failure");
          partialRoutes.add(r.path);
          return () => partialRoutes.delete(r.path);
        }
      }
    };
    assert.throws(() => hostMod.apply(partialCtx), /mock mid-register failure/);
    assert.equal(partialRoutes.size, 0, "registerAll 途中抛错后，此前注册的部分路由必须自动回滚清零");
    assert.equal(partialListeners.size, 0, "registerAll 途中抛错后，此前注册的事件监听必须自动回滚清零");

    await hostMod.__test.writeLog("info", "test", "flush-sync-end");
    console.log("✓ Issue #29 多次热卸载、同进程二次激活及半途失败回滚完全通过（18 条路由零残留、日志准确输出）");
  } finally {
    if (prevHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = prevHome;
    await rm(tempHome, { recursive: true, force: true }).catch(() => {});
  }
}

// =========================================================================
// [Part B] Issue #27: AST Hook 规则扫描 & Hook 计数 Fiber 运行时测试
// =========================================================================
console.log("[Part B.1] 运行 acorn AST 静态 Hook 规则扫描（src/ 与 lib/client.js）...");
{
  async function collectJsFiles(dir, out = []) {
    for (const name of await readdir(dir)) {
      if (name === "client.src.js") continue;
      const p = join(dir, name);
      if ((await stat(p)).isDirectory()) await collectJsFiles(p, out);
      else if (p.endsWith(".js")) out.push(p);
    }
    return out;
  }

  const CUSTOM_HOOKS = new Set(["useUILocaleDict", "usePending", "useVersionFamilies"]);
  function isHookCall(node) {
    if (!node || node.type !== "CallExpression") return null;
    const c = node.callee;
    if (c.type === "Identifier" && (/^use[A-Z]/.test(c.name) || CUSTOM_HOOKS.has(c.name))) return c.name;
    if (c.type === "MemberExpression" && !c.computed && c.property.type === "Identifier") {
      const n = c.property.name;
      if (/^use[A-Z]/.test(n) || ["useInput", "useChat", "useSession"].includes(n)) return `${c.object.name || "obj"}.${n}`;
    }
    return null;
  }

  function scanFnBody(fnName, bodyNode, file, issues, inNested) {
    function visit(node, ctxFlags) {
      if (!node || typeof node !== "object") return { didReturnAt: 0 };
      if (Array.isArray(node)) {
        let ret = 0;
        for (const n of node) {
          const r = visit(n, ctxFlags);
          if (r?.didReturnAt && !ret) ret = r.didReturnAt;
        }
        return { didReturnAt: ret };
      }
      if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") {
        const subName = node.id ? node.id.name : `${fnName}->nested`;
        scanFnBody(subName, node.body, file, issues, true);
        return { didReturnAt: 0 };
      }
      const hook = isHookCall(node);
      if (hook) {
        if (ctxFlags.inNestedFn) issues.push({ file, fn: fnName, hook, line: node.loc.start.line, kind: "IN_CALLBACK_OR_NESTED_FN" });
        if (ctxFlags.seenReturn) issues.push({ file, fn: fnName, hook, line: node.loc.start.line, kind: `AFTER_RETURN(L${ctxFlags.seenReturnLine})` });
        if (ctxFlags.inTry) issues.push({ file, fn: fnName, hook, line: node.loc.start.line, kind: "IN_TRY_CATCH" });
        if (ctxFlags.inCond) issues.push({ file, fn: fnName, hook, line: node.loc.start.line, kind: "CONDITIONAL" });
      }
      if (node.type === "ReturnStatement") {
        if (node.argument) visit(node.argument, ctxFlags);
        return { didReturnAt: node.loc.start.line };
      }
      if (node.type === "IfStatement") {
        visit(node.test, ctxFlags);
        const r1 = visit(node.consequent, { ...ctxFlags, inCond: true });
        const r2 = node.alternate ? visit(node.alternate, { ...ctxFlags, inCond: true }) : { didReturnAt: 0 };
        return { didReturnAt: r1.didReturnAt || r2.didReturnAt };
      }
      if (node.type === "ConditionalExpression") {
        visit(node.test, ctxFlags);
        visit(node.consequent, { ...ctxFlags, inCond: true });
        visit(node.alternate, { ...ctxFlags, inCond: true });
        return { didReturnAt: 0 };
      }
      if (node.type === "BlockStatement") {
        const cur = { ...ctxFlags };
        let firstRet = 0;
        for (const stmt of node.body) {
          const res = visit(stmt, cur);
          if (res?.didReturnAt && !cur.seenReturn) {
            cur.seenReturn = true;
            cur.seenReturnLine = res.didReturnAt;
            firstRet = res.didReturnAt;
          }
        }
        return { didReturnAt: firstRet };
      }
      const nextFlags = { ...ctxFlags };
      if (["SwitchStatement", "LogicalExpression", "ForStatement", "WhileStatement", "DoWhileStatement"].includes(node.type)) nextFlags.inCond = true;
      if (node.type === "TryStatement") nextFlags.inTry = true;
      let firstRet = 0;
      for (const k of Object.keys(node)) {
        if (k === "loc" || k === "type" || k === "start" || k === "end") continue;
        const res = visit(node[k], nextFlags);
        if (res?.didReturnAt && !firstRet) firstRet = res.didReturnAt;
      }
      return { didReturnAt: firstRet };
    }
    const flags = { seenReturn: false, seenReturnLine: 0, inTry: false, inCond: false, inNestedFn: !!inNested };
    if (bodyNode && bodyNode.type === "BlockStatement") visit(bodyNode, flags);
  }

  const issues = [];
  for (const f of await collectJsFiles(join(root, "src"))) {
    const ast = parse(await readFile(f, "utf8"), { ecmaVersion: "latest", sourceType: "module", locations: true });
    (function walkTop(n) {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) return n.forEach(walkTop);
      if ((n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") && n.body) {
        scanFnBody(n.id ? n.id.name : "topFn", n.body, f, issues, false);
        return;
      }
      for (const k of Object.keys(n)) if (k !== "loc") walkTop(n[k]);
    })(ast);
  }
  assert.deepEqual(issues, [], `源码存在 React Hook 违规：\n${JSON.stringify(issues, null, 2)}`);

  // 验证最终产物 lib/client.js 语法完好且全部组件/自定义 Hook 函数均无规则违规
  const clientCode = await readFile(join(root, "lib", "client.js"), "utf8");
  const bundleAst = parse(clientCode, { ecmaVersion: "latest", sourceType: "script", locations: true });
  const bundleIssues = [];
  (function findBundleHookFns(n) {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(findBundleHookFns);
    if ((n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") && n.body?.type === "BlockStatement") {
      const fnName = n.id?.name || "";
      if (/^([A-Z]|use[A-Z])/.test(fnName)) {
        scanFnBody(fnName, n.body, "lib/client.js", bundleIssues, false);
        return;
      }
    }
    for (const k of Object.keys(n)) if (k !== "loc") findBundleHookFns(n[k]);
  })(bundleAst);
  assert.deepEqual(bundleIssues, [], `lib/client.js 打包产物存在 Hook 违规：\n${JSON.stringify(bundleIssues, null, 2)}`);
  console.log("✓ AST 扫描全部 src/ 源码与 lib/client.js 打包产物均 0 Hook 违规");
}

console.log("[Part B.2] 严格 Hook 计数 Fiber 调度器运行时测试（#300/#310/#321 事故现场重演）...");
{
  // 安装最小 DOM/浏览器环境桩
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
  const winListeners = new Map();
  globalThis.window = {
    addEventListener(ev, fn) {
      if (!winListeners.has(ev)) winListeners.set(ev, new Set());
      winListeners.get(ev).add(fn);
    },
    removeEventListener(ev, fn) {
      winListeners.get(ev)?.delete(fn);
    },
    dispatchEvent(ev) {
      const list = winListeners.get(ev?.type);
      if (list) for (const fn of list) fn(ev);
      return true;
    },
    StorageEvent: function (t, init) { return { type: t, ...(init || {}) }; },
    CustomEvent: function (t, init) { return { type: t, ...(init || {}) }; }
  };
  globalThis.location = { search: "" };
  const dummyEl = {
    style: {},
    setAttribute() {},
    removeAttribute() {},
    appendChild() {},
    insertBefore() {},
    remove() {},
    contains: () => false,
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 200, height: 40, top: 0, left: 0, right: 200, bottom: 40 })
  };
  globalThis.document = {
    createElement: () => ({ ...dummyEl }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    body: { ...dummyEl },
    activeElement: null
  };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });

  // 构建真实 React Hook-Counting 调度器（严格验证 #300 / #310 / #321 与 key 隔离）
  function createStrictReactHarness() {
    let inRender = false;
    let currentFiber = null;
    const fibers = new Map(); // path -> { type, key, hooks, states, refs, hookOrder }

    function requireRenderContext(hookName) {
      if (!inRender || !currentFiber) {
        throw new Error(`Minified React error #321 (Invalid hook call: ${hookName} called outside render)`);
      }
      const idx = currentFiber.cursor++;
      currentFiber.currentRunOrder.push(hookName);
      if (currentFiber.mounted && idx < currentFiber.hookOrder.length && currentFiber.hookOrder[idx] !== hookName) {
        throw new Error(`Minified React error #310 (Hook type mismatch at index ${idx}: expected ${currentFiber.hookOrder[idx]}, got ${hookName})`);
      }
      return idx;
    }

    const ReactMock = {
      Fragment: Symbol("Fragment"),
      createElement(type, props, ...children) {
        return { type, props: props || {}, key: props?.key ?? null, children };
      },
      useState(init) {
        const idx = requireRenderContext("useState");
        const fiber = currentFiber;
        if (!fiber.mounted) {
          fiber.slotValues[idx] = typeof init === "function" ? init() : init;
        }
        const setState = (val) => {
          fiber.slotValues[idx] = typeof val === "function" ? val(fiber.slotValues[idx]) : val;
        };
        return [fiber.slotValues[idx], setState];
      },
      useRef(init) {
        const idx = requireRenderContext("useRef");
        const fiber = currentFiber;
        if (!fiber.mounted) {
          fiber.slotValues[idx] = { current: init };
        }
        return fiber.slotValues[idx];
      },
      useEffect(fn, deps) {
        const idx = requireRenderContext("useEffect");
        const fiber = currentFiber;
        fiber.pendingEffects.push(fn);
        fiber.slotValues[idx] = deps;
      },
      useMemo(factory, deps) {
        const idx = requireRenderContext("useMemo");
        const fiber = currentFiber;
        if (!fiber.mounted) {
          fiber.slotValues[idx] = { value: factory(), deps };
        } else {
          const prev = fiber.slotValues[idx];
          const changed = !deps || !prev.deps || deps.length !== prev.deps.length || deps.some((d, i) => !Object.is(d, prev.deps[i]));
          if (changed) fiber.slotValues[idx] = { value: factory(), deps };
        }
        return fiber.slotValues[idx].value;
      },
      useCallback(fn, deps) {
        return ReactMock.useMemo(() => fn, deps);
      },
      useSyncExternalStore(subscribe, getSnapshot) {
        const idx = requireRenderContext("useSyncExternalStore");
        const fiber = currentFiber;
        const val = getSnapshot();
        if (!fiber.mounted) {
          fiber.slotValues[idx] = { subscribe, val };
        }
        return val;
      }
    };

    function renderSubtree(node, path = "root") {
      if (!node || typeof node !== "object") return node;
      if (typeof node.type === "function") {
        const keySig = node.key !== null && node.key !== undefined ? String(node.key) : "";
        let fiber = fibers.get(path);
        // 类型或 key 变化 → 像真实 React 一样卸载旧 Fiber 并重建新 Fiber
        if (!fiber || fiber.type !== node.type || fiber.key !== keySig) {
          fiber = {
            type: node.type,
            key: keySig,
            mounted: false,
            slotValues: [],
            hookOrder: [],
            currentRunOrder: [],
            pendingEffects: [],
            cursor: 0
          };
          fibers.set(path, fiber);
        }
        fiber.cursor = 0;
        fiber.currentRunOrder = [];
        fiber.pendingEffects = [];

        const prevRender = inRender;
        const prevFiber = currentFiber;
        inRender = true;
        currentFiber = fiber;
        let out;
        try {
          out = node.type(node.props);
        } finally {
          inRender = prevRender;
          currentFiber = prevFiber;
        }

        if (!fiber.mounted) {
          fiber.hookOrder = fiber.currentRunOrder.slice();
          fiber.mounted = true;
        } else {
          if (fiber.currentRunOrder.length < fiber.hookOrder.length) {
            throw new Error(`Minified React error #300 (${node.type.name}: expected ${fiber.hookOrder.length} hooks, rendered ${fiber.currentRunOrder.length})`);
          }
          if (fiber.currentRunOrder.length > fiber.hookOrder.length) {
            throw new Error(`Minified React error #310 (${node.type.name}: expected ${fiber.hookOrder.length} hooks, rendered ${fiber.currentRunOrder.length})`);
          }
        }
        return renderSubtree(out, `${path}>${node.type.name || "fn"}:${keySig}`);
      }
      if (node.children && node.children.length > 0) {
        return {
          ...node,
          children: node.children.flat().map((c, i) => renderSubtree(c, `${path}.${i}`))
        };
      }
      return node;
    }

    return { ReactMock, renderSubtree, isInRender: () => inRender };
  }

  const { ReactMock, renderSubtree, isInRender } = createStrictReactHarness();

  // 用 esbuild 内存打包真实 src 组件以注入 ReactMock 与 Primitives Stub
  const virtualEntry = `
    export { UserBubbleView } from "./src/features/bubble/view.js";
    export { RecallBanner } from "./src/features/recall/banner.js";
    export { HistorySettingsPage } from "./src/features/history/index.js";
    export { VersionPager } from "./src/features/history/pager.js";
    export { writePending, readPending } from "./src/features/recall/store.js";
    export { readChatSnapshotSync } from "./src/core/constants.js";
    export { setServiceRefs } from "./src/core/services.js";
    export { familyOfSession } from "./src/core/session.js";
  `;
  const bundleResult = await esbuild.build({
    stdin: { contents: virtualEntry, resolveDir: root, loader: "js" },
    bundle: true,
    format: "cjs",
    external: ["react", "@deepseek-ai/dsh-client-ui-primitives"],
    write: false
  });
  const PrimitivesMock = new Proxy({}, {
    get: (_, prop) => (props) => ({ type: String(prop), props })
  });
  const mod = { exports: {} };
  const fn = new Function("module", "exports", "require", bundleResult.outputFiles[0].text);
  fn(mod, mod.exports, (id) => {
    if (id === "react") return ReactMock;
    if (id === "@deepseek-ai/dsh-client-ui-primitives") return PrimitivesMock;
    throw new Error(`Unexpected external import: ${id}`);
  });

  const {
    UserBubbleView,
    RecallBanner,
    HistorySettingsPage,
    VersionPager,
    writePending,
    readChatSnapshotSync,
    setServiceRefs,
    familyOfSession
  } = mod.exports;

  // 构造模拟聊天快照
  const node1 = { key: "u1", kind: "user", seq: 1, anchorSeq: 1, data: { kind: "user", seq: 1, content: [{ type: "text", text: "你好" }] } };
  const node2 = { key: "a1", kind: "assistant", seq: 2, anchorSeq: 2, data: { kind: "assistant", seq: 2, content: [{ type: "text", text: "你好！" }] } };
  const chatSnap = {
    order: ["u1", "a1"],
    nodes: new Map([["u1", node1], ["a1", node2]]),
    hasMore: false
  };
  const useChatHook = (sel) => {
    // 真实模拟 DSH bindSnapshotSelector：内部调 React Hook！若在事件内调会立刻炸 #321，若条件增减会立刻炸 #300/#310！
    ReactMock.useSyncExternalStore(() => () => {}, () => chatSnap);
    return sel(chatSnap);
  };
  const useSessionHook = (sel) => {
    ReactMock.useSyncExternalStore(() => () => {}, () => ({ chat: chatSnap }));
    return sel({ chat: chatSnap });
  };
  const useInputHook = (sel) => {
    const val = { draft: "draft text", attachmentIds: [] };
    ReactMock.useSyncExternalStore(() => () => {}, () => val);
    return sel(val);
  };

  // 测试 1：UserBubbleView 待撤回 -> 极简隐藏 return null -> 简约折叠 -> 恢复正常（核心 #300 现场）
  const baseBubbleProps = {
    sessionId: "sess-27",
    node: node1,
    useChat: useChatHook,
    useInput: useInputHook,
    ctxSessions: { get: () => null, list: () => [] }
  };

  function findInTree(node, pred) {
    if (!node || typeof node !== "object") return null;
    if (pred(node)) return node;
    const ch = Array.isArray(node.children) ? node.children : (node.props?.children ? [node.props.children] : []);
    for (const c of ch.flat()) {
      const hit = findInTree(c, pred);
      if (hit) return hit;
    }
    return null;
  }

  writePending("sess-27", null);
  const outNormal = renderSubtree(ReactMock.createElement(UserBubbleView, baseBubbleProps), "slot-bubble");
  assert.ok(outNormal, "普通态 UserBubbleView 应正常渲染");

  // 进入编辑态（触发 user-editing UI 与子组件 EditModelPicker）→ 退出编辑态
  const editTrigger = findInTree(outNormal, (n) => n.props?.title === "点击编辑" && typeof n.props?.onClick === "function");
  assert.ok(editTrigger, "应渲染点击编辑触发节点");
  editTrigger.props.onClick({ stopPropagation() {}, preventDefault() {}, target: dummyEl, currentTarget: dummyEl });
  const outEditing = renderSubtree(ReactMock.createElement(UserBubbleView, baseBubbleProps), "slot-bubble");
  assert.ok(findInTree(outEditing, (n) => n.props?.["data-dsh-easyrewrite"] === "user-editing"), "点击编辑后应进入 user-editing 编辑态且不抛 React #300");

  const cancelBtn = findInTree(outEditing, (n) => n.type === "button" && typeof n.props?.onClick === "function" && JSON.stringify(n.children || "").includes("取消"));
  assert.ok(cancelBtn, "编辑态应渲染取消按钮");
  cancelBtn.props.onClick({ stopPropagation() {}, preventDefault() {} });
  const outBackNormal = renderSubtree(ReactMock.createElement(UserBubbleView, baseBubbleProps), "slot-bubble");
  assert.ok(outBackNormal, "取消编辑退回普通态时不应抛 React #300/#310");

  writePending("sess-27", { type: "recall", targetKey: "u1", targetSeq: 1, visualMode: "minimal" });
  const outHidden = renderSubtree(ReactMock.createElement(UserBubbleView, baseBubbleProps), "slot-bubble");
  assert.equal(outHidden, null, "minimal pendingMine 时 UserBubbleView 应返回 null 且不抛 React #300");

  writePending("sess-27", { type: "recall", targetKey: "u1", targetSeq: 1, visualMode: "simple" });
  const outSimple = renderSubtree(ReactMock.createElement(UserBubbleView, baseBubbleProps), "slot-bubble");
  assert.ok(outSimple, "simple pendingMine 时 UserBubbleView 应返回占位且不抛 React #300");

  writePending("sess-27", null);
  const outRestored = renderSubtree(ReactMock.createElement(UserBubbleView, baseBubbleProps), "slot-bubble");
  assert.ok(outRestored, "取消撤回恢复正常态时 UserBubbleView 不应抛 React #310");

  // 测试 2：useChat / useSession / useInput 在挂载期动态切换（Hook Gate 隔离验证）
  for (const variant of [
    { useChat: useChatHook, useInput: useInputHook },
    { useSession: useSessionHook },
    {},
    { useChat: useChatHook, useInput: useInputHook }
  ]) {
    renderSubtree(ReactMock.createElement(UserBubbleView, { sessionId: "sess-drift", node: node1, ...variant }), "slot-drift-bubble");
    renderSubtree(ReactMock.createElement(VersionPager, { sessionId: "sess-drift", ...variant }), "slot-drift-pager");
    renderSubtree(ReactMock.createElement(RecallBanner, { sessionId: "sess-drift", ...variant }), "slot-drift-banner");
  }

  // 测试 3：HistorySettingsPage view="summary" <-> full 往返切换
  const sumRes = renderSubtree(ReactMock.createElement(HistorySettingsPage, { view: "summary" }), "slot-history-page");
  assert.equal(typeof sumRes, "string", "summary 视图应返回描述文本");
  const fullRes = renderSubtree(ReactMock.createElement(HistorySettingsPage, { view: "detail", ctxSessions: { list: () => [], get: () => null } }), "slot-history-page");
  assert.ok(fullRes && typeof fullRes === "object", "detail 视图应正常渲染设置页且不抛 React #300/#310");
  const sumRes2 = renderSubtree(ReactMock.createElement(HistorySettingsPage, { view: "summary" }), "slot-history-page");
  assert.equal(typeof sumRes2, "string", "切回 summary 视图不应抛 React #300");

  // 测试 4：render 外部调用 readChatSnapshotSync 不触发 Hook（#321 防御）
  assert.equal(isInRender(), false);
  setServiceRefs({
    sessions: { binding: (id) => ({ session: { id } }) },
    uiConversation: { binding: () => ({ target: () => ({ getSnapshot: () => chatSnap }) }) }
  });
  const syncSnap = readChatSnapshotSync("sess-27");
  assert.strictEqual(syncSnap, chatSnap, "非 Hook readChatSnapshotSync 应在 render 外实时返回最新快照而不触发 #321");

  // 测试 5：dsh-sidenote 侧边对话与 archived 会话不得被 familyOfSession 误认作分叉 (Issue #28 @SimHapQ)
  globalThis.localStorage.setItem("dsh-sidenote:side-sessions:v1", JSON.stringify({ ids: ["sess-side-1"] }));
  const mockSessSvc28 = {
    list: {
      getSnapshot: () => ({
        ids: ["sess-main-1", "sess-side-1", "sess-arch-1"],
        byId: {
          "sess-main-1": { id: "sess-main-1", origin: "user" },
          "sess-side-1": { id: "sess-side-1", parentId: "sess-main-1", origin: "user" },
          "sess-arch-1": { id: "sess-arch-1", parentId: "sess-main-1", origin: "user", archived: true }
        }
      })
    }
  };
  assert.deepEqual(familyOfSession("sess-main-1", mockSessSvc28)?.versions, ["sess-main-1"], "dsh-sidenote 侧边对话与 archived 会话必须排除，不得误展 1/2 分叉");
  assert.equal(familyOfSession("sess-side-1", mockSessSvc28), null, "在侧边对话内不应派生分叉家族");
  globalThis.localStorage.removeItem("dsh-sidenote:side-sessions:v1");

  console.log("✓ Issue #27 严格 Hook 计数 Fiber 运行时全场景压测通过（0 次 React #300/#310/#321）");
}

console.log("\n======================================");
console.log("✔ Issue #29 & Issue #27 专项回归测试全部通过！");
console.log("======================================");
