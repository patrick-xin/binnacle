# Tool cards

A person reads each tool call as its tool presents it, rather than as its name and raw JSON: a title saying what this call does — `Read src/api.ts`, `pnpm test` — and once it returns, what it returned, folded beneath as the tool presents it, along the gutter that marks what the surface shows and did not write.

The call stands as its mark says — `running` while it runs, `done` once it returned, `failed` in error, with why it failed when it gave a reason ([Theme](theme.md)) — and the completed call reads as the title its result presents, when it presents one. A click on the head opens what it returned and a second folds it; a click on what it returned does nothing, so selecting it leaves it as it is ([Keys](keys.md)).

## How it works

The cards are binnacle's first built-in plugin (`binnacle:packages/binnacle/src/plugins/tool-cards/index.ts#apply`), holding only what an author holds: it registers a view for the `tool` entry kind through the author API, and reaches each tool's definition through dsh's `tools` service, `get(name)` (`dsh:packages/core/tools/src/index.ts#ToolRuntime`). A tool declares how a call renders with two pure functions on its definition, `presentCall` and `presentResult` (`dsh:packages/core/tools/src/index.ts#ToolDefinition`), so a replayed session draws the same screen as a live one; why the tool's word is taken is [ADR 15](../adr/0015-a-tool-call-is-drawn-from-what-its-tool-presents.md)'s.

What a presenter returns is the tool's code, not binnacle's: it is read as data where it enters (`binnacle:packages/binnacle/src/plugins/tool-cards/presentation.ts`), and where it cannot be drawn from — no tool of that name, no presenter, or arguments that are not JSON — the entry is left to the view beneath, binnacle's own card, which still shows the call's name, arguments and result. A presenter that throws, or returns something the cards cannot draw, never takes the surface down either: the entry is left to that card, and what did it is said beneath, in error, naming the tool, the presenter and why. Returning undefined is different — dsh's own word for no presentation — and stays silent: a call presenter's undefined asks for the generic fallback, and a result presenter's keeps the presented title and the raw result. A completed call's presenter is handed the result's content rebuilt from its text blocks, a block binnacle cannot read left out, whether it failed, and its meta as logged.

Each card is a `show`, the surface's container for what it shows and did not write: the head is its title, and everything beneath the head is what it holds. A card kind's row returns a show or declines (`binnacle:packages/binnacle/src/views/cards.ts#CardRow`), so every kind of card has that container as its parent, and the theme draws it. Rows are registered through the author API by card kind, `binnacle.card(kind, row)`, the plugin's own `generic` row among them, and the plugin draws each card through the rows of its kind, the newest first (`binnacle:packages/binnacle/src/plugins/tool-cards/cards.ts#drawCard`): a row that throws, returns no show or declines is drawn over by the row beneath, saying why, and beneath the last is binnacle's own card ([Authoring](authoring.md)).

## Choices

- The tool cards are a row of binnacle's patch, `binnacle-tool-cards`, so a person removes them by disabling that row in their profile's patch ([Authoring](authoring.md#removing-a-built-in-feature)).
- What the head shows, as the show's title: the mark and the presented title — its first line beside the mark, and each later line indented two columns beneath it, so a command written on more than one line does not read as output; the tool's name and arguments stay on binnacle's own card, beneath.
- Everything under the head — `running` and the time, why it failed, what it returned — is drawn along the show's gutter, indented by it alone ([Theme](theme.md)).
- The mark the head stands by is the transcript's (`running`, `done`, `failed`), so a presented card reads at a glance beside an unpresented one ([Theme](theme.md)).
- What it returned folds as a tool's output does, its rows the theme's for the tool kind ([Theme](theme.md)); a presented `content` is folded when the tool gives one, the result's own text when not. The fold is an `output` part, so a view registered for `output` draws it on every card, handed the tool and the result's own text ([Authoring](authoring.md)).
- A failure's reason stays, in error, above the fold; so does what a presenter did wrong stay, beneath binnacle's own card, beside the `problem` mark: `read.presentCall threw: …`, naming the tool and the presenter.
- A presenter returning undefined is dsh's word for no presentation and stays silent; anything else it returns that the cards cannot draw is said beneath binnacle's own card, beside the `problem` mark, as a throw is: `read.presentCall returned no drawable view: …`.
- The plugin registers one row, `generic`; every other kind — terminal, diff, read, search, web — draws through generic's rows until a row of its own is registered, by its title alone.
- Each call a `run_code` program made is a line beneath the head, marked as a call is — `● grep {}`, `✗ read {"path":"a.ts"}` — before why it failed and what it returned; a row is handed them as its `made` part.
- A call that took a second or more says so after its head, muted — `took 1.4s`, `took 1m 05s` — its result's log time less its call's, so the same log draws the same card; a faster call says nothing, as most do.
- The head offers `copy` after `expand`, the text of all the card holds; no key is bound to `copy` until a person asks for one ([Keys](keys.md)).
- The result fold is named as binnacle's own card names it (`output`), so what a person opened stays open when the plugin is disposed, or a presenter throws and the card beneath draws the call; the naming is [Authoring](authoring.md)'s.
- `running` and the time since the call — `running 4s` — stays under a call while it runs, counting up once a second, so a presented card says what it is doing the way binnacle's own does; a call its turn left without a result says the turn ended without it, and how the turn ended, in that line's place — as binnacle's own card does ([Transcript](transcript.md)).

## Open

- [#10](https://github.com/patrick-xin/binnacle/issues/10): the terminal, diff, read, search and web cards each get their own card.
