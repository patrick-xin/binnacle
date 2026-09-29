# Glossary

Every term the code and the docs use, whose word it is, and what it means here. Use the owner's term; coin one only when no owner has it, and add it here in the same change. Why a term exists is its decision record's; this page only says what it means, and where a term names code, it cites it.

## Ours

| Term | Means |
| --- | --- |
| **fact** | One session event as binnacle's own type (`binnacle:packages/binnacle/src/facts/adapt.ts#Fact`, [ADR 4](adr/0004-a-fact-is-one-event-and-what-dsh-folds-is-taken-from-dsh.md)). A kind no adapter reads is an `unknown` fact carrying its raw record. Facts are the only input a model or view reads. |
| **quiet** | Of a kind of event dsh knows: one the transcript draws as nothing by default — the session's machinery, what dsh web's Chat shows no row for. Every kind dsh knows is named, as read, quiet or unread, in one table (`binnacle:packages/binnacle/src/facts/kinds.ts#kinds`); a view registered for a quiet kind, by its dsh type, draws it again. [Transcript](features/transcript.md). |
| **model** | A pure fold over facts. Knows no drawing. |
| **transcript** | The model of a session as turns (`binnacle:packages/binnacle/src/models/transcript.ts#transcript`), folded one fact at a time. |
| **turn** | What a person sent and everything the agent did about it, and why it ended; a turn numbered `null` holds what the log carries before its first turn. dsh's word, grouped by us. |
| **entry** | One thing a turn holds: a fact, or a tool call paired with its result once it has one, an approval paired with the decision that answered it, a command paired with the done that settled it, or a compaction folded from its start, summary and end (`binnacle:packages/binnacle/src/models/transcript.ts#Entry`). Steps are not entries. |
| **steer** | Of a prompt: it reached a turn that already held one — a line the person sent while the agent worked, handed the running turn at its next step — marked `steer` on the entry (`binnacle:packages/binnacle/src/models/transcript.ts#Entry`) and drawn with the `steer` mark. dsh's word. [Transcript](features/transcript.md). |
| **view** | `(entry, next) → Node`: draws one kind of entry, and declares the affordances on what it drew (`binnacle:packages/binnacle/src/views/entries.ts#View`). Views of one key stack; the newest draws, and `next` draws the entry as the view beneath it does, binnacle's own at the bottom ([ADR 8](adr/0008-a-view-builds-on-the-one-beneath-it-and-the-newest-draws.md)). |
| **node** | What a view returns: data, laid out by the ui with pi-tui (`binnacle:packages/binnacle/src/ui/node.ts#Node`). The vocabulary grows a block at a time, as requests need one ([ADR 10](adr/0010-a-view-draws-with-blocks-binnacle-grows-on-request-in-the-themes-tones.md)). |
| **tone** | A colour of the theme's, named by what the content drawn in it means; pi's names (`binnacle:packages/binnacle/src/ui/theme.ts#tones`). |
| **background** | A fill of the theme's, named by what the content drawn on it means (`binnacle:packages/binnacle/src/ui/theme.ts#backgrounds`); a band names one, as a view names a tone. Ours. |
| **mark** | A glyph of the theme's, named by what it stands for, with the tone it is drawn in (`binnacle:packages/binnacle/src/ui/theme.ts#marks`). A span names a mark and the theme draws it; the marks a view may name are the author API's `Mark` (`binnacle:packages/binnacle/src/api.ts`). Our word. |
| **chrome** | What binnacle draws around the content — the composer and the rest ([ADR 0](adr/0000-everything-is-a-plugin-a-person-changes-by-asking-an-author-agent.md)). The theme's chrome is the glyphs the chrome draws with, held beside the marks (`binnacle:packages/binnacle/src/ui/theme.ts#chrome`); a view names none of them. |
| **card** | A node holding another inside a rounded border, its title on the top edge. |
| **band** | A node holding content padded within a background the theme holds, filled with it line by line. Ours. |
| **markdown** | A node that draws its text as a markdown document, laid out by pi-tui's component in the theme's tones. |
| **fold** | A node that draws what it holds cut to rows, offering `expand`: its marker beneath them says what it cut, and rides the line it folds under when it shows none. How many rows it shows while folded, and whether it starts open, are the theme's, by the kind of entry it is drawn in, unless the fold names its own ([Theme](features/theme.md)). Ours. |
| **span** | One run of a text node's line: its text in the node's tone as a bare string, in a tone of its own, one of the theme's marks, whose glyph the theme draws in the mark's tone or the span's own, or the time since a moment, in milliseconds since the epoch, written as the time from it as time passes (`binnacle:packages/binnacle/src/ui/node.ts#Span`). |
| **fallback view** | How an entry no view claims is drawn: its type in one line, and `expand` to the raw record. It also says what went wrong when an author's adapter or view failed. |
| **layer** | A folder of `src`, or the module `api.ts`, and what it may import: [`layers.json`](../packages/binnacle/layers.json) ([ADR 2](adr/0002-five-layers-and-the-registrations-an-author-shares.md)). |
| **contract** | The layer holding what otherwise-independent layers share. |
| **ui** | The nodes views draw with, layout, the gesture table and UI state. |
| **pane** | A pi-tui component that draws views and holds UI state, deterministic in what it was given ([ADR 6](adr/0006-a-pane-joins-views-to-pi-tui-and-the-host-keeps-only-what-is-impure.md)); the transcript is one. |
| **host** | The one layer that touches the terminal and the process. |
| **author API** | What an author may depend on: the `binnacle` service and the types its registrations take (`binnacle:packages/binnacle/src/api.ts#Registrations`). |
| **feature** | What a person can do with binnacle, named as they would ask for it, wherever it is built: the host, a pane, or a built-in feature. Each has a page, listed in the feature map; its own choices are a person's to change ([ADR 0](adr/0000-everything-is-a-plugin-a-person-changes-by-asking-an-author-agent.md)). |
| **feature map** | [`docs/features.md`](features.md): every feature's page, under the stage it serves. |
| **package map** | [`packages/binnacle/README.md`](../packages/binnacle/README.md): what each layer of the code is for, how a session and a gesture pass through them, and where a change goes. |
| **stage** | A step of a person's journey through a session — arrive, ask, watch, decide, steer, review, leave, tune — which the feature map groups features by. |
| **built-in feature** | A Cordis plugin in `src/plugins` holding only what an author holds ([ADR 5](adr/0005-a-built-in-feature-is-a-plugin-that-holds-only-what-an-author-holds.md)). |
| **affordance** | Something a person can do with a piece of content, such as `expand` or `grant` (`binnacle:packages/binnacle/src/contract/index.ts#affordances`). Its policy — whether a click may invoke it — belongs to its kind ([ADR 1](adr/0001-content-offers-affordances-the-surface-owns-gestures.md)). |
| **primary affordance** | The first a region offers; what a click or the primary key invokes. |
| **region** | A part of the screen a gesture can land on: an id, the affordances it offers, and whether it overflows. Laid out, it covers rows and columns. Its id names it within the entry that drew it; the screen scopes the name to that entry, so one name in two entries is two regions. |
| **focus** | The region the keys act on (`binnacle:packages/binnacle/src/ui/state.ts#UiState`). binnacle's focus is a region in a pane; pi-tui's is the component taking keys, the composer, which is a different thing. |
| **key table** | The one table a key is matched in: pi-tui's, extended with binnacle's bindings and held in one manager (`binnacle:packages/binnacle/src/ui/keys.ts#keyTable`, [ADR 13](adr/0013-a-key-means-something-only-through-the-one-key-table.md)). It answers a press only, once; nothing else in binnacle matches a key. |
| **gesture** | What a person did before it means anything: a click, the wheel, a drag, hovering, or a key resolved to a binding. |
| **gesture table** | The one place a gesture is given a meaning (`binnacle:packages/binnacle/src/ui/gestures.ts#meaning`). |
| **action** | What a gesture means: invoke an affordance, scroll a region, select, or move or drop focus. |
| **binding** | A named key of the one key table, rebindable by its id: pi-tui's own, binnacle's, a placed screen's, or one per affordance kind — unbound until a person binds it ([Keys](features/keys.md)). |
| **registration** | What an author or a built-in feature contributes through `ctx.binnacle`, each an effect of the plugin that made it ([ADR 2](adr/0002-five-layers-and-the-registrations-an-author-shares.md)). |
| **authored fact** | A fact an author's adapter made from an event kind, named by them; drawn by the view registered under its name, or by the fallback. |
| **settled** | Of an entry: nothing later in the log can change it. Every entry has settled but one still waiting for what settles it — a call its result, an approval its decision, a command its done, a compaction its end — and those after it (`binnacle:packages/binnacle/src/models/transcript.ts#settled`). |
| **left** | Of a tool call: its turn ended before any result answered it; the value is how the turn ended, as dsh names it (`binnacle:packages/binnacle/src/models/transcript.ts#Entry`). A result arriving late answers the call and the mark is gone. |
| **printed** | On the main screen, a row binnacle has handed to the scrollback; it never changes again ([ADR 12](adr/0012-on-the-main-screen-a-printed-row-never-changes.md)). What can still change is drawn below the printed rows. |
| **placement** | What `ctx.binnacle.place` puts in a slot of the page — binnacle's transcript, binnacle's composer, or lines of a plugin's own (`binnacle:packages/binnacle/src/api.ts#Placement`); each an effect of the plugin that placed it ([ADR 11](adr/0011-placements-reach-the-whole-screen-and-the-built-in-surface-is-placed-through-them.md)). |
| **slot** | One of the four places a placement goes, top to bottom: the transcript's place, lines above the composer, the composer's place, lines below it (`binnacle:packages/binnacle/src/api.ts#Slot`). Ours. |
| **surface** | Where the session stands, as the host reads it live from the session and hands to what lines draw, read-only (`binnacle:packages/binnacle/src/api.ts#Surface`): the model the session runs, whether a turn is running, the tokens used and the context filled when dsh has measured them, and a notice while one stands. Never folded again from the log. Ours. |
| **notice** | A word standing in the [Status line](features/status-line.md)'s place for its moment: what a second Ctrl+C does, or what went wrong. Ours. |
| **placed screen** | A screen a plugin places in the transcript's place, in the alternate screen's scroll view — drawn with nodes as a view draws (`binnacle:packages/binnacle/src/panes/screen.ts#ScreenPane`), handed the session's facts read-only, answering the transcript's gestures with UI state of its own, opened with the key its plugin offers in the one key table; from the main screen, opened by switching to the alternate screen. Ours. |
| **Trajectory** | The session's ledger: every event it logged, one line each, grouped by turn, any line opening to its record — a placed screen the Trajectory plugin places (`binnacle:packages/binnacle/src/plugins/trajectory/index.ts#trajectory`), opened with Ctrl+O. dsh web's word for its own ledger of a session. |
| **grant** | The affordance a person gives an approval with; a key, never a click. Also, in "grants, not the tree": what a plugin is handed instead of pi-tui components, including an effect the host performs for it. |
| **author** | An agent a person asks to customize binnacle; it registers through the same doors the built-in surface does ([ADR 0](adr/0000-everything-is-a-plugin-a-person-changes-by-asking-an-author-agent.md)). |
| **extension skill** | The dsh skill binnacle registers so that an author agent, in its session, can find the author API and learn how to use it. It is held to the source like any restated fact. |
| **seam** | A named place binnacle reaches dsh through, held by a gate ([ADR 3](adr/0003-dsh-is-reached-through-named-seams-each-held-by-a-gate.md)); in tests, the public boundary a test is written at. |
| **gate** | A check `pnpm test` runs that refuses a class of defect: `check:*`, `lint`, `typecheck`. |
| **reference** | A repository read and never written, fetched into `.refs/<name>` at its pin ([`references.json`](../references.json)). |
| **pin** | The commit, and for a release line the tag, a reference is read at; packages that follow it are pinned to match. |
| **citation** | `` `name:path` ``, naming a file in a reference, resolved at its pin, or in this repository under the name `binnacle`; an optional `#symbol` must be found there. Never in a decision record, which is not edited to follow a move. |
| **upstream branch** | `upstream/<reference>/<version>`: a release past a pin, carried by the upstream job with the canary's verdict in its commit. |
| **canary** | Moving a pin, then the tests and the boot, as the upstream job runs them; green, or red with the log of where it stopped. |

