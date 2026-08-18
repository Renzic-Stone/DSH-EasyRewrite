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

### Changed
- 项目更名为 dsh-easyrewrite（DSH-EasyRewrite），已发布 GitHub（tag v0.1.0 / m1-recall）
