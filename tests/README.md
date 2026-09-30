# tests

| 文件 | 阶段 | 覆盖 |
|---|---|---|
| smoke-host.mjs | P2（M1） | /bubble/recall 路由成功/错误路径、边界判定、busy 拒绝、备份写删 |
| smoke-client.mjs | P2（M1） | 状态机、确认胶囊、取消/确定/撤回、pending 恢复、翻页器、视口锚定 |
| test-bubble-size-preserve.mjs | 2.6.x | 「原尺寸」默认档：宽度严格等于气泡实测宽（不随打字变化）、编辑框高度以气泡原高为下限（绝不变矮）、移除 240px 内滚上限与 20 行上限、textarea 挂载即撑高、操作区「编辑」键改量真实气泡 |

骨架期以 `node --check` 语法校验作为最小检查（见提交前检查）。
