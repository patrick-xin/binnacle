# Tool cards

A person reads each tool call as its tool presents it, rather than as its name and raw JSON: a title saying what this call does — `Read src/api.ts`, `pnpm test` — and once it returns, what it returned, folded beneath as the tool presents it.

The call stands as its mark says — `running` while it runs, `done` once it returned, `failed` in error, with why it failed when it gave a reason ([Theme](theme.md)) — and the completed call reads as the title its result presents, when it presents one. A click opens the fold, as anywhere else ([Keys](keys.md)).

## How it works

The cards are binnacle's first built-in plugin (`binnacle:packages/binnacle/src/plugins/tool-cards/index.ts#apply`), holding only what an author holds: it registers a view for the `tool` entry kind through the author API, and reaches each tool's definition through dsh's `tools` service, `get(name)` (`dsh:packages/core/tools/src/index.ts#ToolRuntime`). A tool declares how a call renders with two pure functions on its definition, `presentCall` and `presentResult` (`dsh:packages/core/tools/src/index.ts#ToolDefinition`), so a replayed session draws the same screen as a live one; why the tool's word is taken is [ADR 15](../adr/0015-a-tool-call-is-drawn-from-what-its-tool-presents.md)'s.

What a presenter returns is the tool's code, not binnacle's: it is read as data where it enters (`binnacle:packages/binnacle/src/plugins/tool-cards/presentation.ts`), and where it cannot be drawn from — no tool of that name, no presenter, or arguments that are not JSON — the entry is left to the view beneath, binnacle's own card, which still shows the call's name, arguments and result. A presenter that throws, or returns something the cards cannot draw, never takes the surface down either: the entry is left to that card, and what did it is said beneath, in error, naming the tool, the presenter and why. Returning undefined is different — dsh's own word for no presentation — and stays silent: a call presenter's undefined asks for the generic fallback, and a result presenter's keeps the presented title and the raw result. A completed call's presenter is handed the result's content rebuilt from its text blocks, a block binnacle cannot read left out, whether it failed, and its meta as logged.

## Choices

- What the head shows: the mark and the presented title — its first line beside the mark, and each later line indented two columns beneath it, so a command written on more than one line does not read as output; the tool's name and arguments stay on binnacle's own card, beneath.
- The mark the head stands by is the transcript's (`running`, `done`, `failed`), so a presented card reads at a glance beside an unpresented one ([Theme](theme.md)).
- What it returned folds as a tool's output does, its rows the theme's for the tool kind ([Theme](theme.md)); a presented `content` is folded when the tool gives one, the result's own text when not.
- A failure's reason stays, in error, above the fold; so does what a presenter did wrong stay, beneath binnacle's own card, beside the `problem` mark: `read.presentCall threw: …`, naming the tool and the presenter.
- A presenter returning undefined is dsh's word for no presentation and stays silent; anything else it returns that the cards cannot draw is said beneath binnacle's own card, beside the `problem` mark, as a throw is: `read.presentCall returned no drawable view: …`.
- Which kind of card draws how is a table (`binnacle:packages/binnacle/src/plugins/tool-cards/cards.ts#rowFor`), generic its one row; every other kind — terminal, diff, read, search, web — draws through generic's until its own lands, by its title alone.
- The result fold is named as binnacle's own card names it (`output`), so what a person opened stays open when the plugin is disposed, or a presenter throws and the card beneath draws the call; the naming is [Authoring](authoring.md)'s.
- `running` and the time since the call — `running 4s` — stays under a call while it runs, counting up once a second, so a presented card says what it is doing the way binnacle's own does; a call its turn left without a result says the turn ended without it, and how the turn ended, in that line's place — as binnacle's own card does ([Transcript](transcript.md)).

## Open

- [#10](https://github.com/patrick-xin/binnacle/issues/10): the terminal, diff, read, search and web cards each get their own card.