## dsh's

| Term | Means |
| --- | --- |
| **harness** | dsh: the agent loop, the session log, tools, commands, settings, credentials, presets. |
| **command** | A slash line the harness runs itself, never sent to the model: registered by a plugin with dsh's command registry (`dsh:packages/interaction/commands/src/index.ts#CommandRuntime`), and logged as the lifecycle pair `command/run` and `command/done`, joined by the command's id. binnacle runs one through the `command` grant ([Composer](features/composer.md)). dsh's word. |
| **approval** | A permission the harness asks a person to decide: asked down the `approval/request` waterfall, settled `allowed-once`, `rejected`, `cancelled` or `unavailable`, and logged as the audit pair `approval/asked` and `approval/decided`, joined by the request's id (`dsh:packages/interaction/user-approval/src/index.ts#ApprovalService`). binnacle's [Approvals](features/approvals.md) answers it. dsh's word. |
| **compaction** | What the harness does when the context fills: it replaces a range of the model-visible surface with one summary message the model reads in the shadowed history's place, logging the transaction `compaction/start`, `compaction/summary` and `compaction/end`, joined by the compaction's id, and the checkpoint `user/message` that carries the summary to the model (`dsh:packages/compaction/compaction/src/types.ts`). The transcript keeps everything shadowed and draws one marker where the compaction started ([Transcript](features/transcript.md)). dsh's word. |
| **card** | The kind of view a tool presents one of its calls or results as: the `card` field of a `ToolCallView` or a `ToolResultView` (`dsh:packages/core/tools/src/presentation.ts`). dsh's word, for tool calls; binnacle's card node is another thing. |
| **presenter** | One of a tool's `presentCall` and `presentResult`: pure functions saying how one of its calls renders, in a UI and on replay alike (`dsh:packages/core/tools/src/index.ts#ToolDefinition`). dsh's word. |
| **launcher** | The `dsh` binary, from `@deepseek-ai/dsh`; it composes a profile and mounts it. |
| **bundle** | A package whose `package.json` names a Cordis patch under `dsh.bundle`; binnacle is one. |
| **profile** | A directory under `$DSH_HOME/profiles/` stacking bundles; `binnacle` stacks `dsh-base`, then binnacle. |
| **dsh-base** | The bundle below binnacle: the harness's own rows. |
| **row** | One entry in the composed tree: a plugin, its id and its config. A patch inserts, configures or disables rows by id. |
| **preset** | A named agent configuration; a preset can run a different tool loop, logging kinds binnacle has never seen. |
| **session log** | A session's events in order: what was sent, streamed, called and decided. |
| **event kind** | The `type` of a session log event; dsh packages add kinds by augmenting `SessionEventMap`. |
| **skill** | Instructions the agent can load by name: found in a directory, or registered by a plugin (`dsh:packages/skill/skill/src/index.ts#SkillRegistration`). |

