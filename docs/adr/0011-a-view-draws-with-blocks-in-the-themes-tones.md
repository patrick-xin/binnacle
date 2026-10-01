---
status: accepted; its colours are revised by ADR 16, if that is accepted
---

# A view draws with blocks, in the theme's tones

A view returns blocks — data binnacle lays out — never components or escape sequences, and binnacle grows the vocabulary by a block when a request needs one it cannot draw. Styling is a meaning the theme colours, never a colour a view picks, and a block that holds another says what the surface is doing: an **ask** when it asks or offers, a **show** when it shows what it did not write. These containers are a closed set, so every decision and every tool call has the surface's container as its parent.

## Considered Options

- **A block of lines an author draws at a width.** Every request could be drawn at once. Rejected because its colours are escape sequences no theme reaches, binnacle cannot see into it to offer anything, and it would let binnacle stop growing blocks.
- **Name a container by how it is drawn — a card, a border.** One block would frame anything. Rejected because nothing then told a decision from a tool's output, and restyling one restyled both.
- **Take every component the library ships as a block now.** The vocabulary would be complete early. Rejected because a block no request uses is an author API guessed at.

## Consequences

- A new block is a change to the author API, since the node type is exported.
