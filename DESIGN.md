# dsh-bubble-edit · 用户气泡「内联编辑 + 撤回」插件设计文档

> 状态：设计 v0.4（已整合用户 20 项决策：5 + 5 + 10）｜ 目标宿主：DeepSeek Harness（dsh）Web profile（rc.6）
> 定位：双面（host + client）bundle 插件，纯官方扩展点实现，不改 DSH 源码。

---

## 1. 项目概述

为 DSH Web 聊天界面提供**用户消息气泡的编辑与撤回**能力，交互完全围绕"气泡"本身：

- **功能 A · 气泡 rewrite（内联编辑）**：点击气泡原位进入编辑模式（textarea 预填原始 Markdown 原文），
  右下角「取消」「确定」；取消原样不变，确定才真正修改 context（编辑重发，truncate）。
- **功能 B · 撤回**：复制键旁「撤回」键 → 气泡下方**行内胶囊确认条** → 确认后文本回填输入框并显示
  「正在修改」条；真正修改发生在**发送**时。撤回重发后，对应回答底部出现 **`< X >` 版本翻页器**。

**核心设计原则：惰性提交** —— 一切 context 修改只发生在「确定」（rewrite）或「发送」（撤回）两个动作上；
点击进入编辑、点撤回键本身都只是本地草稿态。

---

## 2. 需求规格（v0.4 · 用户确认版）

### 2.1 功能 A：气泡 rewrite（内联编辑）

| 项 | 规格 |
|---|---|
| 触发 | 单击用户消息气泡（显示模式）；受设置「气泡框 rewrite」控制（默认开） |
| 关闭后 | 编辑入口移到 hover 操作区（复制键旁）的**编辑键**，此时编辑键与撤回键**同时显示** |
| 编辑态 | 气泡内容变为 textarea，预填该消息**原始 Markdown 原文**（含格式符号，改完重发格式不丢） |
| **编辑宽度** | 设置项「**气泡框编辑宽度**」三档可调：① 原气泡宽度 ② **自动换行宽度（默认）**——与内容区一致（已查证：`--dsh-chat-content-width = 748px`，约 36 个全角字符）③ 输入框宽度；**所有挡位自带自动增高 + 内部滚动** |
| 操作区 | 编辑态右下角「取消」「确定」——**dsh 原生风格**（灰蓝配色、圆角倒角，复用官方 Button 组件与 --dsw-* 令牌） |
| 编辑态操作区 | 气泡下方的**复制/撤回键区域保留，隐藏复制键、保留撤回键**（编辑态可直接点撤回键转撤回，见 3.3） |
| 附件 | 目标消息带附件时：**保留附件，连同修改后的文本一起重发** |
| 取消 | 退出编辑态，气泡恢复显示原文，不产生任何会话/文件变更；Esc 等效取消；Ctrl/Cmd+Enter = 确定 |
| 确定 | 真正修改 context：**编辑重发（truncate）**——见 2.3 |
| 惰性提交 | 编辑中（未按确定）关闭 dsh → context 完全不变 |
| 草稿持久化 | 编辑内容按会话（sessionId）保存；切走再切回，编辑进度原样接续；超时备份见 5.1 |
| 运行约束 | 智能体运行中（该回合进行中）禁用编辑与撤回 |
| 防误触 | 存在文本选区或点击链接时不进入编辑态 |

### 2.2 功能 B：撤回

