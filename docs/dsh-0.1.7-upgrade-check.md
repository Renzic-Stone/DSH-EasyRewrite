# DSH 0.1.7-rc.1 升级适配核查（2026-09-24）

## 结论
本地已升 0.1.7-rc.1（自 0.1.5-rc.3）。**三处破坏性变更，均已修复并在 0.1.7-rc.1 上实测通过。**

## 1. 插件接口核查

| 接口 | 0.1.7 状态 |
|---|---|
| `conversation.chat.node` / `conversation.input.dock` / `conversation.chat.assistant-actions` | ✅ 保留（两版插槽清单为**纯增量**：rc.3 的 19 个一个不少，另新增 5 个） |
| `slots.register` keyed 形态 `{key, priority}` | ✅ 保留 |
| `slots.register` list 形态 `{id, order, label}` | 🆕 0.1.7 新增，插件页改用它 |
| `ctx.sessions.open / scope` | ✅ 保留 |
| `locale.register` | ✅ 保留 |
| `ctx.webServer.register` | ✅ 签名未变（`dsh-host-webserver` 全包仅一处注释改动） |
| **`settings.register`** | ❌ **已移除** |
| **插件设置页插槽 `settings.plugin.item`** | ❌ **已移除**，换成插件页的 `plugins.row.config`（第三方）/ `plugins.item`（官方） |
| **图标导出名 `Icon*Outline<尺寸>`** | ❌ **已重排**为 `Icon*Outline<字重>` |

## 2. 破坏点一：图标导出名重排（症状最重）

0.1.7 把名字里的数字从**尺寸**改成**字重**，尺寸移回 `size` prop：

| 旧（≤ 0.1.5） | 新（0.1.7） | 默认绘制尺寸 |
|---|---|---|
| `IconCheckOutline16` | `IconCheckOutlineRegular` | 16（不变） |
| `IconCopyOutline16` | `IconCopyOutlineRegular` | 16 |
| `IconChevronLeftOutline14` | `IconChevronLeftOutlineRegular` | 14 |
| `IconChevronRightOutline14` | `IconChevronRightOutlineRegular` | 14 |

**症状不是"少一个图标"**：旧名在新版解析为 `undefined`，`React.createElement(undefined)` 抛 React #130，
崩掉的是**整个 `conversation.chat.node` 槽条目** —— 用户气泡连同撤回按钮一起消失，控制台报
`slot entry crashed in 'conversation.chat.node'`。

**修复**：`pickIcon()` 依次取旧名/新名，两边都可用；都取不到时退回空组件，让缺图标只少一个 glyph，
不再拖崩整个气泡。

## 3. 破坏点二：插件设置页换插槽，且组件必须按 `view` 分流

`settings.plugin.item`（keyed，按命名空间分发）在 0.1.7 不再存在。插件页改由侧边栏 Plugins 页承担，
它声明三个插槽（见 `dsh-client-ui-plugin-manager` 的 README）：

| 插槽 | 形态 | 用途 |
|---|---|---|
| `plugins.item` | list `{id, order, label}` | **官方插件专用**，按 `label` 列在列表的「官方」分组 |
| `plugins.bundle.config` | keyed by bundle 包名 | 某个 bundle 自身的配置，显示在该 bundle 页面上 |
| `plugins.row.config` | keyed by `<包名>#<行 id>` | 某一行的配置，**并给该行一个 Configure 控件**打开它自己的页面 |

第三方 bundle 应当用后两者之一。**挂 `plugins.item` 会让它出现在列表的「官方」分组里，和官方插件混在
一起** —— 这是最容易踩的一步。本插件用 `plugins.row.config`：配置本就属于 bundle patch 声明的那一行，
key 为 `dsh-easyrewrite#dsh-easyrewrite`。

更关键的是：**页面把同一个组件按 `view` 渲染两次**（`plugins.row.config` 亦然）——

```js
description: renderSlot("plugins.row.config", { view: "summary" }, { entryKey: key })   // 行/包描述缺省时的一行
renderSlot("plugins.row.config", { view: "page", form }, { entryKey: key })             // 配置主体
```

所以 `view === "summary"` 必须返回**一行描述**。只换插槽名而不分流，整张配置表单会被塞进列表行。
官方 `WebSearchCard` 的注释写得很清楚：*"@returns the one-liner, or the form"*。

**修复**：两个插槽分别注册（旧 keyed 给 `key`，新 keyed 给 `<包名>#<行 id>`），并让卡片按 `view` 分流 ——
`summary` 返回副标题一行，`page` 返回配置主体。两种 view 都不再自画头部，因为页面已经提供图标、标题、
Configure 控件与详情页外壳。未被声明的插槽 `inject` 不会触发，因此一份代码在 0.1.5 与 0.1.7 上各走各的。

## 4. 一项"看起来会坏、实际无损"的变化

宿主侧 `ctx.settings.register(...)` 在 0.1.7 被移除。`apply` 里对它的调用**本就包在 `typeof` 守卫 +
try/catch 中**，因此只是跳过注册、记一条 info 日志，不影响任何功能 —— 设置卡片走的是插件自己的
`/bubble/*` 路由（`webServer.register`，签名未变），不依赖该设置命名空间。

## 5. 实测结果（0.1.7-rc.1）

- 撤回按钮回到用户气泡，控制台 **0 error**
- 插件列表的「官方」分组只列官方插件，本插件落在「已安装」→ 自己的 bundle 页面，并带有 Configure 控件
- 该控件打开的行页面 = 图标 + 标题 + 一行描述 + 配置表单**直接铺开**，无嵌套折叠
- 仓库自带 4 组测试全通过

## 可行动项
1. 已修复并实测，可直接并入
2. 若官方再调图标命名，`pickIcon` 的空组件兜底能避免同类崩溃复发
3. **未逐一实测**：`conversation.createDraftImages / resolveImage`、`inputActions.addImages`
   —— 其属主包不在本次核对范围内，不能从"没搜到"推断"已移除"。图片附件重发链路建议在 0.1.7 上补一次实测。
