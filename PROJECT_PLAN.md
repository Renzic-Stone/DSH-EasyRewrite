# dsh-bubble-edit · 项目规划（流程 / 架构 / 规范 / git 工作流）

> 版本：PLAN v1（待用户审核）｜ 配套：DESIGN.md（v0.4，需求与交互设计）｜ 宿主：dsh web rc.6

---

## 1. 目标回顾

在 DSH Web 中实现用户消息气泡的**内联编辑（rewrite）**与**撤回**：

- rewrite：单击气泡原位编辑（原始 Markdown 原文、三档宽度、自动增高+滚动），右下角「取消/确定」（dsh 原生风格）；确定 = truncate 编辑重发（附件保留）。
- 撤回：复制键旁撤回键 → 气泡下行内胶囊确认条 → 文本回填 + 「正在修改」条（灰分割线/标签/圆形×）→ **发送时**才真正执行撤回+发送。
- 原则：**惰性提交**（context 只在确定/发送时变）、草稿按会话持久化（超 2 分钟自动备份本地文件、处理完删除）、单会话单待定、三视觉模式、`< X >` 版本翻页器（视口不跳）、旧会话归档可恢复、快捷键可自定义、设置页全套。
- 完整需求与交互见 [DESIGN.md](DESIGN.md)（v0.4，20 项决策）。

---

## 2. 插件开发规范要点（已查证官方来源）

> 来源：官方 `docs/cookbook/extension-cookbook.md`、`docs/cookbook/adding-a-package.md`、
> `packages/client/AGENTS.md`、`docs/cordis-tutorial`；社区范本 dsh-auto-collapse / dsh-message-edit / dsh-webchatlike。

### 2.1 包结构与接线（第三方 out-of-tree 双面插件）

| 项 | 规范 |
|---|---|
| 包名 | `dsh-bubble-edit`（社区惯例无 scope；若发布 npm 需唯一） |
| `package.json` | `type: module`；`main: lib/index.js`；`exports["."]` → `lib/index.js`；`exports["./client"]` → `lib/client.js`；`exports["./package.json"]` |
| `dsh.bundle.patch` | `./cordis.patch.yml`（profile 组合层挂载） |
| `dsh.client` | `{ platform: "web", inject: [需用到的客户端服务] }`——inject 名单即依赖声明，拿不到未声明的 ctx 面 |
| `cordis.patch.yml` | `- insert: [{ id: dsh-bubble-edit, name: dsh-bubble-edit }]` |
| `files` | `lib` + `cordis.patch.yml` + README（不发布 src/构建产物外的杂物） |
| host half | 纯 Node ESM：`export const name / inject / apply(ctx)` |
| client half | 浏览器 bundle：`window.__ModuleLoader__.load({ id, factory })`，factory 返回 `{ name, inject, apply }` |
| 依赖 | 只用 `inject` 声明的宿主服务；不新增 npm 运行时依赖（或 peerDependencies + 宿主提供） |

### 2.2 客户端纪律（client AGENTS 提炼，写 client 代码必须遵守）

1. **组合唯一 API**：`ctx.slots.register({ name, children?, store?, inject? }, Component)`；渲染的插槽必须在自己 register 的 `children` 里声明（声明=授权）；插槽名 `<domain>.<entry>.<hole>`。
2. **组件 props 四份来源**：runtime（useSession/sessionId 等框架钩子）/ renderSlots（children）/ store（useStore/actions）/ inject 面——组件不手写 hook、不摸 ctx、不看 React context。
3. **实时数据三通道**：父级知道 → owner props；只有自己知道 → 本地 state；跨条目/跨重挂载 → **声明式 store**（`createXXXStore()` 工厂，非模块级单例；读 `useStore`、写 `actions.*`）。
4. **导出纪律**：client 入口只导出 cordis 需要的（apply/inject/Config）与 store 工厂类型；实现组件/工具/常量保持内部。
5. **ctx 纪律**：ctx 只属于 apply 世界；业务组件通过 props 拿数据，绝不 import 服务类。
6. **分层红线**：业务数据在对象层（runtime，React-free）；渲染机制在 shell；我们的包只写"表现组件 + 业务逻辑经 store/inject 流入"。
7. **keyed 覆盖**：`conversation.chat.node` 的 `user` key 用 `priority: -1` 覆盖官方渲染器（rc.6 已验证机制，M0 实测）。
8. **设置页**：`settingsScope` + host 端命名空间白名单（参照 dsh-matrix-rain 的 `WEB_SETTINGS_NAMESPACES` 补丁做法，或经插件自己的 host 路由读写）。

### 2.3 Cordis 生命周期

