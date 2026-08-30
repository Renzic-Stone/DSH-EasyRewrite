<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Renzic-Stone/DSH-EasyRewrite/main/assets/logo-dark.png" />
    <img src="https://raw.githubusercontent.com/Renzic-Stone/DSH-EasyRewrite/main/assets/logo.png" alt="dsh-easyrewrite" width="320" />
  </picture>
</div>

# dsh-easyrewrite (DSH-EasyRewrite)

[中文](README.md) | [日本語](README.ja.md)

`#dsh` `#deepseek-harness` `#recall` `#rewrite` `#bubble-edit` `#version-pager` `#i18n` `#multilingual`

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

### Rewrite (inline edit) — shipped (M2)
- Click the bubble → inline editor (original Markdown source preserved), Esc cancels / Ctrl+Enter confirms.
- **Three editable widths** (Compact: starts at bubble width, up to 360px / Standard: fixed 360px / Expanded: 748px), auto-grow + inner scroll.
- Edit mode keeps the recall key (hides copy); **Confirm** = truncate-style edit-resend: truncate → archive original → same-titled session → edited text sent automatically.
- Edit drafts persist per session (survive tab switch / refresh).
- **Full image support for Rewrite — recall key & bubble edit**: images send together with your edited text; inside bubble edit you can delete (×), paste or drag-and-drop new images, switch model & reasoning effort on the spot, and your edit progress survives a page refresh. No comparable feature in any competitor.

### Settings — shipped (M3)
- **Settings → Plugins → Plugin config**: an official-style collapsible card (click the header to expand/collapse); UI language follows the interface (中文 / English / 日本語).
- Every option applies instantly: bubble edit toggle, show recall key when bubble edit is off, recall confirmation capsule, recall visual mode (Simple / Minimal / Info), recall stats scope (user questions only), composer fill mode (Overwrite / Merge), edit width (Compact / Standard / Expanded / Custom).

### Draft auto-backup — shipped (M3)
- A pending draft left untouched for more than 10s is auto-backed-up to a local file (refreshed every 5s); the backup is removed once the draft is handled (Confirm / Send).
- Location: `$DSH_HOME/dsh-easyrewrite/backups/<sessionId>.json`.
- Recovery fallback: restore only when there is no local pending state — never overwrites a draft you are actively editing.

### Version pager (< X >) — shipped (M3)
- After every recall/edit resend, the **`‹ X/N ›`** control appears in the final reply's action strip; click (or ←/→ keys) to switch versions — **the following context follows the displayed version**.
- **Archive swap**: switching = restore the target → open it → archive every other family member — **the workspace list always keeps exactly one active version**, a seamless switch.
- **Viewport anchoring**: the scroll position never jumps (restored via the official `data-chat-anchor-key`).
- Even if everything is archived, restore any version via **Settings → Plugins → Plugin config → “Versions” section**.

### Recall hotkey — shipped (M3, Beta)
- A **master toggle, off by default** (so it never clashes with other plugins' shortcuts); once enabled you can **record** any combination (at least one modifier required).
- Triggers when the input is unfocused and the latest message in the current session is yours — equivalent to clicking that message's recall key (the confirmation capsule appears as usual).

---

## How we differ from similar plugins

| Capability | dsh-easyrewrite | Other recall/edit plugins |
| :--- | :---: | :--- |
| Recall | ✅ | Basic capability |
| **Seamless replacement** (feels like a *native* feature — frictionless edit-resend) | ✅ | Basic capability, but ours is **more refined** |
| **Lazy commit** (context changes only after you confirm; closing mid-way changes nothing) | ✅ | Some competitors edit immediately, causing cache-hit / context issues |
| **Bubble inline edit (Rewrite)** | ✅ | **No comparable feature in any competitor** |
| **Version pager < X >** (switch history versions — a **gold-standard design** proven by countless Chatbox users) | ✅ | **No comparable feature in any competitor** |
| **Draft persistence + timeout auto-backup + crash recovery** (solid recovery that protects every bit of your thinking) | ✅ | **No comparable feature in any competitor** |
| **Attachment-preserving edit resend** | ✅ | No comparable feature in any competitor |
| **Official extension points only** (zero source patches, clean uninstall) | ✅ | Competitors rely on source patches — hard to uninstall, complex dependencies |
| Trilingual UI & i18n | ✅ | Few have proper i18n; we natively support multiple languages with three presets |
| **Every feature can be toggled off** | ✅ | **No competitor does it better** |

---

## Design philosophy

**1. Simple to use, easy to onboard, compatible by contract**

- Interactions need no manual: **click the bubble to edit, recall key sits beside copy** — no new concepts, no new entry points.
- Sensible defaults: the default settings are the right choice for most scenarios; install, restart, done.
- Compatibility is a hard promise: only official extension points (keyed slot override, official `sessions.fork` RPC, official components & design tokens) — **no source patches, no brittle internal APIs**, actively adapted across DSH releases.
- Uninstall restores everything; nothing of your install is left behind.

**2. Faithful to the original experience — seamless & invisible**

- UI language follows dsh's native design (grey-blue palette, rounded corners, pills, official icons), dark/light theme aware — feels like an official feature, not "another plugin skin".
- Original interactions stay intact: copy key, hover timestamps, bubble look — all preserved.
- **Invisible**: day-to-day use barely notices the plugin — features live where you expect them, results match intuition; no popups, no interrupted rhythm.
- **Lazy commit** is the foundation: entering edit mode or confirming a recall is purely local draft state; **context changes only at "确定" (rewrite) or "发送" (recall)**. Close dsh mid-way and nothing moves.
- **Seamless replacement**: after a recall it *feels* like the original conversation was edited — the old session is archived, a same-titled replacement takes over, and your edited text is sent for you. No "a new conversation appeared" split.
- **Bubble edit (landing soon)**: click the bubble to edit in place, what you edit is what you send — the natural extension of the same seamless philosophy.

**3. Persistent & accident-proof**

- Edit/recall drafts **persist per session**: switching chats, refreshing, even restarting dsh — progress resumes where you left it. No "lost half-written" moments.
- In overwrite mode the pre-recall draft is restored after both send and cancel — **no data loss on any path**.
- Long-idle pending drafts auto-backup to local files (removed once handled) — a safety net for the extreme case.
- Every destructive step has a confirm and an undo path: confirmation capsule, × cancel, one-pending-per-session — **mistakes are recoverable, data is never lost**.

**4. Complete logging, fast diagnosis**

- Every client step (load, confirm, pending, send-hook, fork, resume) is reported to the host and written to a unified log: `$DSH_HOME/dsh-easyrewrite.log`.
- Uniform format (JSON lines: time / level / tag / message / data) — one reproduction is enough to locate the issue, no back-and-forth descriptions.
- Host behaviour lands in the same log (requests, rejection reasons, exceptions), so both halves reconcile on one trail.
- Logs stay local; nothing is uploaded.

**5. Continuously updated, actively compatible**

- Follows DSH releases (rc.x → stable); upstream API changes are adapted promptly.
- Semantic versioning + CHANGELOG; breaking changes announced in advance.
- Community-driven: issues and PRs answered, new ideas and scenarios folded into the roadmap.

---

## Install

```sh
# npm (published)
dsh plugin --profile web add dsh-easyrewrite
# or from GitHub
dsh plugin --profile web add github:Renzic-Stone/DSH-EasyRewrite
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
├── DESIGN.md             # full interaction design (v1.0, 20 product decisions)
├── PROJECT_PLAN.md       # roadmap, architecture, git workflow
└── docs/                 # api-facts, m0-verify
```

---

## License

MIT
