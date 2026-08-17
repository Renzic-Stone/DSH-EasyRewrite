# rc.6 API 事实清单（api-facts）

> 事实来源：本机 `@deepseek-ai/dsh@0.1.0-rc.6`（npx 缓存）源码实测；随 M0 冒烟持续更新。
> 图例：✅ 已实测存在｜⚠️ M0 待验证｜❌ 不存在（设计已绕开）

## 渲染与组合

| API | 位置 | 状态 | 备注 |
|---|---|---|---|
| keyed 槽同 key 多注册按 `priority` 抢占 | `dsh-client-ui-slots/lib/index.js:68-84` | ✅ | `(a.options.priority ?? 0) - ...`；社区 `dsh-recall` 用 `priority:-1` 覆盖 user 渲染器 |
| `conversation.chat.node` keyed 槽（user/assistant-step/…） | `dsh-client-ui-conversation/lib/client.js:9323-9396` | ✅ | 官方 `UserMessageNodeView` 注册于 `key:"user"` |
| `conversation.chat.assistant-actions`（list，session 域） | `dsh-client-ui-conversation` turn-tail children 声明 | ⚠️ | < X > 翻页器挂载点，M0 实测 |
| `conversation.input` / `setDraft(text)` | `dsh-client-ui-conversation/lib/client.js:900,934` | ✅ | 撤回回填输入框 |
| `--dsh-chat-content-width: 748px` | `dsh-client-ui-conversation/lib/client.js:6751` | ✅ | 编辑宽度默认档（≈36 全角字符） |
| DisclosureRow 折叠时不渲染 children（`open && children`） | `dsh-client-ui-primitives/lib/index.js:1376` | ✅ | DOM 层无法纯 CSS 展开 |

## 会话与 fork

| API | 位置 | 状态 | 备注 |
|---|---|---|---|
| `sessions.fork(opts)` → `api.sessions.fork` | `dsh-client-runtime/lib/client.js:8199-8202` | ✅ | fork 新版本主路径 |
| `turnOrder` / `locations.getTurn(turn)` | `dsh-client-runtime` | ✅ | 回合边界定位（dsh-web-enhance 实战） |
| `agents.create({ seed, meta })` | `dsh-agent/lib/index.js:543` | ✅ | 备选建版本路径（dsh-message-edit 事务缝） |
| `session/recall` 墓碑协议 | `dsh-session` | ❌ | 不存在 → 撤回不依赖它，用 fork 方案 |

## 会话日志与存储

| API | 位置 | 状态 | 备注 |
|---|---|---|---|
| 会话日志 `.jsonl.zstd`（zstd 帧容器） | `dsh-session-persistence-jsonl`（node:zlib 的 `zstdDecompressSync`） | ✅ | 可离线解压核查（已实战） |
| 会话目录 | `$DSH_HOME/sessions/<project>/session-<uuid>/` | ✅ | 本机 `C:\Users\rzs_\.dsh\sessions\...` |

## M0 待验证（⚠️）

| # | 项 | 影响 | 备选 |
|---|---|---|---|
| V1 | user keyed `priority:-1` 覆盖渲染实测 | 全部 UI 前提 | 官方渲染器旁路注入 |
| V2 | fork 后新版本打开与版本树登记 | 编辑/撤回核心 | agents.create 事务缝 |
| V3 | 发送钩子：composer 提交路径拦截 | 「发送时撤回」落点 | 输入框 dock 提交拦截 / 按钮旁动作 |
| V4 | assistant-actions 插槽追加控件实测 | 翻页器位置 | 覆盖 assistant 渲染器 |
| V5 | 附件在 fork/重放中的透传 | 编辑保留附件 | 附件重建清单 |

## 模块加载契约

- client bundle：`window.__ModuleLoader__.load({ id, factory })`，factory 返回 `{ name, inject, apply }`
  （`dsh-client-modules`；范本 dsh-auto-collapse build.mjs）。
- host half：ESM 具名导出 `name / inject / apply / Config`；`ctx.effect(fn, label)` 立即执行、返回值即卸载清理。