- 插件 = `apply(ctx)`；`ctx.effect(fn, label)` 立即执行 fn 并把返回值当卸载清理（dsh-auto-collapse 同款）。
- `inject` 声明服务依赖，加载器按声明等待服务就绪。
- 配置用 schemastery 校验，`Config` 导出。

### 2.4 命名与角色（adding-a-package 提炼）

- 单一职责插件一个包；我们就是"一个包、两半（host/client）"。
- 内部角色命名遵循后缀语义：`pendingStore`（Store：快照/CRUD）、`forkEngine`（Engine：状态化执行）、`boundaryResolver`（Resolver：定位回合边界）、`pagerStore`（版本树 Store）等。

---

## 3. 架构规划

### 3.1 总体架构

```
┌─────────────────────────── dsh web 浏览器页面 ───────────────────────────┐
│  client half（lib/client.js，__ModuleLoader__ 自注册）                    │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────────┐ ┌───────────────┐  │
│  │ UserBubbleView│ │ RecallBanner │ │ VersionPager  │ │ SettingsPage  │  │
│  │ display/      │ │ 「正在修改」条│ │ < X > 翻页器  │ │ 设置项 UI     │  │
│  │ confirming/   │ │ + 视觉三模式 │ │ + 视口锚定    │ │               │  │
│  │ editing/      │ └──────────────┘ └───────────────┘ └───────────────┘  │
│  │ recall-pending│                                                        │
│  └──────┬───────┘                                                        │
│         │ pendingStore(按会话) · versionTreeStore · 发送钩子(composer)    │
│         │ localStorage + 超时备份触发                                      │
└─────────┼────────────────────────────────────────────────────────────────┘
          │ 同源 HTTP（/bubble/*）
┌─────────┴────────────────────────── dsh host 进程 ───────────────────────┐
│  host half（lib/index.js，Cordis 插件）                                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │
│  │ /bubble/recall│ │ /bubble/edit │ │ /bubble/backup│ │ forkEngine       │ │
│  │ 路由          │ │ 路由          │ │ * 备份写删    │ │ 边界定位→fork→   │ │
│  │              │ │              │ │              │ │ flush→newId     │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────────┘ │
│  依赖服务：sessions / agents / sessionPersistence / webServer             │
└───────────────────────────────────────────────────────────────────────────┘
```

### 3.2 目录结构

```
plugins/dsh-bubble-edit/            ← git 仓库根（本地仓库，无远程）
├── package.json                    # dsh.bundle.patch + dsh.client + exports["./client"]
├── cordis.patch.yml                # profile 挂载层
├── PROJECT_PLAN.md                 # 本文档
├── DESIGN.md                       # 需求与交互设计（v0.4）
├── docs/
│   ├── api-facts.md                # rc.6 API 事实清单（已验证 ✅ / 待验证 ⚠️ / 不存在 ❌）
│   └── m0-verify.md                # M0 冒烟结论（每项：方法/结果/证据）
├── lib/
│   ├── index.js                    # host half：路由 + forkEngine + 边界 + 备份
│   └── client.js                   # client half：四态气泡 + pending + 发送钩子 + 翻页器 + 设置
├── tests/
│   ├── smoke-host.mjs              # 路由成功/错误路径、边界、busy、备份写删
│   └── smoke-client.mjs            # 状态机、胶囊、取消/确定/撤回、pending 恢复、翻页器、视口锚定
├── CHANGELOG.md
├── README.md
└── .gitignore                      # node_modules/ *.log *.tgz backups/ .DS_Store
```

### 3.3 模块职责

**host half（lib/index.js）**
| 模块 | 职责 | 依赖服务 |
|---|---|---|
| `routes` | /bubble/recall、/bubble/edit、/bubble/backup、/bubble/backup/delete（同源，校验+错误码） | webServer |
| `boundaryResolver` | 定位 targetSeq 之前的最后闭合 turn 边界 | sessions / sessionQuery |
| `forkEngine` | 边界处 fork 新版本（sessions.fork 优先，agents.create({seed,meta}) 备选）→ flush → newId | sessions / agents |
| `backupService` | pending 超时备份写 `$DSH_HOME/dsh-bubble-edit/backups/<sid>.json`、处理完成后删除 | fs |