| 项 | 规格 |
|---|---|
| 位置 | 用户气泡 hover 操作区，复制键旁「撤回」键 |
| 范围 | **不限制**——任何一条用户消息都能撤回（删多少由确认条里的数量提示把关） |
| **确认 UI（行内胶囊）** | 点撤回键后，**在原用户气泡下方（撤回/复制键位置）**出现长条形**灰色胶囊**（dsh 设计语言），内直接包裹文本：`撤回这条消息及其后 x 条内容？`（纯文本，不再套框）+ 「确定」「取消」两个**白底黑字小胶囊按钮**；按钮与胶囊边框间距按 dsh 间距规范（如 gap 8px / padding 8px 16px） |
| 确认后 | 文本回填输入框；与已有草稿的关系由设置决定（**覆盖 / 合并**，默认覆盖） |
| 覆盖模式 | 原草稿暂存，**发送/取消后都恢复显示原草稿**（任何情况下不丢信息） |
| 「正在修改」条 | 回填后输入框**向上扩展一点、文本位置不变**，文本上方一条**灰色分割线**，左上角「正在修改」标签，右上角**圆形带 × 小按钮**（dsh 风格）；× = 取消（恢复原样） |
| 视觉模式（设置，默认极简） | ① **极简**：气泡及后续 context 无痕隐藏；② **简单**：气泡保留但文字变灰「正在修改此处文本」，后续 context 全部隐藏；③ **信息**：气泡变灰，后续 context 保持显示。均仅显示层过滤 |
| 灰字气泡点击 | 简单/信息模式下，点击灰字气泡 → **展开原文预览**（原文以灰色字体显示——对应深/浅模式下正常字体的灰色调），再次点击收起 |
| 惰性提交 | **真正修改发生在发送时**：发送 = 先执行撤回（截断该消息及后续）再发送新文本；撤回待定中关闭 dsh → context 完全不变 |
| 未修改直接发送 | **一字未改也正常执行撤回+重发**，不做额外判断 |
| **版本翻页器** | 任何撤回重发后，**该次问询对应的回答底部**（原本有复制/fork 等键的 UI 区）追加 **`< X >`** 控件（X = 版本序号 / 重试次数）；点击左右箭头（或键盘 ←/→）切换显示不同版本，**后续上下文跟随所显示版本变动** |
| 版本切换视口 | 切换版本时**保持文本位置不动**——不得出现"一点击就跳到很下面的位置"（尤其撤回的不是最后一段对话时）；实现须做滚动锚定 |
| 草稿持久化 | 回填内容（含「正在修改」态）按会话保存；超时备份见 5.1 |
| 限制 | 撤回仅文本回填（图片/附件不回填）；附件消息的**编辑**保留附件（2.1） |

### 2.3 编辑重发语义（truncate）

rewrite 确定后，**修改后的消息即最后一次发送**：

- 例：用户消息 m1 → m2（倒数第二）→ m3（最后）。编辑 m2 并确定 → 新对话 = m1 之前的历史 + m2'（修改后）+ 重跑的新回复；**m3 及其后续默认不存在**。
- 实现：截断到目标消息之前的闭合回合边界 → fork 新版本 → 以新文本重跑。

### 2.4 设置项（完整清单）

| 设置 | 默认 | 说明 |
|---|---|---|
| 气泡框 rewrite | 开 | 点击气泡原位编辑；关闭后编辑入口移到 hover 操作区编辑键 |
| 关闭气泡框编辑时显示撤回键（二级） | 开·锁定 | 仅在「气泡框 rewrite」关闭时变为可编辑；默认锁定为开，防误关撤回键 |
| **气泡框编辑宽度** | 自动换行宽度 | 原气泡宽度 / 自动换行宽度（748px ≈ 36 全角字符）/ 输入框宽度；均自带自动增高+内部滚动 |
| 撤回确认（胶囊条） | 开 | 关掉则点撤回键直接回填，不出现确认胶囊 |
| 撤回视觉模式 | 极简 | 极简（无痕隐藏）/ 简单（气泡灰字+隐藏后续）/ 信息（气泡灰字，后续保留） |
| 撤回快捷键 | ⌘/Ctrl+Z | 可自定义录制；输入框未聚焦且最近一条为用户消息时生效 |
| 回填冲突模式 | 覆盖 | 覆盖 / 合并；覆盖模式下原草稿发送/取消后恢复显示 |
| 草稿超时备份 | 2 分钟 | 待定草稿停留超时自动备份到本地文件（见 5.1），处理（发送/取消）后删除 |
| （继承）编辑重发级联 | truncate | 本期固定 truncate |

---

## 3. 交互流程与状态机

### 3.1 气泡状态机（功能 A）

