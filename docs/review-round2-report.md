# Round 2 报告——批C 版本语义（#6 版本树→lineage + #7 撤回边界判定树）

> 基线：review-v2 (b8ba32f) → 本版：v3
> 本轮循环：精读 v2 版本树/调用点 → 亲自验证官方证据 → 实施 → 语法修复 → 验证

## 关键证实（本轮亲自核实）
1. 官方 fork upsert summary 字段：{sessionId, updatedAt, running, blank, parentSessionId, cwd?}——无 createdAt，排序用 updatedAt 升序（fork 时间序，对齐旧 UX 的 v1/v2/v3 编号），tie-break sessionId
2. 官方 lineage 注释原文："lineage rides parentSessionId so the list nests it under its source"
3. 子代理会话不在主 summaries（独立 subagentsByParent catalog）——派生仍防御性排除 catalog 中的 id
4. localStorage 树从第一天起就冗余：我们的 fork 一直走 ctx.sessions.fork → host 早就写了 parentSessionId——无需任何数据回填，直接删
5. list.getSnapshot() 结构：{ids[], byId{}, current, subagentsByParent}

## 实施（批C）

### #6 版本树 → lineage 派生
- 删：VERSIONS_PREFIX/readVersionFamily/familyOfSession(全表扫描版)/listVersionFamilies(扫描版)/registerVersionFork（约55行）+ 2 处 registerVersionFork 调用
- 增：sessionLineageRoot(byId,id)（上溯 root，防环 64 层）+ familyOfSession(sessionId, ctxSessions)（同形状 {rootId,versions[],index}，排序 updatedAt 升序，排除子代理）+ listVersionFamilies(ctxSessions)（root 去重，仅列 >=2 版本真家族）
- 调用点适配：resetConversation 两处传 props.ctxSessions；设置卡/VersionPager 注入补 ctxSessions
- 语义保持：goToVersion(fam,...)/键盘左右/设置卡恢复入口 全部不变（fam 形状一致）

### #7 撤回边界判定树（host 路由降级保留）
- 增 computeRecallBoundary(props, targetSeq)：倒序扫 target 前最近 turn-tail.closing 非空 → atSeq=finalNode.seq；窗口内无且 hasMore=false → no-boundary 即 reset；无且 hasMore=true → host-fallback；目标不在快照/useSession 不可用 → null 即 host fallback
- doRecallThenSend 重写：本地判定优先 → host 路由仅作 fallback（Round 3 看 fallback 率再决定删尽与否）
- fork 错误按官方原文子串分流（apiproxy:2682 核实）：has not completed the turn → 提示等待（新增三语 turnOpenNotice）；has no completed turn to fork from → resetConversation
- 安全性：computeRecallBoundary 整体 try/catch——若 dock 槽 useSession 为 hook 型在事件期调用抛错，捕获后降级 host 路由（v2 行为），无崩溃风险

### 事故与修复
- lineage 块替换少写一个函数闭合括号 → lib 语法错误（node --check 拦截）→ 已补 → 全部通过

## 验证
- node --check src+lib 通过｜build 通过（499783B）
- smoke-host 10/10 通过
- hooks 顺序：UserBubbleView/VersionPager/EasyRewriteSettingsCard 无漂移；RecallBanner 扫描器误报（嵌套函数内 return）——顶层结构人工核实：6 hooks 全在唯一组件级 return(L770) 前
- 残留：registerVersionFork/readVersionFamily/VERSIONS_PREFIX 全部清零

## 遗留（Round 3）
- Tier2：设置存储迁 settingsScope、writeLog 迁 ctx.logger、pendingStore 机器瘦身
- Tier3 用户决策：备份链去留、update-plugin 引导官方 CLI
- 观察项：computeRecallBoundary 在 dock 槽的 useSession 可用性（不可用则永远走 host fallback，功能等价 v2 无损失）；host fallback 率
