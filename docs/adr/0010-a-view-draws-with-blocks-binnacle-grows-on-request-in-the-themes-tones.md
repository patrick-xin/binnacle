# 10. A view draws with blocks binnacle grows on request, in the theme's tones

- Status: accepted; grows what a view draws with in [ADR 2](0002-five-layers-and-the-registrations-an-author-shares.md)
- Date: 2026-09-26

## Context

[ADR 2](0002-five-layers-and-the-registrations-an-author-shares.md) gives a view a few kinds of node to draw with: data, never a component. The first were plain text, a stack, an offer, a fold and a blank. Under [ADR 0](0000-everything-is-a-plugin-a-person-changes-by-asking-an-author-agent.md), a person asks for a failed call's card in red, or for one tool's output framed on its own. No author could draw either, because nothing in the vocabulary had a colour or a border.

A region knew only its rows. Once something sits inside a border, or beside something else, the rows alone no longer say what a pointer landed on.

pi styles what its extensions draw through a theme whose colours are named by what content means: `accent`, `muted`, `dim`, `success`, `error`, `warning` (`pi:packages/coding-agent/docs/themes.md`). It hands an extension components to draw with (`pi:packages/coding-agent/docs/tui.md`).

## Decision

**A view draws with blocks: data that binnacle lays out, and grows by a block when a request needs one. Styling is a tone the theme colours, never a colour a view chooses.**

- Text takes a tone, by pi's names for what content means. The theme picks the colour, in the terminal's own palette.
- A card holds a block inside a rounded border, with its title on the top edge.
- A region knows its columns as well as its rows, so what sits inside a border is pointed at where it is drawn.
- A request the blocks cannot draw is binnacle's defect (ADR 0), met by a new block. Where pi-tui has a component that draws it, the block is laid out by that component.

## Alternatives considered

**Add a block of lines an author draws at a width.** This is a render callback returning styled lines, clipped and fenced: the shape of pi's extension renderers. Every request could be drawn at once. It lost on three counts:
- Its colours are the author's escape sequences, which the theme cannot reach.
- binnacle cannot see into its lines, so nothing inside it can offer anything.
- It would let binnacle stop growing blocks, which ADR 0 makes binnacle's job.

**Let an author colour text with escape sequences.** Nothing to grow for colour. It lost because a colour chosen in a view is one no theme reaches, and a sequence written wrong spills into the lines around it.

**Take every component pi-tui ships as a block now**: markdown, side by side, images. The vocabulary would be complete before anyone asks. It lost because a block no request uses is an author API guessed at. Each lands with the first request that needs it.

## Consequences

- An author can frame binnacle's own drawing of an entry in a card, and mark it in the theme's colours.
- The theme is the one place a colour is chosen, so when the theme becomes a registration it reaches every view.
- A new block is a change to the author API, since the node type is exported. It lands with its parsing, its layout, and a test of each.
- Text still passes through the escape sequences it holds, from an author or from the session log. Keeping sequences off the screen is a question for the views that draw the log.