## Cordis's

| Term | Means |
| --- | --- |
| **context** (`ctx`) | What a plugin is applied with: its services, events and effects. |
| **plugin** | A module exporting `name`, `inject` and `apply`. |
| **service** | A named value on the context; `inject` lists those a plugin needs. |
| **effect** | A contribution registered through `ctx.effect` and undone when its plugin is disposed. |
| **fiber** | A plugin's running instance; disposing it disposes its effects. |

## pi-tui's

| Term | Means |
| --- | --- |
| **component** | Anything with `render(width): string[]`, and optionally input and mouse handlers. |
| **invalidate** | Drop what a component kept, so its next render draws it again. binnacle's registration of the same name does this for the entries of one key ([ADR 9](adr/0009-a-view-is-drawn-once-for-each-entry-and-again-when-its-author-invalidates-it.md)). |
| **main screen** / **alternate screen** | `TuiMainScreen` draws into the terminal's scrollback; `TuiAltScreen` owns a full screen. |
| **TUI mode**: **regular** / **fullscreen** | pi's words for drawing on the main screen and on the alternate screen (`TuiMode`); a person picks one with `--tui-mode` ([TUI mode](features/tui-mode.md)). |
| **terminal** | pi-tui's `Terminal`: the one object the host writes to and reads input from. |
| **user bindings** | The bindings a person has set over the defaults, by id; the manager holds and resolves them (`pi:packages/tui/src/keybindings.ts#KeybindingsManager`). |