**client half（lib/client.js）**
| 模块 | 职责 |
|---|---|
| `UserBubbleView` | 覆盖 user keyed 渲染器；display / confirming（确认胶囊）/ editing（三档宽度）/ recall-pending（三视觉模式）四态 |
| `pendingStore` | 按会话的 pendingOp（edit/recall）：draftText、originalDraft、mode、visualHide、updatedAt；localStorage 持久化 + 超时备份触发 |
| `RecallBanner` | 「正在修改」条（灰分割线/左上标签/右上圆形×） |
| `sendHook` | composer 提交路径拦截：存在 pending recall → 先 POST /bubble/recall 再提交（M0 验证落点） |
| `versionTreeStore` | 版本树（localStorage，按会话家族根）：血缘 + 序号 X；< X > 切换 = sessions.open + 视口锚定 |
| `settings` | 设置页（rewrite 开关/二级撤回键/编辑宽度/确认开关/视觉模式/快捷键/覆盖合并/备份阈值） |

### 3.4 关键数据流

- **pending 生命周期**：发起（点撤回→确认胶囊→确定 / 点气泡→编辑）→ 本地 pendingStore（按会话）→ 切会话保留 → 超 2 分钟 host 备份 → 处理（发送/确定 = host 真正修改并清除；取消/× = 本地清除，恢复原样）→ 删除备份。
- **版本树**：每次 edit/recall 成功得到 `newId` → 登记 versionTreeStore（parent → child 链，X 递增）→ `< X >` 切换兄弟版本 → `sessions.open` + scroll anchoring（`data-chat-anchor-key`）。
- **回填**：recall 确认 → 原文（覆盖/合并策略）→ `input.setDraft`；覆盖模式 originalDraft 暂存，发送/取消后恢复显示。

### 3.5 组件树与 slot 接入点

```
conversation.chat.node (keyed, key="user", priority:-1)   ← 覆盖官方
└── UserBubbleView
    ├── BubbleText            （display：官方气泡外观 + hover 操作区[复制键/撤回键/(rewrite 关时)编辑键]）
    ├── ConfirmCapsule        （confirming：灰胶囊文本 + 白底黑字「确定/取消」）
    ├── BubbleEditor          （editing：textarea 三档宽度 + 「取消/确定」；操作区隐藏复制键保留撤回键）
    └── PendingMask           （recall-pending：极简=隐藏；简单/信息=灰字「正在修改此处文本」→点击展开灰字原文）

conversation.chat.assistant-actions (list slot，官方公开)  ← M0 验证挂载点
└── VersionPager < X >        （回答底部操作区追加）

conversation.input / composer 提交路径                    ← 发送钩子（M0 验证）
settings.section（或 settings.general.item）              ← 设置页
```

### 3.6 契约（host API）

| 方法 | 路径 | 请求 | 成功 | 错误 |
|---|---|---|---|---|
| POST | /bubble/recall | {sessionId, targetSeq} | {ok,newId} | session-not-found / agent-busy / no-boundary / invalid-target |
| POST | /bubble/edit | {sessionId, targetSeq, newText, attachments?} | {ok,newId} | 同上 |
| POST | /bubble/backup | {sessionId, pending} | {ok} | io-failed |
| POST | /bubble/backup/delete | {sessionId} | {ok} | — |

---

## 4. 制作流程（Phase 0 → 5）

| 阶段 | 目标 | 主要交付物 | 完成标准 |
|---|---|---|---|
| **P0 准备** | 仓库与文档基线 | git init、.gitignore、README、CHANGELOG、PROJECT_PLAN、docs/api-facts.md | 骨架可提交；规范要点落库 |
| **P1 M0 验证** | 五个关键 API/插槽可行性 | docs/m0-verify.md 结论；冒烟脚本 | 五项全出结论（可行/替代方案）；tag m0-verify |
| **P2 M1 撤回** | 撤回最小闭环 | host recall 路由；撤回键+确认胶囊+回填+「正在修改」条+三视觉模式；发送钩子 | smoke-host/client 通过；tag m1-recall |
| **P3 M2 编辑** | 编辑最小闭环 | host edit 路由（truncate+附件）；编辑态（三档宽度/取消确定）；编辑态操作区 | smoke 通过；tag m2-edit |
| **P4 M3 打磨** | 体验完整性 | < X > 翻页器+视口锚定；超时备份；覆盖/合并；快捷键；设置页；zh/en；防误触；边界回归 | 全量回归通过；tag m3-polish |
| **P5 M4 发布** | 可安装可用 | npm 包检查与发布 v0.1.0；本机 dsh plugin add 安装验证；README 终稿 | 全新环境安装成功；tag v0.1.0 |

---

## 5. git 工作流约定（本地仓库，不使用 GitHub）

- **仓库位置**：`plugins/dsh-bubble-edit/`（独立本地仓库；不关联、不 push 任何远程）。
- **分支模型**：
  - `main`：始终可发布/可演示的基线；
  - 每阶段一个 feature 分支：`feat/m0-verify`、`feat/m1-recall`、`feat/m2-edit`、`feat/m3-polish`；
  - 阶段完成 → `git merge --no-ff` 回 main → 删除 feature 分支。
