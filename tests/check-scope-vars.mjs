import fs from "node:fs";
import path from "node:path";
import * as acorn from "acorn";

const KNOWN_GLOBALS = new Set([
  // ECMAScript 标准全局
  "globalThis", "window", "document", "navigator", "console", "localStorage", "sessionStorage",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame",
  "getComputedStyle", "matchMedia", "addEventListener", "removeEventListener", "dispatchEvent",
  "Date", "Math", "JSON", "Array", "Object", "String", "Boolean", "Number", "RegExp", "Promise",
  "Set", "Map", "WeakMap", "WeakSet", "Error", "TypeError", "ReferenceError", "RangeError", "SyntaxError",
  "isNaN", "isFinite", "parseInt", "parseFloat", "encodeURIComponent", "decodeURIComponent",
  "fetch", "File", "Blob", "FileReader", "Image", "URL", "HTMLTextAreaElement", "HTMLElement", "Element", "Node",
  "KeyboardEvent", "MouseEvent", "Event", "CustomEvent", "undefined", "NaN", "Infinity",
  "Reflect", "Proxy", "Symbol", "BigInt", "Intl", "alert", "confirm", "prompt", "history", "location",
  "performance", "crypto", "btoa", "atob", "NodeList", "MutationObserver", "ResizeObserver",
  "Uint8Array", "Int8Array", "Uint16Array", "Int16Array", "Uint32Array", "Int32Array", "Float32Array", "Float64Array",
  "BigInt64Array", "BigUint64Array", "ArrayBuffer", "DataView",
  // 项目构建替换宏
  "__DASH_EDIT_ICON__", "__DASH_RECALL_ICON__"
]);

function getFiles(dir) {
  const res = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      res.push(...getFiles(full));
    } else if (item.name.endsWith(".js") && item.name !== "client.src.js") {
      res.push(full);
    }
  }
  return res;
}

class Scope {
  constructor(parent = null, isFunction = false) {
    this.parent = parent;
    this.isFunction = isFunction;
    this.decls = new Set();
  }
  declare(name) {
    this.decls.add(name);
  }
  has(name) {
    if (this.decls.has(name)) return true;
    if (this.parent) return this.parent.has(name);
    return false;
  }
  getFunctionScope() {
    let s = this;
    while (s.parent && !s.isFunction) {
      s = s.parent;
    }
    return s;
  }
}

function patternNames(node, cb) {
  if (!node) return;
  if (node.type === "Identifier") {
    cb(node.name);
  } else if (node.type === "ObjectPattern") {
    for (const prop of node.properties) {
      if (prop.type === "Property") patternNames(prop.value, cb);
      else if (prop.type === "RestElement") patternNames(prop.argument, cb);
    }
  } else if (node.type === "ArrayPattern") {
    for (const elem of node.elements) {
      if (elem) patternNames(elem, cb);
    }
  } else if (node.type === "AssignmentPattern") {
    patternNames(node.left, cb);
  } else if (node.type === "RestElement") {
    patternNames(node.argument, cb);
  }
}

// 预提升该作用域内的声明（Hoisting）
function hoistDeclarations(bodyNode, scope) {
  if (!bodyNode) return;
  const nodes = Array.isArray(bodyNode) ? bodyNode : [bodyNode];
  
  function scan(n) {
    if (!n || typeof n !== "object") return;
    if (n.type === "FunctionDeclaration") {
      if (n.id) scope.declare(n.id.name);
      return;
    }
    if (n.type === "VariableDeclaration") {
      if (n.kind === "var") {
        for (const d of n.declarations) {
          patternNames(d.id, name => scope.getFunctionScope().declare(name));
        }
      } else {
        for (const d of n.declarations) {
          patternNames(d.id, name => scope.declare(name));
        }
      }
      return;
    }
    if (n.type === "ImportDeclaration") {
      for (const spec of n.specifiers) {
        scope.declare(spec.local.name);
      }
      return;
    }
    if (n.type === "ExportNamedDeclaration" && n.declaration) {
      scan(n.declaration);
      return;
    }
    if (n.type === "ExportDefaultDeclaration" && n.declaration) {
      scan(n.declaration);
      return;
    }

    if (n.type !== "FunctionDeclaration" && n.type !== "FunctionExpression" && n.type !== "ArrowFunctionExpression") {
      for (const [k, v] of Object.entries(n)) {
        if (k === "loc" || k === "range") continue;
        if (Array.isArray(v)) {
          for (const item of v) scan(item);
        } else if (v && typeof v.type === "string") {
          scan(v);
        }
      }
    }
  }

  for (const n of nodes) scan(n);
}

