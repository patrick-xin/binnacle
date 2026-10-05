# A screen is a layout tree of named places

**Status:** accepted, 2026-10-05

A screen is a layout tree. Its nodes are rows and columns, and its leaves are places, each with a name. Each child is sized `fixed n`, `content` (the rows its lines need) or `fill` (a share of what is left). A plugin fills a place by its name with a part: what a part draws is its lines at the width it is given. A plugin may replace a screen's tree; the newest tree wins, and it goes when its plugin unloads.

`show(screen)` pushes a screen, and the newest screen shown is drawn. The Chat is the base screen. A screen with one place is the whole terminal.

Every node may have a box: `padding` and `gap`, in cells; a `border` on any of its sides, so a gutter is a left border; the `edge` its border is drawn with, by name; and a `title` set into its top edge. Edges, glyphs and spacing are named tables behind one lookup, and the theme gives their defaults.

The wheel scrolls the place under the pointer. The focused part takes the keys and shows the cursor.

## Considered options

- **Fixed regions: the transcript above, the composer below.** It is simpler, but an author could not put the composer on top or add a sidebar, and binnacle would hold a layout that an author cannot have.
- **Spacing for each kind of thing in the theme, as v0 had.** Each feature then decides its own spacing, and an author learns one number for each feature. A box on the node decides it in one place.

## Consequences

- A layout names places, never plugins, so an author moves the composer without changing it.
- Nothing overlaps. A Request drawn over the screen needs an overlay layer, which is a decision of its own.
- A terminal has whole cells and no stroke width: a border is thicker only by another edge, such as `heavy`, `double` or a block.
- When the terminal is too small, `fill` places shrink first, then padding and gaps go, then borders, and then content is cut. binnacle always draws. What goes, goes from the whole screen, so the screen keeps one look.
- Padding and gaps are cells. Spacing by name comes with the theme, as `number | name`, and breaks no author.
- What an author imports is the tree, the box and the part. A change to them is a one-way door.
