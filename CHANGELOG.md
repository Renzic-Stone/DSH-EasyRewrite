# Changelog

本插件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

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