```
               单击气泡（防误触通过，rewrite 开关开）
   ┌─────────┐ ───────────────────────────► ┌──────────┐
   │ display │                              │ editing  │  textarea 预填原始 md 原文
   └─────────┘ ◄─────────────────────────── └──────────┘
        │  ▲           ┌──────────────────────────┐  │  │
        │  │ Esc/取消   │ 编辑态操作区：撤回键保留，│  │  │ 确定
        │  │（原样）     │ 复制键隐藏                │  │  ▼
        │  │           │ （点撤回 → 转撤回流程）    │  ┌──────────────┐
        │  └───────────┘                          │  │ submitting   │ POST /bubble/edit
        │                                        └──┘ └──────────────┘
        ▼                                             │ 成功
   切走再切回：编辑内容按 sessionId 恢复         打开新版本（历史 + 新文本 + 重跑）
```

### 3.2 撤回时序（功能 B · 两阶段惰性提交 + 版本翻页）

```
User          Client(half)                              Host(half)           输入框 / 会话
 │ 点「撤回」键  │                                          │                    │
 │ ──────────► │ 气泡下方出现灰色胶囊确认条：                    │                    │
 │             │  "撤回这条消息及其后 x 条内容？ [确定][取消]"      │                    │
 │ 取消        │ → 胶囊消失，原样不变                            │                    │
 │ 确定        │                                          │                    │
 │ ──────────► │ ① pending{type:recall,…}（localStorage+超时备份）│                    │
 │             │ ② 按视觉模式显示（默认极简：无痕隐藏气泡及后续）    │                    │
 │             │ ③ 回填输入框（覆盖/合并按设置）+「正在修改」条      │                    │
 │ 按 ×        │ → 清除 pending · 恢复显示 · 输入框恢复原草稿      │                    │
 │ 按 发送      │── 发送钩子：存在 pending recall ──► POST /bubble/recall │
 │             │                              │──► fork(目标消息之前) 新版本   │
 │             │ ◄── ok, newId ──────────────│                    │
 │             │ 打开新版本 + 以回填文本发送新消息                  │
 │             │ 回答底部出现 < X > 版本翻页器（X=重试次数）        │
 │ 点 < / >    │── sessions.open(兄弟版本) + 滚动锚定（视口不动）───► 后续上下文跟随版本变动
```

### 3.3 编辑与撤回的关系（Q9 决策）

用户判断：编辑与撤回本质是同一件事（都是修改 context）。因此：

- 编辑态下，气泡下方操作区**保留（复制/撤回键区域），隐藏复制键、保留撤回键**；
- 编辑中点撤回键 = 丢弃当前编辑草稿，直接进入撤回流程（确认胶囊）；
- 同一会话**同时只允许一个待定操作**（编辑中 或 撤回待定，二选一），发起新的待定前先处理前一个。

---

## 4. 技术方案

### 4.1 插件形态与接线（社区标准双面插件）

- 包名（建议）：`dsh-bubble-edit`。
- `package.json`：`dsh.bundle.patch` → `./cordis.patch.yml`；`dsh.client` →
  `{ platform: "web", inject: ["@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-client-ui-conversation", "@deepseek-ai/dsh-client-ui-primitives", "@deepseek-ai/dsh-api-remotes"] }`；
  `exports["./client"]` → `lib/client.js`（`window.__ModuleLoader__.load` 自注册 IIFE）。
- `cordis.patch.yml`：`- insert: [{ id: dsh-bubble-edit, name: dsh-bubble-edit }]`。
- 安装：`dsh plugin --profile web add <dir|npm|github:…>`；重启 `dsh web` 生效。

### 4.2 渲染层：覆盖官方 user 渲染器（已验证可行）

- 官方 `conversation.chat.node` keyed 槽 `key: "user"` → `UserMessageNodeView`；本插件以
  **`priority: -1`** 注册同 key 条目覆盖（rc.6 已验证；`dsh-recall` 同款做法）。
