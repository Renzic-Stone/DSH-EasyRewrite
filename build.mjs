/**
 * dsh-easyrewrite 构建脚本：
 * 读取 assets/*.png → base64 → 替换 src/client.src.js 中的占位符 → 生成 lib/client.js。
 * 用法：npm run build（或 node build.mjs）。发布/安装（git 源）经 prepare 自动执行。
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, "lib", "client.js");

const b64 = async (name) => (await readFile(join(root, "assets", name))).toString("base64");
const [edit, recall] = await Promise.all([b64("edit.png"), b64("recall.png")]);

let tpl = await readFile(join(root, "src", "client.src.js"), "utf8");
tpl = tpl.replaceAll("__DASH_EDIT_ICON__", edit).replaceAll("__DASH_RECALL_ICON__", recall);

await mkdir(dirname(out), { recursive: true });
await writeFile(out, tpl);
console.log("[dsh-easyrewrite] built:", out, "(" + tpl.length + " bytes)");
