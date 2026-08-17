# dsh-bubble-edit

DSH Web 用户消息气泡「内联编辑（rewrite）+ 撤回」插件。

- **气泡 rewrite**：单击气泡原位编辑（原始 Markdown 原文、三档编辑宽度、自动增高+滚动），
  右下角「取消/确定」（dsh 原生风格）；确定 = truncate 编辑重发（附件保留）。
- **撤回**：复制键旁撤回键 → 气泡下行内胶囊确认条 → 文本回填 + 「正在修改」条 → **发送时**才真正执行撤回+发送。
- 核心原则：**惰性提交**（context 只在「确定」/「发送」时修改）；草稿按会话持久化
  （超时自动备份本地文件、处理完成即删）；单会话单待定；三视觉模式；`< X >` 版本翻页器（视口不跳）。

## 状态

- 需求与交互设计：[DESIGN.md](DESIGN.md)（v0.4，20 项用户决策）
- 项目流程 / 架构 / 规范 / git 工作流：[PROJECT_PLAN.md](PROJECT_PLAN.md)（PLAN v1，已确认）
- 开发状态：Phase 0（准备）进行中

## 安装（发布后）

```sh
dsh plugin --profile web add dsh-bubble-edit
# 重启 dsh web，页面 Ctrl+Shift+R 硬刷新
```

## 文档

| 文档 | 内容 |
|---|---|
| DESIGN.md | 需求规格、交互状态机、host 协议、验收清单 |
| PROJECT_PLAN.md | 制作流程、架构规划、插件开发规范、git 工作流 |
| docs/api-facts.md | rc.6 API 事实清单（已验证/待验证/不存在） |
| docs/m0-verify.md | M0 五项冒烟结论（P1 产出） |

## License

MIT
