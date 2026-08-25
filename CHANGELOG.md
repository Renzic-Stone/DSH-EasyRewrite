# Changelog

本插件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [2.1.1] — 撤回/编辑重发保留当前模型与思考挡位

### 修复
- **撤回键与气泡框编辑重发时，输入框内选择的模型/思考强度不再丢失**：此前新会话会回落到全局默认模型——现在重发前自动恢复原会话的选择（走官方 selectModel 通道，与手动切换同源）
- 覆盖三条链路：撤回重发、气泡框编辑确认、首条消息重置（父版本恢复 / 空白新会话）

## [2.1.0] — 🖼️ 带图片消息气泡框编辑完整支持

### 新功能
- **带图片消息的气泡框编辑**：点击带图消息气泡进入编辑后，图片缩略图保持在编辑框上方（官方 Gallery 渲染，支持 lightbox 大图预览）
- 确认编辑后图片随修改文本一并发出——与撤回键路径共享同一套桥接链路

## [2.0.2] — 紧凑/标准档高度修正

- 编辑框行数下限 3 行 → **1 行**：短消息打开编辑框不再凭空多出几行——严格贴合原气泡大小
- 删除 textarea 最小高度 44px；输入时高度实时自适应内容（换行/删除即时跟随）

## [2.0.1] — 编辑宽度三档手感修正

- 紧凑（compact）：严格以气泡原宽起步——打开编辑框不再改变当前大小；随打字按内容需要慢慢扩大（上限 360px）
- 标准（standard）：与紧凑唯一区别——内容不满一行时自动扩成一行宽
- 两档超过一行后保持宽度不再主动扩张（高度自然换行）
- 内容宽度估算改为 CJK 感知（全角 ≈14px / 半角 ≈8px），中文场景"跟随打字扩大"不再滞后

## [2.0.0] — 大规模重构 · 带图片消息 Rewrite 完整支持

### 🚀 大规模重构
- 重构核心代码逻辑与数据流：极大减少性能开支和自有库依赖——更轻、更快、更好用
- 移除多套自建冗余机制（内存缓存 / DOM 扫描 / 中转路由），全面改用 DSH 官方原生通道

### 🖼️ 带图片消息 Rewrite 完整支持（撤回键路径）
- 确认后图片预览直接进入输入框：可删除、可新增
- 发送时精确跟随你的最终选择，与修改后的文本一并发出
- 目前市面竞品完全无同类功能

### ⚠️ 已知限制
- 气泡框编辑暂不支持带图消息（将在下个版本补齐）

### 其他
- 完成 dsh 0.1.1-rc.2 适配核查（支持新多模态模型 DeepSeek-V4-Flash-Vision-Exp）
- 设置页「版本家族」改三层折叠：按对话名分组、条目显示最后对话时间
- 折叠箭头更换为官方风格 SVG 描边图标


## [1.3.6] — 修复 VersionPager 重复 L hook（React #300 复发）

- 长对话场景下 `conversation.chat.assistant-actions` 槽再次崩溃（React #300）：VersionPager 内 `useUILocaleDict()` 残留两份——顶部 hooks 区一份（正确）+ 两个 return null 之后又一份（历史修复残留）→ 渲染路径 hooks 数量 3 vs 4 漂移
- 修复：删除 return null 后的重复声明；全组件扫描确认其余组件均为 1 份
- 连带修复编辑发送延迟/异常（#300 崩溃干扰渲染循环）

## [1.3.5] — README 对比表优化

- 对比表对勾列居中排版；措辞对齐宣传帖广告化风格（"目前市面竞品完全无同类功能"等，三语）

## [1.3.4] — README 差异化对比表

- README 三语新增「与同类插件的差异」对比表（惰性提交 / 无痕替换 / 版本翻页器+归档交换 / 草稿持久化+自动备份 / 附件保留 / 纯官方扩展点 / 三语 / 按需开关）

## [1.3.3] — 描述三语化

- npm / GitHub 描述在用户原版中文基础上补充英文与日文（保留原句，三语并列）

## [1.3.2] — 描述回退为用户原版

