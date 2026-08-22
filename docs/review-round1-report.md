# Round 1 报告——方法论全量 Review（批A+批B 实施版）

> 基线：review-v1 (a2d7077) → 本版：v2
> 方法论：用户思维"官方已有→借用，只记 id，数据官方管，按需读" 对照 AI 惯性"不确定性→自建兜底层"

## 流程回顾（本轮）
1. **第一遍理解**：AI 独立通读 host lib/index.js 全文 + client 关键段，产出 docs/review-plan-v0.md（8 域逐域初判 + 6 个待证实点）
2. **三域子代理并行深挖**（对照官方源码行级证据）：
   - 会话/版本域：7 项机制判定（4 重复 / 1 必要 / 2 部分重复）
   - 数据基建域：6 项判定（4 重叠 / i18n 正确 / 更新部分必要）
   - 图片UI域：5 项判定（3 重复 / 整覆盖必要 / 桥接语义必要但存储层冗余）
3. **合并方案**：docs/review-plan-v1.md（Tier1 七项纯删 / Tier2 三项存储迁移 / Tier3 两项用户决策）
4. **独立审核**（子代理）：#5 证据核实通过；#6/#7 经 resetConversation/familyOfSession 耦合必须同批；版本树排序用 list 输入序勿按 updatedAt；flattenLineage 插件不可 require 需自写派生；归档会话仍在 summaries
5. **交叉评审**（子代理）：七项一次实施偏大→切三批；#3 桥的刷新洞→双记 ids+refs+计数校验+显式报错；#7 窗口外拿不到 boundary→host 路由降级保留作 fallback（判定树）；错误分流核实 apiproxy:2682 子串

## 本轮已实施（批A + 批B）

### 批A（纯删/等价）
| # | 内容 | 结果 |
|---|---|---|
| #1 | 删 MessageImageCompat 自绘兜底 → 直调官方 renderMessageImages（白得 ImageGallery：lightbox/宫格/重试），失败 warn 不静默 | ✅ ~35 行 |
| #4 | 删 captureScrollAnchor/restoreScrollAnchor + goToVersion 调用 + 30×100ms 轮询 → 交还官方 chatScrollPositions | ✅ ~48 行 |
| #5 | 删 host /bubble/archive 路由 + client shim 还原 ctx.workspaces.archiveSession 直调（官方幂等，旧观察不成立） | ✅ ~55 行 |

### 批B（附件管线重构，含缺陷修复）
| # | 内容 | 结果 |
|---|---|---|
| #2 | 删 collectComposerImages/absorbComposerImages DOM 盲扫 → useInput(s=>s.imageIds) 精确读官方权威态 | ✅ ~40 行 |
| #3 | 删 attachMemCache 内存 blob 缓存三函数+缓存分支+resume 二次重建 → 官方 draftAttachments 全局单例跨会话桥（只记 imageIds） | ✅ ~60 行 |
| 附带 | **修复 edit 路径隐性丢图缺陷**（原 confirmEdit 只存 ref 不预取，resume 必被 ATTACHMENT_NOT_REFERENCED 拒绝）：撤回确认 pending 双记 imageIds+attachRefs；resume 先 addImages(ids)→计数校验→不足回退 refs 重建→仍失败显式报错**禁止静默丢图**（取消自动发送，草稿保留可手动补图）；检查 shell.addImages 布尔返回 | ✅ |

### 净效果
- lib/client.js: 501901 → 495741 字节（约 **240 行自建防御层删除**）
- host index.js: 删 archive 路由 ~1938 字符
- 消除自建存储层：内存 blob 缓存、DOM blob 扫描、归档中转路由
- 图片数据单一来源：官方 draftAttachments 单例 + 会话附件缓存（符合"读缓存不存缓存"）

## 验证
- node --check 双文件 ✅
- smoke-host.mjs 10/10 ✅（边界定位 5 场景 + 极限场景 5 场景）
- 死代码残留扫描 ✅（7 个符号全部清零）
- UserBubbleView hooks 顺序扫描 ✅（无 #300 漂移）
- **待人工冒烟**（重启 dsh web + Ctrl+Shift+R）：带图撤回重发、×取消、图片 lightbox、切版本滚动复位

## Round 2 计划（批C 版本语义，必须同批）
- #6 localStorage 版本树 → 官方 parentSessionId lineage 派生（~20 行上溯；list 输入序排序；flattenLineage 内部不可 require 需自写；旧键一次性回填后删）
- #7 /bubble/recall 链路瘦身：client 直算 boundary（判定树：倒序扫 turn-tail.closing≠null → atSeq=finalNode.seq；无且 hasMore=false→reset；无且 hasMore=true→host fallback 保留）；错误按 apiproxy:2682 子串分流；running 先本地提示
- resetConversation 场景2 改 lineage 一行替代 familyOfSession
- Tier2 迁移视余量：settingsScope 设置存储迁移（控件保留）/ writeLog→ctx.logger / update-plugin 引导官方 CLI

## 用户决策项（Tier3，不擅自实施）
- 备份链（≈150 行）：技术重叠但系明确要求+卖点——简化 or 保留由用户拍板
