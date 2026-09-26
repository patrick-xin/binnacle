# Glossary

Every term the code and the docs use, whose word it is, and what it means here. Use the owner's term; coin one only when no owner has it, and add it here in the same change. Why a term exists is its decision record's; this page only says what it means.

## Ours

| Term | Means |
| --- | --- |
| **fact** | One session event adapted to binnacle's own type by `adapt` ([ADR 4](adr/0004-a-fact-is-one-event-and-what-dsh-folds-is-taken-from-dsh.md)): a prompt, context, an answer, a call, a result, or `unknown`. Facts are the only input a model or view reads. |
| **model** | A pure fold over facts: turns, the agents tree, status. Knows no drawing. |
| **transcript** | The model of a session as turns: `transcript(facts)` in `src/models/transcript.ts`, built by `fold`, one fact at a time. |
| **turn** | What a person sent and everything the agent did about it, and why it ended; `turn: null` holds what the log carries before its first turn. dsh's word, grouped by us. |
| **entry** | One thing a turn holds: a prompt, context, an answer, a tool call with its result once it has one, a result whose call is not in its turn, or an unknown fact. Steps are not entries. |
| **view** | `(entry) → Node`: draws one kind of entry, and declares the affordances on what it drew with `offer` and `fold` nodes. |
| **node** | What a view returns: `text`, `blank`, `stack`, `offer` (content and the affordances it offers) or `fold`; data, laid out by the ui with pi-tui. |
| **fallback view** | The view for a kind of fact no view claims: its type in one line, and `expand` to the raw record. |
| **layer** | One of `contract`, `facts`, `models`, `views`, `ui`, `host`; what each may import is [`layers.json`](../packages/binnacle/layers.json) ([ADR 2](adr/0002-five-layers-and-the-registrations-an-author-shares.md)). |
| **contract** | The layer every other may import and that imports nothing: the vocabulary below. |
| **ui** | The components, layout, the gesture table and UI state. |
| **host** | The one layer that touches the terminal and the harness runtime. |
| **affordance** | Something a person can do with a piece of content: `expand`, `choose`, `open`, `copy`, `answer`, `grant`, `dismiss`. Its policy — whether a click may invoke it — belongs to its kind ([ADR 1](adr/0001-content-offers-affordances-the-surface-owns-gestures.md)). |
| **primary affordance** | The first a region offers; what a click or the primary key invokes. |
| **region** | A part of the screen a gesture can land on: an id, the affordances it offers, and whether it overflows. |
| **gesture** | What a person did before it means anything: a click, the wheel, a drag, hovering, or a key resolved to a binding. |
| **gesture table** | `meaning(gesture, under)` in `src/ui/gestures.ts`: the one place a gesture is given a meaning. |
| **action** | What a gesture means: invoke an affordance, scroll a region, select, or move focus. |
| **binding** | A named, rebindable key: focus movement, the primary affordance, or one affordance by kind. |
| **registration** | What an author contributes through `ctx.binnacle`, the service the host provides: `facts(type, adapter)` reads a dsh event kind as an authored fact, `view(key, view)` draws an entry kind or an authored fact. Each is an effect of the plugin that made it. Affordances and commands, bindings and placements join with their first use ([ADR 2](adr/0002-five-layers-and-the-registrations-an-author-shares.md)). |
| **authored fact** | A fact an author's adapter made from an event kind, named by them; drawn by the view registered under its name, or by the fallback. |
| **placement** | Where registered content goes: a screen or a side panel. |
| **grant** | The affordance a person gives an approval with; a key, never a click. Also, in "grants, not the tree": what a plugin is handed instead of pi-tui components. |
| **author** | An agent a person asks to customize binnacle; it registers through the same doors the built-in surface does. |
| **seam** | A named place binnacle reaches dsh through, held by a gate ([ADR 3](adr/0003-dsh-is-reached-through-named-seams-each-held-by-a-gate.md)); in tests, the public boundary a test is written at. |
| **gate** | A check `pnpm test` runs that refuses a class of defect: `check:*`, `lint`, `typecheck`. |
| **reference** | A repository read and never written, fetched into `.refs/<name>` at its pin ([`references.json`](../references.json)). |
| **pin** | The commit, and for a release line the tag, a reference is read at; packages that follow it are pinned to match. |
| **citation** | `` `name:path` ``, naming a file in a reference, resolved at its pin. |
| **upstream branch** | `upstream/<reference>/<version>`: a release past a pin, carried by the upstream job with the pin moved and the canary run. |
| **canary** | The tests and the boot run against a moved pin, whose verdict the upstream branch's commit carries. |

## dsh's

| Term | Means |
| --- | --- |
| **harness** | dsh: the agent loop, the session log, tools, commands, settings, credentials, presets. |
| **launcher** | The `dsh` binary, from `@deepseek-ai/dsh`; it composes a profile and mounts it. |
| **bundle** | A package whose `package.json` names a Cordis patch under `dsh.bundle`; binnacle is one. |
| **profile** | A directory under `$DSH_HOME/profiles/` stacking bundles; `binnacle` stacks `dsh-base`, then binnacle. |
| **dsh-base** | The bundle below binnacle: the harness's own rows. |
| **row** | One entry in the composed tree: a plugin, its id and its config. A patch inserts, configures or disables rows by id. |
| **preset** | A named agent configuration; a preset can run a different tool loop, logging kinds binnacle has never seen. |
| **session log** | A session's events in order: what was sent, streamed, called and decided. |
| **event kind** | The `type` of a session log event; dsh packages add kinds by augmenting `SessionEventMap`. |

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
| **main screen** / **alternate screen** | `TuiMainScreen` draws into the terminal's scrollback; `TuiAltScreen` owns a full screen. |
| **terminal** | pi-tui's `Terminal`: the one object the host writes to and reads input from. |
