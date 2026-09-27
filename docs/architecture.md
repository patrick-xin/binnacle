# Architecture

binnacle is a terminal surface for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh). It is a **dsh bundle**: a package whose `package.json` names a Cordis patch under `dsh.bundle`, stacked by a profile over `dsh-base` (`dsh:docs/architecture.md`). dsh runs the agent; binnacle draws it in a terminal and takes a person's input back.

It is not a fork of dsh and reaches nothing dsh does not publish.

This page states what binnacle commits to, and why. The rules that follow from it are [`AGENTS.md`](../AGENTS.md)'s; where the code does not yet meet a commitment, that is an issue. What each feature does, and how, is its page in [the feature map](features.md).

## What it stands on

| Upstream   | Gives binnacle                                                                                                  | Is the authority on                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **dsh**    | the agent loop, the session log, tools, commands, settings, credentials, presets; `dsh-base` as the layer below | the harness contract — read the source, `dsh:`                                                           |
| **Cordis** | plugins, services, events, and effects disposed with their plugin (`dsh:docs/cordis-primer.md`)                 | how anything is contributed or removed                                                                   |
| **pi-tui** | the terminal, differential rendering, components, keys, the mouse                                               | its API — the installed package's `dist/*.d.ts`; `pi:packages/coding-agent` shows what pi builds from it |

A rename upstream is a break here, followed wholesale — no shim, no fallback. dsh is a preview, so binnacle reaches it only through seams it names, each held by a gate ([ADR 3](adr/0003-dsh-is-reached-through-named-seams-each-held-by-a-gate.md)).

Two more repositories are read and never depended on: `codex` and `eve`, for what a terminal surface can do.

## How it is put together

- **Everything is a plugin that a person can change by asking an author agent** ([ADR 0](adr/0000-everything-is-a-plugin-a-person-changes-by-asking-an-author-agent.md)). That covers the transcript, the chrome, the dialogs and screens a feature opens, the keys and the theme. binnacle supplies the building blocks an author draws with and the extension skill that says what they are; a request the blocks cannot draw is binnacle's defect. Every commitment below serves this one.
- **The conversation transcript is drawn from the session log alone.** binnacle keeps no second record of a conversation, so what a person reads is what the harness holds: what the model sees is logged, and what is logged can be drawn.
- **Code is in layers, each knowing only what it is allowed** ([ADR 2](adr/0002-five-layers-and-the-registrations-an-author-shares.md), [ADR 6](adr/0006-a-pane-joins-views-to-pi-tui-and-the-host-keeps-only-what-is-impure.md)). [`layers.json`](../packages/binnacle/layers.json) is the graph, and `check:layers` holds it. What happened, what it means, how it looks and how it answers each have one home; only the host touches the terminal and the process, so everything else is tested as facts in and lines out.
- **Content declares what can be done with it; one table gives every gesture its meaning** ([ADR 1](adr/0001-content-offers-affordances-the-surface-owns-gestures.md)), and a key means something only through the one key table ([ADR 13](adr/0013-a-key-means-something-only-through-the-one-key-table.md)).
- **pi-tui windows, scrolls and selects the transcript**, which binnacle draws whole ([ADR 7](adr/0007-pi-tui-windows-scrolls-and-selects-the-transcript.md)).
- **What binnacle draws, it draws on either of the terminal's screens, and on the main screen a row it has printed never changes** ([ADR 12](adr/0012-on-the-main-screen-a-printed-row-never-changes.md)). On the alternate screen pi-tui holds the window; on the main screen the terminal's scrollback holds the history, and no pointer reaches binnacle. Which one a person reads on is [TUI mode](features/tui-mode.md).
- **Everything is a registration, and the built-in surface has no private door** ([ADR 2](adr/0002-five-layers-and-the-registrations-an-author-shares.md), [ADR 5](adr/0005-a-built-in-feature-is-a-plugin-that-holds-only-what-an-author-holds.md)). What an author may depend on is the author API (`binnacle:packages/binnacle/src/api.ts#Registrations`). A built-in feature is a plugin holding only what an author holds, so for everything that lives in a plugin, the layer gate proves the built-in surface reaches nothing an author cannot.

## How a session reaches the screen