- 自定义 `UserBubbleView` 状态：display / confirming（确认胶囊）/ editing / recall-pending（三视觉模式）。
- 版本翻页器 `< X >`：挂在 assistant 回答底部操作区（复用官方回复操作区位置，追加控件）。
- 编辑宽度三档通过行内样式切换 `max-width`（档位 2 默认 = `var(--dsh-chat-content-width)`，748px）。

### 4.3 待定状态与草稿持久化（client half）

- 结构：`pendingOp = { type: "edit" | "recall", sessionId, targetSeq, draftText, originalDraft, mode, visualHide, updatedAt }`。
- 存储：`localStorage`（键 `dsh-bubble-edit:pending:<sessionId>`），按会话隔离。
- **超时备份（Q5 决策）**：`updatedAt` 距今超过设置阈值（默认 2 分钟）仍未处理 →
  自动把 pending 完整序列化**备份到本地文件**（host 端 `~/.dsh/dsh-bubble-edit/backups/<sessionId>.json`，
  经 host 路由写入）；**发送或取消（处理完成）后删除备份文件**；未处理的备份在会话恢复时提示可导入。
- 会话切换恢复：打开会话时若存在该会话 pending → 恢复编辑态 / 「正在修改」态。
- 发送钩子（M0 验证项）：composer 提交路径检查当前会话 pending recall → 先 `POST /bubble/recall` 再提交。

### 4.4 版本翻页器（< X >）

- 数据：`versionTree` 存 localStorage（按会话家族根命名空间，参考 dsh-webchatlike 的做法）：
  每个版本 = 一个真实 fork 会话（撤回/编辑产生的 `newId`），记录血缘与序号 X（重试次数）。
- 切换：`sessions.open(兄弟版本Id)`；**滚动锚定**——切换前记录当前视口顶部对应的消息锚点
  （`data-chat-anchor-key`），切换后恢复该锚点位置（scroll anchoring），保证"文本位置不动"。
- 渲染：回答底部操作区追加 `< X >`（左箭头 + 序号 + 右箭头），X 从 1 起递增。

### 4.5 host 协议（真正修改只发生在这里）

| 方法 | 路径 | 请求体 | 成功响应 | 错误码 |
|---|---|---|---|---|
| POST | `/bubble/edit` | `{ sessionId, targetSeq, newText, attachments? }` | `{ ok: true, newId }` | `session-not-found` / `agent-busy` / `no-boundary` / `invalid-target` |
| POST | `/bubble/recall` | `{ sessionId, targetSeq }` | `{ ok: true, newId }` | 同上 |
| POST | `/bubble/backup` | `{ sessionId, pending }` | `{ ok: true }` | 写盘失败 |
| POST | `/bubble/backup/delete` | `{ sessionId }` | `{ ok: true }` | — |

**通用流程（edit/recall）**：
1. 校验：会话存在、非运行中、`targetSeq` 属于用户消息、存在更早的闭合回合边界。
2. 边界：`targetSeq` 之前的最后一个 `turn/end` 闭合点（`turnOrder` / `locations`）。
3. 建新版本：优先 `ctx.sessions.fork`（已验证）；或 `ctx.agents.create({ seed, meta })`（已验证）。
4. edit：`newText`（+附件）作为新回合输入重跑（truncate）；recall：新版本不含目标消息及后续。
5. `ctx.sessions.flush()` 持久化屏障；响应 `newId`，客户端 `sessions.open(newId)` 并登记版本树。

### 4.6 已验证的 API 依赖清单（rc.6 实测）

| API | 位置 | 状态 |
|---|---|---|
| keyed 槽 priority 抢占 | `dsh-client-ui-slots` | ✅ |
| `sessions.fork(opts)` | `dsh-client-runtime` | ✅ |
| `input.setDraft(text)` | `dsh-client-ui-conversation` | ✅ |
| `agents.create({seed,meta})` | `dsh-agent` | ✅ |
| `turnOrder` / `locations.getTurn` | `dsh-client-runtime` | ✅（dsh-web-enhance 实战） |
| `--dsh-chat-content-width`（748px） | `dsh-client-ui-conversation` CSS | ✅（编辑宽度默认档依据） |
| `session/recall` 墓碑协议 | `dsh-session` | ❌ 不存在 → 不依赖（fork 方案替代） |
| composer 发送前钩子（发送拦截） | 待验证（M0） | ⚠️ 决定"发送时撤回"落点 |