- npm / GitHub 描述统一回退为用户最初撰写的中文版（"DSH Web内目前最无感的消息撤回、重编辑插件…"）

## [1.3.1] — 描述回退

- npm / GitHub 描述回退为三语主体（移除修复说明句——该信息保留在 CHANGELOG 各版本条目中）

## [1.3.0] — 内置更新支持（精简版）

- **设置 → 插件配置 → 「更新」组**：显示当前版本 + [检查更新]（手动 get npm 最新版）+ 有新版时一键 [更新]（host 执行 pnpm up，更新完成提示重启生效）
- **每日检查开关（默认关）**：开启后每天自动检测一次，发现新版本时「更新」组标题显示 ⚡ 提示
- host 新增 `/bubble/check-update`（只读查 npm registry）与 `/bubble/update-plugin`（pnpm up，用户显式确认后调用）；自动更新不静默执行——避免坏版本被自动推给用户
- 展开设置卡片时无感触发版本检查（5 分钟节流）；语义化版本比较；撤回待定气泡提示改为「正在修改此处文本（点击查看原文）」强指引

## [1.2.4] — 修复首轮对话撤回报错 + 流式回复打断的撤回逻辑

- **修复了首轮对话撤回时的报错问题**：对对话第一条消息（含截断/分叉会话首条）撤回或编辑不再报错（此前无前置回合边界会 409）——改为**无缝重置**：归档旧对话 → 自动打开空白新会话（家族会话则回到上一次模型回复处）→ 输入框中的修改内容**自动作为第一条发出**，"打错秒撤回"一步到位
- **修复了流式回复被打断时的撤回逻辑**：模型回复未完成（回合未闭合）时撤回/编辑不再卡死——自动识别半截状态并**重置对话、从上次模型回复处重新开始**；失败原因改为可见的三语提示（5 秒消失），不再"点了没反应"
- **崩溃修复**：CopyButton 引用未定义 L（槽崩溃导致撤回键/编辑消失）、VersionPager hooks 顺序（React #300）、isFirstUserMessage 作用域（RecallBanner 不可见）
- **极限场景测试**：smoke 扩展至 10 项（截断会话首条、未闭合回合、首回合已闭合不误报、闭合回合正常边界、未知会话）；resolveBoundary 加入 `__test` 导出

## [1.2.3] — 紧急修复：i18n 改造引入的 hooks 顺序回归

- **VersionPager 崩溃（React #300）**：i18n 改造把 `useUILocaleDict()`（hook）放在了两个 `return null` 之后——家族版本 <2 或非最后回合的渲染路径 hooks 数量漂移 → `conversation.chat.assistant-actions` 槽崩溃 → `< X >` 占位不显示
- 修复：L hook 无条件前置到 hooks 区首位；全组件 hooks 顺序扫描确认无同类问题
- **CopyButton 崩溃（ReferenceError: L is not defined）**：i18n 改造给 CopyButton 的 `useUILocaleDict()` 声明未写入（edit 部分生效）→ 复制键渲染时引用未定义 L → `conversation.chat.node` 槽崩溃 → **撤回键 / 气泡编辑整体消失**（fallback 官方渲染器）；已补声明并全组件核对 L 声明完整性

## [1.2.2] — 可发现性优化（三语门面 + 多语言标签）

- **修复了一些已知的可能影响用户体验的问题**（i18n 语言切换、附件保留、并发与归档竞态等历次修复均随本版及此前版本发布）

- npm/GitHub description 三语（中/英/日）——英文关键词提升国际检索命中（recall/undo/edit）
- package.json keywords 扩充（含 undo/rollback/撤回/バブル編集 等中英日标签）
- README 三语顶部标签行（#撤回 #气泡编辑 #取り消し #多言語 等）
- GitHub topics 保持英文（平台限制不支持中文标签）

## [1.2.1] — 修复 i18n 未生效（inject 缺 locale 服务）

