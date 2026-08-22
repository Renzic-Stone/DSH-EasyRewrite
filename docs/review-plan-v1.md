# dsh-easyrewrite 全项目方法论 Review——合并改进方案 v1（Round 1）

> 方法论：用户思维（官方已有→借用；只记 id；数据官方管；按需读） vs AI 惯性（不确定性→自建兜底层）。
> 三份域报告（会话版本/数据基建/图片UI）+ AI 独立通读 合并。

## Tier 1 —— 纯重复，直接删（行为等价或更优）

| # | 机制 | 判定 | 官方等价（证据） | 动作 | 约删行数 |
|---|---|---|---|---|---|
| 1 | MessageImageCompat 自绘兜底 | 死代码（chat.node 注入必带 renderMessageImages prop；ctx.slots.renderSlot 仅限 root 不可直调） | 官方 ImageGallery（大图/宫格/lightbox/重试） | 删 814-846，仅留 props.renderMessageImages 调用 | ~35 |
| 2 | collectComposerImages+absorbComposerImages 盲扫 DOM | 重复 | InputState.imageIds（compose() L1447）+ draftImages(ids) 直取 File（L161）；input.dock 标准道具含 useInput | 改 useInput(s=>s.imageIds) → conversation.draftImages(ids) | ~40 |
| 3 | attachMemCache 内存 blob 缓存三函数+缓存分支+resume 二次重建 | 部分重复 | ConversationController.draftAttachments 全局单例跨会话存活；官方 selectWorkspace 先例：imageIds 搬运不重读字节（client.js:10006） | confirm 时 createDraftImages→addImages；发送只记 imageIds；resume 新 shell ia.addImages(ids)+submit | ~60 |
| 4 | captureScrollAnchor/restoreScrollAnchor | 重复 | 官方 chatScrollPositions Map 按会话存滚动位（10200-10206,5539-5575,5699-5714） | 删 118-165 及 goToVersion 内调用；30×100ms 轮询必删 | ~48 |
| 5 | /bubble/archive 路由 + client shim | 重复（archiveSession 幂等；sessionKnown 接受非 live——旧观察不成立） | dsh-workspace/lib/index.js:424,439-444 | 删路由，shim 还原 ctx.workspaces.archiveSession | ~40 |
| 6 | localStorage 版本树（64-117+6 调用点） | 重复（官方 summary 含 parentSessionId，flattenLineage 现成，注释"lineage rides parentSessionId"） | runtime client.js:8202-8212,5593-5635 | 删树，换 ~20 行派生（上溯 root 收集同根按 updatedAt 排序）；旧数据一次性回填 | ~35净 |
| 7 | /bubble/recall 整链路（host 边界计算+路由+client fetch） | 重复（官方 fork(atSeq) 本身就是截断边界器：boundary=events.find(turn/end&&seq>=atSeq)；官方 branch 按钮=同款） | apiproxy 2679-2694；TurnTail onBranch 先例 9744/10207 | client 直算 boundary（前置闭合回合 finalNode.seq）→ctx.sessions.fork({atSeq})；错误映射 fork-unavailable→按 message 分流 resetConversation | ~110 |

## Tier 2 —— 存储迁移（官方存储换自建，需迁移步骤）

| # | 机制 | 官方等价 | 动作 |
|---|---|---|---|
| 8 | 18 个 localStorage 设置键 | ctx.settingsScope.bind(ns)：宿主 settings.yaml 持久+revision 围栏+跨浏览器 | 控件保留（无官方 bool/enum 控件），写走 scope.set；dummy schema 换真实 schemastery schema；一次性导入旧键 |
| 9 | pendingStore 存储机器 | defineStore(persist) / 官方草稿已持久化（persist:"dsh.conversation.chat"+attachPersistence 再水化） | recall 私有语义保留，机器可瘦身；跨页同步如需留 ~15 行 |
| 10 | host writeLog 文件机+/bubble/log | cordis ctx.logger 标配 | writeLog→ctx.logger；/bubble/log 删或仅 debug console |

## Tier 3 —— 用户决策项（技术冗余但用户明确要求/核心卖点）

| # | 机制 | 说明 |
|---|---|---|
| 11 | 备份链（10s/5s 文件备份+异常恢复 ≈150 行） | 技术上与官方草稿持久化重叠，但系用户 M15/M99 明确要求+"防数据丢失"核心卖点 → 是否简化由用户拍板；若保留至少换 writeFileAtomic |
| 12 | update-plugin exec pnpm | 官方 CLI `dsh plugin --profile <name> up <pkg>` 已有 → 可改引导提示；check-update/versionGt 无等价保留 |

## 必要胶水（保留，注明依据）
- /bubble/unarchive：官方 README 明示无 unarchive 能力（真实缺口）
- UserBubbleView 整覆盖 chat.node：keyed 单胜者槽，无 additive 细粒度槽可用
- contentParts：官方内部函数不可 require
- i18n：已用官方 locale ✅
- 图片桥接语义：fork 子会话 seed=events.slice(0,cut)，被撤回消息的附件 ref 不在子会话 → 字节必须旧会话 live 时捕获（但存储交官方 draftAttachments 单例）

## 附带缺陷修复
- edit 路径（confirmEdit）只存 ref 不预取 → resume 被 host ATTACHMENT_NOT_REFERENCED 拒绝 → 静默丢图。Tier1#3 迁移顺带修复（edit confirm 同样 createDraftImages→addImages 进输入框，发送只记 imageIds）。

## Round 1 实施范围（本版）
Tier1 全部（#1-#7）。Tier2/3 留 Round 2/3。