---

## 5. 边界情况与限制

| 场景 | 处理 |
|---|---|
| 会话第一条用户消息 | 无更早闭合边界 → 编辑/撤回禁用，按钮置灰并提示 |
| 智能体运行中 | 编辑/撤回禁用（先停止当前回合） |
| 附件消息 | 编辑保留附件重发；撤回仅回填文本（附件不恢复） |
| 撤回待定中关闭 dsh | context 不变；重启后 pending 恢复（localStorage / 超时备份文件） |
| 编辑中关闭 dsh | context 不变；重启后编辑态恢复 |
| 草稿超时（>2 分钟未处理） | 自动备份到 `~/.dsh/dsh-bubble-edit/backups/`；发送/取消后删除备份 |
| 多行文本 / IME | textarea 原生支持；Ctrl/Cmd+Enter 确定 |
| 文本选区/链接单击 | 不进入编辑态（防误触） |
| 同一会话并发待定 | 单待定约束（3.3）；编辑态保留撤回键可直接转撤回 |
| 版本切换视口 | 滚动锚定，保持文本位置不动（尤其撤回非最后一段时） |
| 多标签页 | 各自独立，最后操作者生效（MVP，不跨标签同步） |
| 子代理/steering/上下文注入节点 | 不提供编辑/撤回 |
| 撤回/编辑后的文件变更 | 默认保留（决策①：不回滚） |
| 发送时 recall 失败 | 中止发送，保留 pending 与回填，提示重试 |

---

## 6. 项目结构

```
dsh-bubble-edit/
├── package.json          # dsh.bundle.patch + dsh.client 声明 + exports["./client"]
├── cordis.patch.yml      # profile 组合层插入行
├── lib/
│   ├── index.js          # host half：/bubble/edit、/bubble/recall、/bubble/backup* 路由 + fork/边界逻辑
│   └── client.js         # browser half：UserBubbleView（display/confirming/editing/recall-pending 四态）
│                         #   + pending 持久化与超时备份 + 发送钩子 + 「正在修改」条 + < X > 翻页器 + 设置页
├── tests/
│   ├── smoke-host.mjs    # 路由成功/错误路径、边界判定、busy 拒绝、备份写删
│   └── smoke-client.mjs  # 状态机、确认胶囊、取消/确定/撤回、pending 恢复、翻页器、视口锚定
└── README.md
```

备份目录：`$DSH_HOME/dsh-bubble-edit/backups/<sessionId>.json`（host 维护，处理完成即删）。

---

## 7. 里程碑与验收标准

### 里程碑
- **M0 可行性验证**：keyed 覆盖、fork、setDraft、**发送钩子**四件事的最小冒烟（发送钩子不成立则换
  "输入框 dock 提交拦截"等替代落点，文档同步更新）。
- **M1 撤回 MVP**：撤回键 + 行内确认胶囊 + 回填 + 「正在修改」条 + × 取消 + 三视觉模式 + 发送时真正撤回。
- **M2 编辑 MVP**：点击进入编辑态（三档宽度）、取消/确定、编辑重发（truncate，附件保留）、新版本打开。
- **M3 打磨**：< X > 版本翻页器与视口锚定、超时备份与清理、覆盖/合并模式与原草稿恢复、草稿持久化与恢复、
  防误触、Esc/快捷键、zh/en 文案、主题令牌适配。
- **M4 发布**：npm publish + `dsh plugin --profile web add dsh-bubble-edit` 一键安装文档。