function checkFile(filePath) {
  const code = fs.readFileSync(filePath, "utf8");
  let ast;
  try {
    ast = acorn.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true
    });
  } catch (err) {
    return [{ file: filePath, message: `Parse Error: ${err.message}` }];
  }

  const errors = [];
  const rootScope = new Scope(null, true);

  // 提升顶层
  hoistDeclarations(ast.body, rootScope);

  function walk(node, scope) {
    if (!node) return;

    let currentScope = scope;

    if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") {
      currentScope = new Scope(scope, true);
      if (node.id && node.type === "FunctionExpression") {
        currentScope.declare(node.id.name);
      }
      for (const param of node.params) {
        patternNames(param, name => currentScope.declare(name));
      }
      if (node.body) {
        hoistDeclarations(node.body.body || node.body, currentScope);
      }
    } else if (node.type === "BlockStatement" || node.type === "ForStatement" || node.type === "ForInStatement" || node.type === "ForOfStatement") {
      currentScope = new Scope(scope, false);
      if (node.body) {
        hoistDeclarations(node.body, currentScope);
      }
    } else if (node.type === "CatchClause") {
      currentScope = new Scope(scope, false);
      if (node.param) patternNames(node.param, name => currentScope.declare(name));
      if (node.body) {
        hoistDeclarations(node.body.body, currentScope);
      }
    }

    // 检查 Identifier 引用
    if (node.type === "Identifier") {
      const name = node.name;
      if (!currentScope.has(name) && !KNOWN_GLOBALS.has(name)) {
        errors.push({
          file: filePath,
          line: node.loc.start.line,
          column: node.loc.start.column,
          name
        });
      }
    }

    // 递归子节点
    for (const [key, val] of Object.entries(node)) {
      if (key === "loc" || key === "range") continue;
      if (node.type === "MemberExpression" && key === "property" && !node.computed) continue;
      if (node.type === "Property" && key === "key" && !node.computed) continue;
      if (node.type === "MethodDefinition" && key === "key" && !node.computed) continue;
      if (node.type === "ExportNamedDeclaration" && key === "specifiers") continue;
      if (node.type === "ImportDeclaration") continue;
      if (node.type === "FunctionDeclaration" && key === "id") continue;
      if (node.type === "ClassDeclaration" && key === "id") continue;
      if (node.type === "VariableDeclarator" && key === "id") continue;

      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item.type === "string") {
            walk(item, currentScope);
          }
        }
      } else if (val && typeof val.type === "string") {
        walk(val, currentScope);
      }
    }
  }

  walk(ast, rootScope);
  return errors;
}

const files = getFiles(path.resolve("src"));
let totalErrors = 0;

for (const f of files) {
  const errs = checkFile(f);
  if (errs.length > 0) {
    for (const e of errs) {
      console.error(`[UNDEFINED VAR] ${path.relative(".", e.file)}:${e.line}:${e.column} -> "${e.name}" is not defined or imported!`);
      totalErrors++;
    }
  }
}

if (totalErrors > 0) {
  console.error(`\nFound ${totalErrors} undefined variable(s). Check failed.`);
  process.exit(1);
} else {
  console.log(`\n✓ All ${files.length} source files checked: 0 undefined variables!`);
}
