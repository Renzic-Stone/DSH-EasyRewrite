分享一个 DSH 插件：dsh-easyrewrite —— 气泡内联编辑 + 撤回，无痕替换 + 版本翻页器

MIT 开源 · 一条命令安装 · 已收录进 awesome-dsh-plugin

---

## EasyRewrite是什么

一个 DeepSeek Harness Web 插件：**点击自己的消息气泡就能原位编辑**，点撤回键就能**撤回这条消息及其后的全部内容**——所有修改都是"惰性"的：在你按下「确定 / 发送」之前，对话、模型上下文、会话日志**纹丝不动**。

一句话体验：**像官方功能一样自然**

**安装（npm，一行搞定）：**

```sh
dsh plugin --profile web add dsh-easyrewrite
```

重启 dsh web 即可使用。

📦 仓库：https://github.com/Renzic-Stone/DSH-EasyRewrite
🏷 GitHub topics：`dsh-plugin` `dsh` `deepseek-harness` `bubble-edit` `recall` `rewrite` `version-pager` `i18n` `multilingual`

---

## EasyRewrite为什么值得一试

### 1️⃣ 原版体验，UI 风格贴近原版

- 全部界面沿用 dsh 原生设计语言（官方设计令牌 / 官方图标 / 官方组件），深/浅主题自动适配——**不像"又一个插件皮肤"，像官方自带功能**
- 复制键、hover 时间、气泡外观原样保留，不删、不改、不遮挡
- 撤回后的"无痕替换"：原会话归档 → **同名新会话顶替** → 修改后的文本自动发出——感知上就是"原对话被编辑了"，没有"冒出一个新对话"的割裂感

### 2️⃣ 简单安装，上手即用；预设强大，设置完善

- **一条命令安装**，零配置即可用；默认设置就是大多数场景的最优解
- 三种视觉模式（极简 / 简单 / 信息）预设，满足不同习惯
- 设置页（设置 → 插件 → 插件配置）功能完善、全部自由开关：
  - 气泡编辑开关、编辑宽度（紧凑 / 标准 / 扩展 / 自定义）、编辑时保留撤回键
  - 撤回确认胶囊、统计口径（仅用户提问）、回填冲突模式（覆盖 / 合并）、撤回快捷键（Beta，可录制，默认关不打架）
  - 中 / 英 / 日三语界面与 i18n 支持（跟随官方语言设置，语言切换即时生效），Apple 风格分段控件 + 分组布局

### 3️⃣ 架构克制，越权少，兼容性强

- **只用官方扩展点**：keyed 槽覆盖、官方 fork RPC、官方组件与设计令牌——**不碰源码、不依赖易碎内部 API**，DSH 升级换代主动适配
- 双面插件（host + client）标准接线，**卸载即还原**，不留任何配置残留
- 已通过官方收录流程加入 awesome-dsh-plugin（PR #1793 已合并）

### 4️⃣ 完备的缓存与备份体系，防任何误操作

- 编辑 / 撤回草稿**按会话持久化**：切对话、刷新、重启，进度原样接续
- 草稿超 10 秒自动备份到本地文件（每 5 秒刷新），处理完成即删；异常退出可自动恢复——**任何路径都不丢数据**
- 覆盖模式下原草稿发送 / 取消后都会恢复；每一步关键操作都有确认与撤销路径（确认胶囊、× 取消、单会话单待定约束）
- 统一日志体系：client 全链路打点 → host 落盘本地文件，一次复现即可定位问题

### 5️⃣ 持续更新，开源，社区支持

- 语义化版本 + CHANGELOG，每次改动可追溯；issue / PR 积极响应
- 已迭代 7 个版本，其中包含一次**独立安全审查的 21 项修复**（路由守卫 / 并发锁 / 备份校验等）
- 三语 README（中文 / English / 日本語）

### 6️⃣ 功能相比竞品多出不止一点，且全部可按需开关

| 能力 | dsh-easyrewrite | 其他撤回类插件 |
| --- | --- | --- |
| 气泡原位编辑（Rewrite） | ✅ | 目前市面竞品完全无同类功能 |
| 经典的撤回键（Recall） | ✅ | ✅ |
| 惰性提交（确认后才真正修改 context） | ✅ | 部分直接改 |
| 无痕替换（归档 + 同名顶替） | ✅ | 少见 |
| **版本翻页器 < X >**（切换历史版本） | ✅ | 目前市面竞品完全无同类功能 |
| 草稿超时自动备份 + 异常恢复 | ✅ | 目前市面竞品完全无同类功能 |
| 三视觉模式 / 统计口径 / 覆盖合并 / 快捷键（Beta） | ✅ | 多数单一 |
| 三语界面与 i18n 支持 | ✅ | 多数没有 |

每一项都可以在设置里自由开关——不需要的功能关掉，插件就退回"隐形"状态。

---

## 安装

**推荐（npm）：**

```sh
dsh plugin --profile web add dsh-easyrewrite
```

**或从 GitHub：**

```sh
dsh plugin --profile web add github:Renzic-Stone/DSH-EasyRewrite
```

重启 dsh web 后即可使用：**单击自己的消息气泡 = 编辑；复制键旁的撤回键 = 撤回。**

---

## 社区渠道

- 本帖评论区（可随时反馈）
- GitHub Issues / PR：https://github.com/Renzic-Stone/DSH-EasyRewrite
- npm：`dsh-easyrewrite`（最新 v1.2.0）
- 已收录：awesome-dsh-plugin 列表（session 分类）

有 bug、有想法，欢迎去 GitHub 开 issue——每个反馈都会被看到。

**再贴一次安装命令，方便直接复制：**

```sh
dsh plugin --profile web add dsh-easyrewrite
```

🔗 https://github.com/Renzic-Stone/DSH-EasyRewrite

标签： #dsh #deepseek-harness #插件 #气泡编辑 #撤回 #rewrite #recall #版本翻页器 #i18n #multilingual #开源