### 验收清单（对应需求）
- [ ] 单击气泡 → 可编辑文本（预填原始 Markdown 原文）；rewrite 关闭后 → hover 编辑键 + 撤回键同时显示
- [ ] 编辑态右下角「取消」「确定」，dsh 原生风格（灰蓝/倒角）；编辑宽度三档可调（默认 748px≈36 全角字符），自动增高+内部滚动
- [ ] 编辑态操作区：复制/撤回键区域保留，隐藏复制键、保留撤回键（可转撤回）
- [ ] 附件消息编辑：保留附件重发
- [ ] 取消/Esc → 原样不变；确定 → truncate 编辑重发（目标消息后全部截断，新会话打开）
- [ ] 复制键旁「撤回」键 → 气泡下方灰色胶囊确认条："撤回这条消息及其后 x 条内容？"+ 白底黑字「确定」「取消」胶囊（按钮与边框间距符合 dsh 规范）
- [ ] 确认后：按视觉模式显示（极简无痕 / 简单灰字+隐藏后续 / 信息灰字+后续保留）；文本回填输入框
- [ ] 简单/信息模式灰字气泡：点击展开灰色原文预览，再点收起
- [ ] 回填后：「正在修改」条（灰分割线 / 左上标签 / 右上圆形×）；× → 恢复原样
- [ ] 覆盖模式下原草稿发送/取消后均恢复显示；合并模式可用（设置切换）
- [ ] **惰性提交**：撤回待定/编辑中关闭 dsh，重启后 context 不变
- [ ] 草稿持久化：切会话进度接续；**超 2 分钟未处理自动备份本地文件，处理完成后删除**
- [ ] 发送时：先撤回（新版本不含该消息及后续）再发送新文本；一字未改也正常执行
- [ ] 撤回重发后：该次回答底部出现 **`< X >`** 翻页器，左右切换版本，后续上下文跟随变动，**视口不跳**
- [ ] 同一会话单待定约束；运行中禁用；首条消息禁用；图片撤回仅文本回填
- [ ] 设置页：rewrite 开关 + 二级撤回键显示（默认开·锁定）+ 编辑宽度三档 + 确认开关 + 视觉模式 + 快捷键 + 覆盖/合并 + 备份阈值

---

## 8. 风险与开放问题

1. **发送钩子可行性（M0 关键）**：composer 提交路径是否有公开拦截点决定「发送时撤回」实现方式；
   备选：输入框 dock 增加"撤回并发送"按钮 / 提交前 DOM 拦截 / host 端发送事件观察。
2. **版本翻页器的会话一致性**：版本树（localStorage）与真实 fork 会话（host）的一致性；
   localStorage 被清理时降级为"仅当前版本可用"。
3. **视口锚定实现**：切换版本后保持文本位置不动的具体方案（`data-chat-anchor-key` + scroll anchoring），
   M3 实测校准。
4. **超时备份的写入/清理时机**：host 路由写盘失败降级为静默；删除备份以"处理完成事件"为准。
5. **keyed 覆盖与官方升级兼容**：官方 `UserMessageNodeView` 改动影响复刻外观 → 官方组件复用 + 回归。
6. **fork 边界精确定义**：多轮/steering/工具链混合时的"最后闭合回合边界"需实测校准。
7. **确认胶囊与官方 hover 操作区的空间冲突**：气泡下方同时存在操作区与胶囊条时的布局需 M1 实测。

---

## 9. 参考实现

| 项目 | 借鉴点 |
|---|---|
| `Moeblack/dsh-message-edit`（29⭐，npm） | 编辑/重生成的分支与 seed 事务、truncate 语义、版本时间线 |
| `cindyguyuehu123/dsh-webchatlike`（6⭐） | `<i/N>` 版本翻页器、localStorage 版本树、fork 公开扩展点 |
| `Mongfayi/dsh-recall`（3⭐） | priority:-1 覆盖 user keyed 渲染器、setDraft 回填 |
| `limbo947/dsh-recall-plugin`（14⭐，npm） | 撤回按钮 UI 位置（复制键旁）、确认面板 |
| `yangzhe1991/dsh-web-enhance`（已装） | turnOrder/locations 回合定位、双面插件接线模板 |
| `dsh-matrix-rain` | settingsScope 命名空间接入参考 |
