import esbuild from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const entry = join(root, "src", "index.js");
const out = join(root, "lib", "client.js");

const b64 = async (name) => (await readFile(join(root, "assets", name))).toString("base64");
const [edit, recall] = await Promise.all([b64("edit.png"), b64("recall.png")]);

const result = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: "cjs",
  external: ["react", "@deepseek-ai/dsh-client-ui-primitives"],
  write: false,
  target: ["es2022"],
  banner: {
    js: `window.__ModuleLoader__.load({
  id: "dsh-easyrewrite",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;`
  },
  footer: {
    js: `    return module.exports.default || module.exports;
  }
});`
  }
});

let code = result.outputFiles[0].text;
code = code.replaceAll("__DASH_EDIT_ICON__", edit).replaceAll("__DASH_RECALL_ICON__", recall);

await mkdir(dirname(out), { recursive: true });
await writeFile(out, code, "utf8");
console.log("[dsh-easyrewrite] built:", out, "(" + code.length + " bytes)");