- 1.2.0 的官方 locale 接入失效根因：client inject 数组缺少 `locale` 服务——`ctx.locale` 为 undefined，字典永远回退中文
- 修复：inject 增加 `locale`；`useUILocaleDict` 改用官方 face 的 `getSnapshot()` 方法读取当前语言（`snapshot` 属性不暴露在注入面）
- 现在跟随官方「通用设置 → 语言」切换，即时生效

## [1.2.0] — 官方 i18n 支持（三语全覆盖）

- **接入官方 locale 机制**（dsh-client-locale）：注册 zh/en/ja 字典，跟随官方语言设置，切换语言即时生效（useSyncExternalStore 驱动组件重渲染）
- **UI 硬编码文案全部三语化**：正在修改条 / 编辑确定取消 / 复制与已复制 / 查看原文 / 空消息 / 灰字气泡 / 点击编辑 / 确认胶囊文案（含 {n} 参数模板）与按钮 / 取消撤回
- GitHub topics 增加 i18n / internationalization / multilingual / localization 标签（便于国际用户发现）

## [1.1.0] — 编辑附件保留重发（M4 闭环）

- **图片附件保留**：编辑带图消息 → 确定重发后附件随修改文本一起重发（官方链路：`conversation.resolveImage` 取回会话授权 URL → fetch → `createDraftImages` → `addImages` → 自动发送）
- 附件引用随 resume 数据传递（30s TTL 内重建），新会话挂载时异步重建完成后才发送
- 警告细分：图片附件不再警告（可保留）；仅非图片/未知块才提示「无法保留」
- 撤回场景不变（仅回填文本，附件不回填）

## [1.0.3] — 修复重复对话（归档交换回归）

- **移除 1.0.2 重构误加的卸载清理**：切换 = 组件卸载 → 卸载 effect 清掉归档轮询定时器 → 归档交换失效 → 工作区重复对话。该 bug 曾在 98fcb62 修复，1.0.2 重构时被重新引入，现已删除（竞态防护保留在 goToVersion 内）

## [1.0.2] — 修复 React error #300（hooks 顺序）

- **VersionPager hooks 无条件前置**：此前家族版本 <2 或非最后回合时在 `useRef`/`useEffect` 之前 return null，同一组件实例后续渲染 hook 数量漂移 → `conversation.chat.assistant-actions` 槽崩溃（部分情况 `< X >` 不显示）
- 切换逻辑抽为模块级 `goToVersion`（按钮与键盘共用，键盘事件实时读家族，顺带消除陈旧闭包隐患）
- 全组件 hooks 顺序扫描确认无同类隐患

## [1.0.1] — review 安全与正确性修复

### Security（独立代码审查 S1-S3）
- 会话 id 白名单校验（`/^[A-Za-z0-9-]+$/`，防备份路由路径穿越）
- 全部 host 路由同源守卫（Origin/Referer 与 Host 匹配）+ 强制 JSON Content-Type（防 CSRF）
- archive/unarchive 增加 `sessionKnown` 存在性校验（防污染归档集合）
- recall 500 错误响应脱敏（不回传内部错误消息）
- 请求体超限改 413 语义（不再连接重置）

### Correctness（M1-M11）
- 发送钩子不再劫持「停止生成」按钮；撤回/编辑重发加 in-flight 并发锁（防重复 fork）
- 编辑重发失败恢复编辑态（草稿不丢）；edit/recall pending 交叉互斥
- resume-send 30s TTL（防陈旧草稿幽灵自动发送）；归档 await + catch
- 备份恢复 24h 新鲜度校验（防幽灵恢复）；跨标签页 storage 同步
- 首回合已闭合误报 turn-open → 修正为 no-boundary；编辑带附件消息显示不保留警告
- 渲染期日志清理（VersionPager shown/一次性诊断）；日志去内容化（不落明文）
- 死代码清理（isOpenTurnError/visualHide/__dshBubbleEditDebug）；自定义宽度钳制 1200px

## [1.0.0] — 首个稳定版

1.0 标志着 M1（撤回）/ M2（内联编辑）/ M3（设置页、版本翻页器、快捷键）全部完成并通过用户验收；v0.4.0 之后的内容见下方 Unreleased 历史条目，均已随 1.0.0 发布。

