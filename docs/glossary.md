# Glossary

The words of binnacle, for a person who uses it and an author who changes it. A word has one meaning here, and docs, code and tests use it only in that meaning. The words of the agents who build binnacle are in [`.agents/glossary.md`](../.agents/glossary.md).

*Owner* is whose word it is. Use the owner's word: dsh's, Cordis's or pi-tui's. *Ours* is a word that no owner has.

## A person's words

| Term | It is | It is not | A person may say | Owner | Code |
|---|---|---|---|---|---|
| **binnacle** | The terminal app for dsh. A person starts it with `dsh --profile binnacle`. | A fork of dsh: it is a bundle. | the TUI | Ours | `binnacle:packages/binnacle/src/index.ts#apply` |
| **stored session** | A session that dsh keeps in its session store, and that binnacle can read after it ends. | A live session, which an agent still writes to. | a log, a history | dsh | |
| **Read view** | A temporary screen that shows a stored session as its raw events. | The transcript, which draws a session for a person. | the log view | Ours | `binnacle:packages/binnacle/src/plugins/read/index.ts#apply` |
| **held-back output** | Text that other code writes to the terminal while binnacle draws. binnacle prints it after it gives the terminal back. | A notice, which binnacle will draw on the screen. | stray output, logs | Ours | `binnacle:packages/binnacle/src/core/capture.ts#capture` |
| **Request** | A box that the agent waits on: an approval or a question, in dsh's words. | A Menu, which a person opens and the agent does not wait on. | a prompt, a dialog, an ask | Ours | |
| **Choice** | A thing that a person picks in a Request. | A Menu's item. | an option, a button | Ours | |
| **Menu** | A picker that a person opens. | A Request. | a picker, a palette | Ours | |

## An author's words

| Term | It is | It is not | A person may say | Owner | Code |
|---|---|---|---|---|---|
| **profile** | A named stack of bundles under `~/.dsh/profiles/`, with a person's own patch on top. | A bundle. | a config | dsh | |
| **bundle** | A package whose patch adds rows to a profile. binnacle is one. | A plugin. | a package | dsh | `binnacle:packages/binnacle/cordis.patch.yml` |
| **row** | One entry of a patch: an id and the plugin it loads. A person turns a row off with `disabled: true`. | A screen row: a line of the terminal. | an entry | Cordis | |
| **plugin** | A module with a `name`, an `inject` list and an `apply` function, loaded by a row. Each feature is one. | The core. | an extension | Cordis | |
| **core** | The row `binnacle`. It owns the terminal and provides the binnacle service. | A feature: a person cannot turn it off. | the host | Ours | `binnacle:packages/binnacle/src/index.ts#apply` |
| **feature** | A plugin that draws something a person sees. [The feature map](features.md) lists each one. | The core. | a part, a panel | Ours | |
| **binnacle service** | `ctx.binnacle`: what a plugin shows its screens through. | The core, which provides it. | the API | Ours | `binnacle:packages/binnacle/src/api.ts#Binnacle` |
| **screen** | The lines that a plugin shows on the whole terminal. The newest screen shown is drawn. | The terminal's alternate screen, which binnacle draws every screen on. | a page, a view | Ours | `binnacle:packages/binnacle/src/api.ts#Screen` |
| **shown** | A screen while it is shown: a plugin draws it again or disposes it. | A screen. | | Ours | `binnacle:packages/binnacle/src/api.ts#Shown` |
| **untrusted text** | Text from a model, a tool or a stored session. binnacle takes out its control sequences before it draws it. | Text that binnacle writes. | | Ours | `binnacle:packages/binnacle/src/core/view.ts#toPlainText` |
