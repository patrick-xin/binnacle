# plugins/tool-cards

The tool cards: each tool call drawn from what its tool presents, inside a `show` — its title saying what the call does, and beneath it along the gutter, how it stands, and once it returns, what it returned, folded. It holds the `binnacle` service, to register a view for the `tool` entry kind, and dsh's `tools` service, to reach the definition that presents each call; presenters are each tool's own, and the card beneath is binnacle's.

- `cards.ts` — the table of cards: the row that draws each card kind inside a show, and the parts a row is handed.
- `generic.ts` — the generic card: a show titled by the call, holding its result's presented content or own text, folded; every kind without a row draws through it.
- `index.ts` — the plugin, and the view that presents a call and its result and draws them through the card kind's row.
- `presentation.ts` — what presenters are handed and return, read as data, and the text of a title, a result and presented content.

## Keep

- Presenter code belongs to the tool, not to binnacle, so what it returns is parsed in `presentation.ts`, where it enters: a view of a kind binnacle does not draw reads as no view at all, and nothing a presenter does can take the surface down.
- The shapes presenters return are dsh's presentation vocabulary (`dsh:packages/core/tools/src/presentation.ts`); nothing here imports it at run time, only narrows what was already read off a definition.
