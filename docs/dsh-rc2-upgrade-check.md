# DSH 0.1.1-rc.2 升级适配核查（2026-08-21）

## 结论
本地已升 0.1.1-rc.2。**我们插件用到的接口全部保留，无破坏性变更。**

## 1. 插件接口核查（全部 ✅）
我们插件用到的 DSH API 在新版都存在：
- **Slots**：conversation.chat.node / conversation.input.dock / conversation.chat.assistant-actions（仍 keyed/list 符合预期）
- **sessions.fork / sessions.get / sessions.open**：保留
- **workspaces.archiveSession / list / connectWorkspace**：保留
- **settings.register / settings**：保留
- **locale.register**：保留
- **conversation**：resolveImage / createDraftImages / loadImage 全保留，签名一致
- **inputActions.addImages / setDraft**：保留
- inject `["slots","sessions","workspaces","conversation","locale"]` 仍有效

## 2. 原生撤回键：❌ 没有（我们仍是唯一）
- DSH client.js 里的 undo/recall 是**输入框编辑器的撤销环（事务日志）**和 **file reference recall（文件引用回显）**，不是消息撤回
- "编辑"按钮是 **"编辑排队消息"**（发送队列里待发出消息的编辑），不是已发消息的编辑/撤回
- 消息气泡操作区：Copy / fork / Retry / 重试 有，**撤回键无**
- → 我们插件的撤回/气泡编辑仍是生态唯一，差异化稳固

## 3. 附件回传机制适配性
**接口兼容 ✅，但文件类型仍受限 ⚠️**
- 我们的链路：loadImage → fetch → createDraftImages → addImages（重建为客户端草稿附件）
- 新版 createDraftImages 内部调用 imageMediaType(file.type) 做严格 MIME 校验：
  `image/png | image/jpeg | image/webp | image/gif` —— 其他一律抛 UnsupportedImageMediaTypeError
- browserDraftAttachment 生成的 kind 固定为 "image"（只支持图片）
- **结论：我们插件现有的图片附件重发机制完全适配新版（接口没变、图片仍走 createDraftImages）。**
- **但非图片文件（文档/代码等）仍无法经 createDraftImages 传**——因为官方这个接口只认图片 MIME。

## 新版的其他机会（来自 release）
- rc.1 适配器新增 DeepSeek-V4-Flash-Vision-Exp 多模态模型
- rc.2 适配器优先走 Files API 上传图像 + 复用已上传文件（file_id 缓存）
- rc.8 起 @ 菜单支持引用文件和会话（file reference）
- → 视频/文档等非图片文件，未来可关注 **dsh-file-reference**（@ 引用文件通道），那是独立于 createDraftImages 的路径

## 可行动项
1. 图片附件保留重发：无需改动，已天然适配新接口
2. 若要做"非图片文件"支持：需探索 @ 文件引用通道（dsh-file-reference / file reference 存储），而非 createDraftImages
3. 可测试：编辑带图消息重发在新版是否正常（resolveImage → createDraftImages 链路）
