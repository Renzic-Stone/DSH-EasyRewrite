# Changelog

本插件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [1.2.4] — 极限场景体验：失败可见提示 + 首条消息预检 + 测试覆盖

- **失败可见提示**：撤回发送 / 编辑确定失败（no-boundary / turn-open / 其他）时，输入区上方 / 编辑态内显示三语错误原因（5s 自动消失）——不再点了没反应
- **首条消息预检**：会话第一条 user 消息（含截断会话）点击撤回 / 进入编辑时直接提示，不再发请求撞 409
- **极限场景测试**：smoke 扩展至 10 项（截断会话首条、未闭合回合、首回合已闭合不误报、闭合回合正常边界、未知会话）
- resolveBoundary 加入 __test 导出

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
