# dsh-easyrewrite (DSH-EasyRewrite)

**Inline-edit & recall your own user messages in the DeepSeek Harness Web UI — lazily, seamlessly, and without ever losing your work.**

Click your own message bubble to edit it in place; hit the recall button beside copy to withdraw it and everything after it. Nothing is ever really changed until you commit — the conversation, the model context, and the session log stay untouched until you press **Confirm** (rewrite) or **Send** (recall).

> Compatible with DeepSeek Harness Web (rc.6+, built on official extension points only — no source patches).

---

## Features (what we've built)

### Recall (撤回) — done, end to end
- **Recall key** next to the official copy key on every user message.
- **Inline confirmation capsule** (dsh-styled grey pill: `撤回这条消息及其后 x 条提问？` + white-on-black **Confirm / Cancel** pills).
- **Lazy commit**: confirming only fills the composer — the real truncation happens when you press **Send**. Close dsh mid-way and nothing in the conversation changes.
- **"正在修改" bar** inside the composer (divider + label + round ×) — × cancels the recall and restores your original draft.
- **Overwrite / merge** fill modes; in overwrite mode your pre-recall draft is always restored after send or cancel. Zero information loss.
- **Live count of what will be removed** (user questions only, toggleable) — 0 remaining shows `是否撤回这条消息？`.
- **One pending operation per session**, drafts persist per session across reloads and tab switches.
- **Seamless replacement**: send executes the recall — the original session is **archived**, a **same-titled** session (history truncated before the target message) takes its place, and your edited text is sent automatically. Feels like editing the original conversation, not forking a new one.

### Rewrite (内联编辑) — in progress
- Click the bubble → inline editor (original Markdown source preserved).
- Three editable widths (bubble width / natural wrap ≈748px / composer width), auto-grow + inner scroll.
- Edit mode keeps the recall key (hides copy); **Confirm** = truncate-style edit-resend (attachments kept).

### Planned (roadmap)
- **`< X >` version pager** on the recalled reply (viewport-anchored, scroll never jumps).
- **Timeout auto-backup** of pending drafts to local files (cleaned up after handling).
- **Customizable recall hotkey**.
- **Settings page** (recall stats scope, visual modes, widths, merge mode…).
- **Simple / Info visual modes** for pending recall (greyed bubble instead of full hide).

---

## Design philosophy

1. **Lazy commit** — the single rule the whole plugin is built on: *context changes only at "确定" (rewrite) or "发送" (recall)*. Entering edit mode or confirming a recall is purely local draft state. Closing dsh mid-operation changes nothing.
2. **Seamless** — recall never feels like "a new conversation appeared". The old one is archived, a same-titled replacement takes over, and the edited text is sent for you.
3. **Zero loss** — original drafts survive send/cancel in overwrite mode; pending state persists per session; drafts are backed up locally if left too long.
4. **Official-first** — pure official extension points (keyed `conversation.chat.node` override, official `sessions.fork` RPC, `workspaces.archiveSession`, official components & design tokens). No DSH source patches; uninstall restores everything.
5. **One pending** — a single pending operation per session keeps the state machine simple and predictable.

---

## Install

```sh
# from GitHub (until published to npm)
dsh plugin --profile web add github:<your-name>/dsh-easyrewrite
# published form (planned)
dsh plugin --profile web add dsh-easyrewrite
```

Restart `dsh web`, hard-refresh (`Ctrl+Shift+R`), done.

> A note on **when recall works**: DSH forks only at closed-turn boundaries, so a message inside a still-open turn cannot be truncated yet — wait for the reply to finish, then recall. (The UI tells you: `该消息所在回合尚未结束…`)

---

## Debugging

Every client step is reported to the host and written to a unified log:

```
$DSH_HOME/dsh-easyrewrite.log   # e.g. ~/.dsh/dsh-easyrewrite.log
```

JSON lines: `{ t, level, tag, message, data }`.

---

## Structure

```
dsh-easyrewrite/
├── lib/index.js          # host half: boundary resolution + /bubble/recall, /bubble/log
├── src/client.src.js     # client template (icons inlined at build)
├── assets/               # recall / edit icons (PNG, theme-adaptive via CSS invert)
├── build.mjs             # assets → data-URL → lib/client.js
├── DESIGN.md             # full interaction design (v0.4, 20 product decisions)
├── PROJECT_PLAN.md       # roadmap, architecture, git workflow
└── docs/                 # api-facts, m0-verify
```

---

## License

MIT