- **提交规范**（Conventional Commits，描述用中文）：
  - `feat(recall): 新增行内确认胶囊` / `fix(pager): 切换版本时视口跳位` / `docs(plan): …` / `test(m1): …` / `chore: …`
- **里程碑 Tag**（annotated）：`m0-verify` → `m1-recall` → `m2-edit` → `m3-polish` → `v0.1.0`。
- **提交前检查**：`node --check lib/*.js` 语法校验；冒烟测试通过；CHANGELOG 同步。
- **回滚**：`git revert`（不改写历史）；备份目录（~/.dsh/dsh-bubble-edit/backups）永远不进仓库。
- **每阶段收尾**：合并 main → 打 tag → 更新 CHANGELOG → 文档与代码同步核对。

---

## 6. 风险与 M0 验证项（先行）

| # | 验证项 | 影响 | 备选方案 |
|---|---|---|---|
| V1 | `conversation.chat.node` user keyed `priority:-1` 覆盖渲染 | 全部 UI 的前提 | 官方渲染器旁路注入（DOM 增强） |
| V2 | `sessions.fork` + turnOrder/locations 边界定位 | 编辑/撤回的 host 核心 | `agents.create({seed,meta})` 事务缝 |
| V3 | `input.setDraft` 回填 | 撤回回填 | 无（已存在，冒烟确认） |
| V4 | composer 发送钩子（发送时执行撤回） | 「发送时真正修改」落点 | 输入框 dock 提交拦截 / 发送按钮旁追加动作 |
| V5 | `conversation.chat.assistant-actions` 插槽挂 < X > | 翻页器位置 | 覆盖 assistant 渲染器追加（更重） |

---

## 7. TODO 清单（待用户审核）

### Phase 0 · 准备与仓库（feat: 在 main 上直接做）
- [ ] 0.1 git init + .gitignore + README + CHANGELOG + 目录骨架
- [ ] 0.2 PROJECT_PLAN.md（本文档）与 docs/api-facts.md 落库

### Phase 1 · M0 可行性验证（feat/m0-verify）
- [ ] 1.1 冒烟①：user keyed priority:-1 覆盖渲染自定义气泡
- [ ] 1.2 冒烟②：sessions.fork + 回合边界定位
- [ ] 1.3 冒烟③：setDraft 回填
- [ ] 1.4 冒烟④：composer 发送钩子落点（含备选评估）
- [ ] 1.5 冒烟⑤：assistant-actions 插槽追加 < X > 控件
- [ ] 1.6 m0-verify.md 结论 + tag m0-verify + 合并 main

### Phase 2 · M1 撤回 MVP（feat/m1-recall）
- [ ] 2.1 host：/bubble/recall 路由（校验/边界/fork/flush）
- [ ] 2.2 client：撤回键 + 行内确认胶囊（灰胶囊 + 白底黑字按钮）
- [ ] 2.3 client：pendingStore + 三视觉模式 + 「正在修改」条 + × 取消
- [ ] 2.4 client：发送钩子接入（先 recall 再发送）
- [ ] 2.5 smoke 测试 + tag m1-recall + 合并 main

### Phase 3 · M2 编辑 MVP（feat/m2-edit）
- [ ] 3.1 host：/bubble/edit 路由（truncate + 附件透传）
- [ ] 3.2 client：编辑态（三档宽度、自动增高、内部滚动）+ 取消/确定
- [ ] 3.3 client：编辑态操作区（隐藏复制键、保留撤回键）
- [ ] 3.4 smoke 测试 + tag m2-edit + 合并 main

### Phase 4 · M3 打磨（feat/m3-polish）
- [ ] 4.1 < X > 版本翻页器 + 视口锚定（不跳位）
- [ ] 4.2 草稿超时备份（host /bubble/backup* + 处理完成删除）
- [ ] 4.3 覆盖/合并模式 + 原草稿恢复 + 快捷键录制
- [ ] 4.4 设置页全套 + zh/en 文案 + 主题令牌 + 防误触 + 边界用例
- [ ] 4.5 全量回归 + tag m3-polish + 合并 main

### Phase 5 · M4 发布（main）
- [ ] 5.1 npm 发布前检查（files/peerDeps/版本）并发布 v0.1.0
- [ ] 5.2 本机 dsh plugin add 安装验证 + README 终稿 + tag v0.1.0

**审核重点**：阶段划分是否合理？每阶段交付物是否够？git 分支/tag 约定是否满意？TODO 粒度是否合适？
