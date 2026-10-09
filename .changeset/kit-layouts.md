---
'binnacle': patch
---

An author lays out a feature's Places in a Layout of its own, and builds on the Chat's. `binnacle.layout(name, layout)` sets a Layout by any name, which a `{ layout: name }` node draws. `{ first: [...] }` draws its first child that has a line to draw, and `{ over, float, at }` draws a float on top of what it covers, where a click lands first. On any node, `unless: name` hides it while that Layout or Place has a line to draw, and `mouse: false` makes a click and the wheel inside it do nothing. A named Layout or a `first` with nothing to draw takes no cells, and a node with no size in a named Layout takes what its lines need. The package exports the Chat's own Layout as `CHAT_LAYOUT`, and the type `Anchor`.
