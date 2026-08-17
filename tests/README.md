# tests

| 文件 | 阶段 | 覆盖 |
|---|---|---|
| smoke-host.mjs | P2（M1） | /bubble/recall 路由成功/错误路径、边界判定、busy 拒绝、备份写删 |
| smoke-client.mjs | P2（M1） | 状态机、确认胶囊、取消/确定/撤回、pending 恢复、翻页器、视口锚定 |

骨架期以 `node --check` 语法校验作为最小检查（见提交前检查）。
