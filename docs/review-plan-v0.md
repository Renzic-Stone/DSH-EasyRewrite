# 改进计划 v0（AI 第一遍独立见解，待与 3 个域代理结果合并）

## 方法论对照声明
- 用户方案思维：先假设官方已有能力→借用；只记轻量引用；数据官方管；按需读。
- AI 惯性思维（批判对象）：不确定性→自建兜底层（预取/DOM 扫描/内存缓存/回退链）。

## 逐域判断（AI 独立通读 host+client 后）

### A. 会话操作域
- /bubble/recall 边界计算：客户端快照是**窗口化**的（anchorSeq 窗口外退化），host 全量 events 是必要数据源 → 初判**必要胶水**，非造轮子。待证实：官方是否暴露全量会话数据或 truncate API。
- resolveBoundary 纯函数 + __test 导出：工程质量好，保留。
- fork 用官方 ctx.sessions.fork：✅ 已符合方法论。

### B. 版本翻页器域
- localStorage 版本树：**最大嫌疑冗余**。若官方 session 暴露 parent/lineage，可整树删除（readVersionFamily/familyOfSession/listVersionFamilies/registerVersionFork + localStorage 键）。待 agent A 证实。
- /bubble/archive|unarchive：官方无 unarchive API（源码注释已注明），archiveSession 对非 live 会话抛错 → **必要胶水**，保留（已有 S3 守卫）。
- captureScrollAnchor/restoreScrollAnchor：待查官方是否有原生锚定。
- 归档交换轮询（确认 current===目标再归档）：官方 open 异步竞态的兜底，可能必要。

### C. 图片附件域（刚按方法论重构过一轮）
- 剩余优化点1：collectComposerImages 盲扫 DOM → 若 useInput snapshot 暴露 imageIds（compose 已返回 imageIds），可升级为精确读取。
- 剩余优化点2：MessageImageCompat 自绘 → 若能从 ctx.slots 拿官方 conversation.message.images 渲染器则替换。
- attachMemCache：跨会话桥梁，若"新会话 resolveImage(旧attachmentId)"证实有效则可删（resume-send 只传 id）。
- pendingAttachIds：轻量 id 记录，符合方法论，保留。

### D. 草稿/pending/备份域
- pendingStore：记录"哪条消息撤回待定"（官方不知道的语义），非纯草稿 → 大概率必要，但待证实官方草稿是否跨重启持久化（若持久化，pending 里的 draftText 字段可瘦身）。
- backup 体系（10s/5s 覆盖+异常恢复）：若官方草稿已持久化，则大幅简化为仅 pending 态兜底；若官方不持久化，则保留（用户核心卖点"防数据丢失"）。
- resume-send：跨会话文本传递，必要（新会话输入框为空）。

### E. 设置域
- 自绘控件（Apple 分段控件/圆形勾选框）：**用户明确要求的设计决策**，不属重复造轮子，保留。
- host settings namespace 注册（rc.7 注册即暴露）：✅ 已用官方机制。

### F. i18n 域
- ctx.locale.register + useUILocaleDict：✅ 完全符合方法论，保留。

### G. 更新域
- check-update/update-plugin：官方暂无插件更新标准（market #442 未落地）→ 必要自建，保留；落地后迁移。

### H. 日志域
- /bubble/log + 落盘：官方 telemetry（otel）是会话遥测非插件调试 → 必要自建，保留。debugEnabled 双开关设计合理。

## 待 3 个域代理回答的关键证实点
1. 官方 session 是否暴露 parent/lineage（决定 B 域大删或保留）
2. 官方草稿是否跨重启持久化（决定 D 域备份体系去留）
3. useInput snapshot 是否含 imageIds（决定 C 域精确化）
4. fork 后新会话 resolveImage(旧attachmentId) 是否有效（决定 attachMemCache 去留）
5. 官方是否有 truncate/recall API（决定 /bubble/recall 去留）
6. 官方聊天流是否有原生滚动锚定（决定 captureScrollAnchor 去留）