### Added
- 项目骨架：git 仓库、README、CHANGELOG、.gitignore
- 设计文档 DESIGN.md（v0.4：气泡 rewrite + 撤回，20 项用户决策）
- 项目规划 PROJECT_PLAN.md（流程 / 架构 / 规范 / git 工作流，用户已确认）
- docs/api-facts.md：rc.6 API 事实清单
- **M1 撤回闭环**：撤回键 + 行内确认胶囊 + 惰性提交（发送时才真正截断）+ 回填 + 「正在修改」条 + × 取消恢复原草稿 + 覆盖/合并模式 + 后续条数统计（仅用户提问，可开关）+ 单待定约束 + 草稿按会话持久化
- **无痕替换**：撤回发送 = 原会话归档 + 同名新会话顶替 + 修改后文本自动发送（官方 fork RPC）
- **三视觉模式**（默认简单）：极简（无痕隐藏+隐藏后续）/ 简单（灰字+原文预览+隐藏后续）/ 信息（灰字+后续保留）
- **统一日志系统**：client 全链路打点 → host 落盘 `$DSH_HOME/dsh-easyrewrite.log`
- **三语 README**（中文默认 + English + 日本語）
- smoke 测试（tests/smoke-host.mjs）
- **M2 内联编辑（Rewrite）**：点击气泡原位编辑（原始 Markdown 原文）+ 三档宽度（紧凑 360 / 标准 360 / 扩展 748）+ 自动增高滚动 + Esc/Ctrl+Enter + 编辑态保留撤回键（可转撤回）+ 编辑草稿按会话持久化（pending type=edit）+ 「确定」= truncate 编辑重发（边界 → fork → 归档 → 同名新会话 → 自动发送）
- **M3 设置页**：设置 → 插件 → 插件配置可折叠卡片（官方 PluginCard 同款样式与交互：点击标题展开/收起 + 箭头旋转 + aria 无障碍）+ 三语文案 + 全部选项即时生效（气泡编辑开关 / 关闭编辑显示撤回键 / 确认胶囊 / 视觉模式 / 统计口径 / 冲突模式 / 编辑宽度含自定义）+ 移除通用设置页入口行
- **M3 设置 namespace**：host 内联注册 `dsh-easyrewrite` namespace（rc.7 "注册即暴露"；函数式 schema 零官方包依赖，符合官方 host 惯例）
- **M3 草稿自动备份**：待定草稿超 10 秒自动备份本地文件（之后每 5 秒刷新）+ 处理完成即删 + 恢复兜底（仅本地无待定时恢复，绝不覆盖活动草稿）
- **M3 版本翻页器（< X >）**：撤回/编辑重发后最后回答操作区出现 `‹ X/N ›`（官方 assistant-actions 槽，仅最后回合 TurnTail 显示）+ 左右箭头/键盘 ←/→ 切换 + 视口锚定（data-chat-anchor-key）+ **归档交换**（恢复目标 → 打开 → 归档家族其余，列表只留一个活动版本；轮询确认当前会话防竞态）+ host `/bubble/unarchive`、`/bubble/archive` 幂等路由（绕开官方 archiveSession 对非 live 会话的 WorkspaceUnknownSessionError）+ 设置卡片「版本家族」恢复入口（全归档可找回）
- **M3 撤回快捷键（Beta）**：总开关默认关 + 无默认键位 + 录制 UI（至少一个修饰键）+ 触发条件（输入框未聚焦且最近一条为用户消息，等效点击撤回键）
- **M3 设置页视觉升级**：Apple 风格分段控件（灰条+白色药丸+滑动过渡）+ 圆形勾选（白底黑勾，官方 IconCheckOutline16）+ 四大分组（编辑/撤回/回填/版本）+ 层级缩进（每级 16px）+ 大项标题 14px 亮白 + 锁定项置灰不可选 + 快捷键置灰禁用态

### Changed
- 项目更名为 dsh-easyrewrite（DSH-EasyRewrite），已发布 GitHub（tag v0.1.0 / m1-recall）