The host opens a session and follows its log (`binnacle:packages/binnacle/src/host/session.ts#openSession`). Each event is adapted to a fact (`binnacle:packages/binnacle/src/facts/adapt.ts#adapt`) and handed to the transcript pane (`binnacle:packages/binnacle/src/panes/transcript.ts#TranscriptPane`), which folds it into turns (`binnacle:packages/binnacle/src/models/transcript.ts#fold`). At each frame the pane draws the screen (`binnacle:packages/binnacle/src/views/screen.ts#screens`): each entry drawn as nodes (`binnacle:packages/binnacle/src/views/entries.ts#drawEntry`), and the nodes laid out with pi-tui at the width it was given (`binnacle:packages/binnacle/src/ui/layout.ts#layout`), so that no text a node carries reaches the terminal as a control ([ADR 14](adr/0014-no-text-a-node-carries-reaches-the-terminal-as-a-control.md)). An entry is drawn once, and drawn again only when it changes, the views of its key change, or their author invalidates them; it is laid out again only at a new width or as a fold in it opens. So a frame costs what changed, and handing pi-tui every line ([ADR 9](adr/0009-a-view-is-drawn-once-for-each-entry-and-again-when-its-author-invalidates-it.md)). On the main screen, the pane prints each entry once it has settled (`binnacle:packages/binnacle/src/models/transcript.ts#settled`), keeps what it printed as it printed it, and draws the rest below. A pointer event on the pane is read as a gesture, and the gesture table gives it its meaning (`binnacle:packages/binnacle/src/ui/gestures.ts#meaning`).

## The repository

| Path                                                                | Holds                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`packages/binnacle/`](../packages/binnacle/)                       | the bundle: `src/<layer>/`, the author API, its tests, and the patch dsh stacks |
| [`packages/binnacle/layers.json`](../packages/binnacle/layers.json) | what each layer may import                                               |
| [`AGENTS.md`](../AGENTS.md)                                         | the standing orders                                                      |
| [`docs/architecture.md`](architecture.md)                           | this page                                                                |
| [`docs/adr/`](adr/)                                                 | the decisions, why, and what each beat                                   |
| [`docs/features.md`](features.md), [`docs/features/`](features/)    | every feature: what a person can do with it, how it works, its choices   |
| [`docs/glossary.md`](glossary.md)                                   | every term, whose word it is, and what it means                          |
| [`references.json`](../references.json)                             | every repository read here, by url, pinned commit, and the tag it is at  |
| `.refs/`                                                            | those repositories, fetched by `pnpm refs`; read, never written          |
| [`scripts/`](../scripts/)                                           | the gates, and `pnpm dsh:profile`, `pnpm upstream` and `pnpm pin`        |
| [`.github/workflows/`](../.github/workflows/)                       | CI, and the upstream job                                                 |

## How it is checked

`pnpm test` runs every gate, then the tests, locally and in CI. What a gate refuses is stated where it is written, and its error says what to change.

| Gate | Written in |
| --- | --- |
| `check:paths` | [`scripts/check-paths.mjs`](../scripts/check-paths.mjs) |
| `check:citations` | [`scripts/check-citations.mjs`](../scripts/check-citations.mjs) |
| `check:links` | [`scripts/check-links.mjs`](../scripts/check-links.mjs) |
| `check:pins` | [`scripts/check-pins.mjs`](../scripts/check-pins.mjs) |
| `check:patch` | [`scripts/check-patch.mjs`](../scripts/check-patch.mjs) |
| `check:layers` | [`scripts/check-layers.mjs`](../scripts/check-layers.mjs) |
| `check:jsdoc` | [`scripts/check-jsdoc.mjs`](../scripts/check-jsdoc.mjs) |
| `lint` | [`.oxlintrc.json`](../.oxlintrc.json) |
| `typecheck` | [`packages/binnacle/tsconfig.json`](../packages/binnacle/tsconfig.json), the tests included |

Below the gates, the tests mount the host on a real Cordis context with a fake terminal, or with xterm's headless emulator where what the screen and its scrollback hold is the claim, as pi-tui's own tests do, and load the built bundle under plain `node` the way a profile does. Then CI installs the `dsh` launcher at the pin, writes the profile, and `check:boot` boots the bundle under it, drawing nothing.

## How it follows upstream

`pnpm upstream` reads each release past a pin. Daily, the upstream job carries the newest on a branch, `upstream/<reference>/<version>`: it moves the pin with `pnpm pin`, runs the tests and the boot, and writes the verdict in the commit message, with the log of where it stopped when it is red. It never touches `main`; merging the branch is the upgrade.
