# Only a float draws over what it covers

**Status:** accepted, 2026-10-09

A Layout's nodes share the cells of their parent, and no two of them draw in one cell. A float is the one exception. A node `{ over, float, at }` draws `over` in all of its cells, then draws `float` on top of it, while `float` has a line to draw. `at` says where the float goes, and how wide it is. The float's height is what its lines need.

A click and the wheel land on the float before what it covers. Where the float covers it, what is beneath gets no click and no wheel, and its cursor is not drawn.

## Considered options

- **Nothing overlaps.** A Request, a menu or a notice then takes rows from what is beside it, and the transcript moves each time one comes and goes. An author could not draw a dialog over the Chat.
- **Layers of Screens, each drawn on the ones beneath.** Every Screen would then hold its own Focus and its own clicks for each layer, and an author would reason about a stack where one node is enough.
- **Any node may overlap with a position of its own.** It is the most open, but a click, the Focus and the order of drawing then depend on every node, and a terminal too small for the layout has no rule for what to give up.

## Consequences

- A float is part of the Layout's tree, so it goes with the plugin that set the Layout, as every node does.
- A float with nothing to draw takes no cells, and what it covers is drawn whole.
- A float does not block what it covers: keys go where the Focus is. A dialog that blocks needs a decision of its own.
- What an author imports grows by one kind of node. A change to it is a one-way door.
