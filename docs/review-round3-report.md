# Round 3 报告——批C 回溯审核（抓获 P0）+ 修复 + 收尾清扫

> 基线：review-v3 (02fddf2) → 本版：v4

## 流程
1. 派回溯审核子代理对 v3 批C 实现做行级复核（对照官方 runtime/apiproxy/ui-conversation）
2. 审核抓获 P0：官方 projectList 投影把 summary.parentSessionId 映射为 byId[].parentId——我误读字段名，派生恒失效（人人自成 root，家族恒 1 版），VersionPager/设置卡/reset 父版本全废 = 对 v2 功能回退，不可发布
3. 同报告另捕获三处次级问题并全部修复

## 修复清单
- P0 parentSessionId → parentId（familyOfSession/sessionLineageRoot 全部改读投影字段；已亲验 runtime 投影源码 entry.parentSessionId → { parentId } 且带 origin 字段）
- 子代理排除修正：subagentsByParent 的值是目录对象非数组（原 Array.isArray 恒假、排除逻辑死代码）→ 改判 summary.origin===subagent
- 排序修正：updatedAt 是活动时间非 fork 序（root 续聊会越位漂移、reset 取 index-1 会选错父版本）→ 改 parentId 链深度升序为主（深度=旧 append 序且稳定）、updatedAt 为次
- computeRecallBoundary 边界过早：纯工具/无文本回合 closing=null 被跳过继续上溯 → 整段回合被误切；修为 closing 缺失时回退尾节点自身 data.seq（与官方槽位 closing?.finalNode.seq ?? data.seq 同款）
- DESIGN.md L173 registerVersionFork 旧述更新为 lineage 派生
- 新增：陈旧版本树键启动清扫（lineage 已接管，旧 localStorage 键为死数据）
## 决策记录
- uiLang() navigator 兜底保留：仅在官方 locale 服务不可用时启用，此时官方 active 同样不可得，改动无收益
## 验证
- node --check src+lib 通过｜build 通过（501543B）｜smoke-host 通过
- 审核员五项清单：P0 已修 / 排序已修 / closing 已修 / 设置卡确认安全 / 残留清零
