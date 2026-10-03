# Blocks

A view draws with blocks — data, never escape sequences — and two of them are containers named for what the surface is doing: an **ask**, when it asks or offers, and a **show**, when it shows what it did not write. Whatever an ask holds, it fits the place it is given ([ADR 18](../adr/0018-an-ask-fits-the-room-it-is-given-and-a-screen-alone-scrolls.md)):

- **The room.** An ask seated where the person answers — the composer's place, or the dialog over the page — is given room in rows, read on every frame: the composer's place gives `max(12, rows − 10)`, the dialog four fifths of the terminal's rows. An ask anywhere else — in the transcript, on a screen, inside another ask — scrolls with what holds it and is given no room.
- **Its edges are always drawn.** The top edge carries the ask's title; the bottom edge names the keys that answer it, as the key table binds them. An ask taller than its room is never cut: its prose is paged first, then its offers are shown in a window.
- **Prose is paged by keys.** What the ask holds above its offers is its prose. When the prose alone is too tall, the rows left page it — `shift+↑` and `shift+↓`, keeping one row of the last page — and a row beneath the page shown says which page it is on (`page 2/5`), muted. The bottom edge names the paging keys only while the prose is paged.
- **Offers are windowed.** When the offers are too many for the rows left, a window of whole offers shows, holding whatever has focus and following it as focus moves; only what is shown can be clicked. The bottom edge says where the window is — `7/20`, the focused offer's number among all of them. PageUp and PageDown move focus a window's worth of offers on, clamped at the ends, never wrapping.
- **A box of one's own.** An ask may name its own `rows` — a whole number from three — and a theme may give every ask one (`asks.rows`): a box of exactly that height, padded inside when what it holds is shorter, windowed and paged the same way, never taller than its room ([Theme](theme.md), [Authoring](authoring.md)).
- **The wheel does nothing over an ask.** Nothing scrolls inside one; scrolling is a screen's. What a click inside an ask means is the gesture table's, as everywhere ([Keys](keys.md)).

## How it works

The ask lays out its child at the width it is given and, when its room or its own rows make it taller than what fits, splits what it holds at the first offer: the rows above are the prose, the rows from there are the offers. When the offers fit in the rows left less four, they are drawn whole and the prose is paged in the rest; otherwise the prose is paged to at most three rows and the offers are windowed in what remains. A window shows whole offers only, and moves the least that brings the focused offer in (`binnacle:packages/binnacle/src/ui/layout.ts`). Where its page and its window stand is UI state the pane that drew the ask keeps, laid out with it and clamped back after (`binnacle:packages/binnacle/src/ui/state.ts`); focus reaches every offer, the windowed away included, so Tab and the arrows move through them all and the window follows.

The room is the host's to give, at one table of what each place gives the pane seated in it (`binnacle:packages/binnacle/src/host/seats.ts`), handed down on every frame beside the time and the key table — never decided again where the pane is drawn. Paging and jumping are bindings in the one key table ([ADR 8](../adr/0008-a-key-means-something-only-through-one-key-table.md)): `binnacle.ask.pageUp` and `binnacle.ask.pageDown` on the shift arrows, and PageUp and PageDown, which pi-tui names `tui.select.pageUp` and `tui.select.pageDown`, jump a window — while a seat offers, they are the ask's; otherwise they are the screen's, scrolling it as they do. The ask says where it is in the theme's words — `offer.at`, `page.at`, `page` — as its other words are ([Theme](theme.md)).

## Choices

- The composer's place gives `max(12, rows − 10)` rows — legacy's figures — and the dialog four fifths of the terminal's rows, matching its width.
- Prose pages keep one row of the last page, so no page is read from nothing; the position row sits directly under the page shown.
- A window shows whole offers only, never half of one; the rows it leaves are blank inside the ask's edges.
- `rows` on an ask, and `asks.rows` in a theme, are whole numbers from three: an ask keeps its two edges and at least one row inside them.
- An ask whose room leaves less than three rows inside its edges is drawn whole, as no room was given.

## Open

- [#82](https://github.com/patrick-xin/binnacle/issues/82): a detail too long even to page, read on a screen of its own.
- [#88](https://github.com/patrick-xin/binnacle/issues/88): an author changes what a gesture means, a click inside an ask included.
