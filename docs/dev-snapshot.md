# 开发进度快照 — 2026-08-23（上下文压缩前存档）

## 当前版本：v2.0.2 已发布 → v2.1-dev 本地开发中（未发布）

---

## 已完成并发布的功能

### v1.0.0 ~ v2.0.0（全部已发布）
- 撤回键 + 确认胶囊 + 惰性提交 + 无痕替换
- 内联编辑（三档宽度）
- 草稿自动备份 + 异常恢复
- 设置页（三语、Apple 风格控件）
- 版本翻页器 < X >
- 可自定义快捷键（Beta）
- 附件保留重发（撤回键路径）
- 官方 i18n 三语
- 插件内更新检查
- 安全审查 21 项修复
- React #300 四次修复

### v2.0.1（已发布 npm + GitHub Release）
- 编辑宽度三档手感修正：紧凑严格原宽起步、标准不满一行自动扩成一行宽、CJK 感知估算

### v2.0.2（已发布 npm + GitHub Release）
- 编辑框行数下限 3→1、删 minHeight 44px、高度实时自适应内容

### 公告发布记录
- v2.0.0 公告已发 Dis (#3456)
- v2.0.2 更新公告已发 Dis (#3456)
- Day 4 增长日报已发 Dis (#3456)

---

## V2.1 开发进度（本地未发布）

### 已完成（代码在 src/client.src.js 中，build 通过）

#### 带图气泡编辑核心链路
- enterEdit 时桥接原消息图片为 draft attachments（resolveImage→fetch→createDraftImages）
- 图片缩略图显示在编辑框上方（72px 方形预览 + × 删除按钮）
- confirmEdit 使用 editImages 的 ids（不再依赖 data.content）
- resume-send 传纯 imageIds（官方 draftAttachments 全局单例跨会话存活）
- resume 直接 addImages(savedIds) + submit（无校验层——用户方案简化版）

#### 撤回路径带图完整支持
- onConfirm 时图片重建进输入框（rebuildDraftAttachments recordPending=true）
- doRecallThenSend 读 latestInputImageIds 镜像捕获最终选择
- × 取消时清空输入框全部图片（useInput 快照 ∪ pendingAttachIds）

#### 样式统一
- 正在修改条外挂 card 正上方（width=card 实际宽度动态绑定）
- 统一用带图形态（无分界线、paddingBottom 6px）
- chevron 放大至 21.5px SVG 描边风格
- 设置卡箭头对齐官方语义（收起朝下/展开朝上）

### 进行中（代码部分写入但未完成）

#### 拖入添加图片（drop handler）
- 计划：在编辑容器上监听 drop 事件，提取图片 File → createDraftImages → 加入 editImages state
- 当前状态：未实现——onPaste 已加到 textarea（处理粘贴），但 onDrop 未加
- 需要在编辑区域的容器 div 上加 onDrop handler

#### 粘贴图片进编辑框（paste handler）
- 当前状态：已实现——textarea 的 onPaste 事件提取 clipboardData.items 中的图片文件 → createDraftImages → setEditImages
- 但注意：粘贴的图片 id 存在 editImages state 里，confirm 后通过 resume-send 传递

---

## 核心架构决策记录

### 图片数据流（当前版本）
原消息图片 → data.content[].attachment{attachmentId, mediaType, name}
  ↓ resolveImage(sessionId, ref) ← 仅旧会话 live 时有效
  ↓ fetch(url) → blob
  ↓ new File([blob], name, {type})
  ↓ ctxConversationRef.createDraftImages(files)
  ↓ 返回 [{id, previewUrl, file}] ← 注册进全局 draftAttachments Map
  ↓ ia.addImages(ids) ← 加进当前 input 状态

### 关键限制
1. resolveImage 只在旧会话 live 时有效（归档后 scope 释放）
2. data.content 在编辑态可能不可靠（组件卸载后闭包失效）→ 用渲染时缓存解决
3. 官方 removeImage 可能有效但对死 id 是 no-op → 不报错不崩溃
4. pruneImages(keepIds) 可以批量清理

### 用户拍板的设计决策
- 所有模板统一用带图形态（无分界线、外挂正上方）
- 正在修改条宽度动态绑定 card 实际宽度
- × 清空逻辑：useInput 快照 ∪ pendingAttachIds 全清
- chevron 尺寸 21.5px SVG 描边风格

---

## 关键文件位置

- 插件根目录: D:\AI\Projects\AgentsDefault\DeepSeekHarness\plugins\dsh-easyrewrite\
- 源码模板: src/client.src.js (~2675 行)
- 构建产物: lib/client.js (~506KB, build.mjs 生成)
- host 路由: lib/index.js
- 会话记忆: docs/session-memory.md
- 大事记: docs/easyrewrite-chronicle.md
- 升级核查: docs/dsh-rc2-upgrade-check.md

## 数据现状

- GitHub: 41⭐ / 3 forks
- npm latest: 2.0.2（v2.1 未发布，等测试确认）
- Discussion #3456: Day 4 日报已发（41⭐ +15）
- 收录 PR: AdamPlatin123 #271 ✅ bruc3van #103 ✅ 其余待合并
- 竞品头部: undo-savepoint 115⭐ / turn-rewind 96⭐

## 下一步（按优先级）

1. 完成拖入 handler：编辑容器加 onDrop 监听（提取 e.dataTransfer.files 中的图片）
2. 用户测试 V2.1：带图气泡编辑全链路验证
3. 发布 V2.1.0：npm + GitHub Release + Dis（需用户批准）
4. 后续可选：设置存储迁 settingsScope、writeLog→ctx.logger、update-plugin 引导官方 CLI