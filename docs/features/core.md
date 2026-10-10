# Core

Row `binnacle` · Code `binnacle:packages/binnacle/src/index.ts#apply` · Intent: none yet

The core is not a feature that a person turns off: it owns the terminal, and every feature needs it.

## What a person can do

- Start binnacle with `dsh --profile binnacle`. It opens the Chat on a new session.
- Open a stored session with `dsh --profile binnacle --session <id>`. It is drawn, and nothing can be sent to it.
- Scroll the Place under the pointer with the wheel.
- Keep their place in a Place that follows a cursor, such as a List's: its view moves only as far as the cursor needs. The transcript keeps its Marked event's header on the top row.
- Suspend binnacle with ctrl+z, and come back to it.
- Get the terminal back as it was when binnacle exits, crashes or is suspended. What other code wrote while binnacle drew is written after, in order.

## What an author can change

- The Chat's layout: `binnacle.layout('chat', …)` replaces its tree of Places, so the composer can go on top or a Place can be added. The Chat's own Layout is exported as `CHAT_LAYOUT`, to build on.
- A Layout set by a name of their own, with `binnacle.layout(name, …)`, which a `{ layout: name }` node draws.
- The other nodes: `{ first: [...] }` draws its first child that has a line to draw, and `{ over, float, at }` draws a float on top of what it covers.
- On any node: `unless: name` hides it while the Layout or the Place by that name has a line to draw, and `mouse: false` makes a click and the wheel inside it do nothing.
- A Screen of their own: `binnacle.show(…)`.
- What a Place draws: `binnacle.place(name, part)`; the newest Part wins.
- Anything a built-in row registers: what an author registers ranks above it, whichever loads first.
- A Place's box: padding, gap, borders, a title, and an edge style by name.
- How a Place follows its Part's cursor: `follow` on the Part, `'end'` or `'least'`.

The author API is `binnacle:packages/binnacle/src/api.ts#Binnacle`, exported from binnacle's entry with `toPlainText` and `CHAT_LAYOUT`.

## How it is built

- **A feature is a Cordis plugin on the `binnacle` service** ([ADR 1](../adr/0001-a-feature-is-a-cordis-plugin-on-the-binnacle-service.md)). The core is one row, and each feature is a row of its own, which a person turns off in their profile's patch.
- **A Screen is a layout tree of named Places** ([ADR 2](../adr/0002-a-screen-is-a-layout-tree-of-named-places.md)). The Chat's tree is `binnacle:packages/binnacle/src/core/chat.ts#CHAT_LAYOUT`, frozen, as an author builds on it: the transcript fills, then the status line, the Layout `request` that the Requests' view sets, and the composer take what their lines need. The composer is `unless: 'request'`, so a Request stands in its spot. `binnacle:packages/binnacle/src/core/layout.ts#arrange` lays it out; a terminal too small gives up padding, gaps and borders before it cuts rows. A node that takes what its lines need, with less room than that, first shrinks the nodes in it that fill, down to none: the screen is too small only when what does not fill is cut. In a column, the nodes that fill share the rows left by need: each takes no more than its lines need while another needs more, the fewest first, and what is left after is shared evenly. So a Request's short question stays whole above many Choices, and its rule stays.
- **A Layout's tree is grown before each draw** (`binnacle:packages/binnacle/src/core/tree.ts#grow`). Each `{ layout: name }` node holds the newest Layout set by that name, and each node knows its size. A node with no size fills in a Screen's own Layout, and takes what its lines need in a Layout set by name. A Layout that draws itself, at any depth, draws nothing the second time.
- **A node can take no cells, its box included**: a named Layout or a `first` with no line to draw, and a node hidden by `unless`. Its parent lays out its other children as if it were not there, so no gap is kept for it. A node has a line to draw while a Place in it does. An `unless` that names a Layout it is in finds no lines there, so it always ends.
- **Only a float draws over what it covers** ([ADR 3](../adr/0003-only-a-float-draws-over-what-it-covers.md)). The float is centred across, at the top, the bottom or the centre, and 4 cells narrower than what it covers, at most 80, unless `at.width` says. The layout keeps the cells that a click and the wheel land on, the topmost first: a float's Places, then its whole box, which hits nothing, then what it covers. So a click on a float's border reaches nothing beneath it, and a float inside a float stays on top. A cursor that it covers is not drawn. A float with a line to draw gives its node a line to draw, and its height and width when the node takes what its lines need: the float's width, with its margin, or `at.width`. A node of a fixed size counts as that size when its parent measures what its lines need, so a float holding a `{ fixed: n }` node is as high as `n`, not as what the node holds.
- **`mouse: false` holds for each Place inside the node.** A click or the wheel on such a Place does nothing, and moves no Focus. It does not go to what is beneath.
- **Edges** are a named table: `binnacle:packages/binnacle/src/core/theme.ts#edges`. A box's borders are drawn in the theme's `border` Tone, and its default edge, padding and gap are the theme's ([Kit](kit.md)).
- **A row ends where its style does.** The display clears each row to its end, so the blanks at a row's end are not written while no style is open. The layout follows each style to where it is closed, as a border closes only what it opened.
- **Each registration is held apart**: a Part placed, a Layout, a Screen shown, a named Model and a theme layer. When a plugin unloads, only its own registrations go, even when another plugin registered the same object, and the newest one left wins again. A plugin that registers while it unloads holds nothing: the call throws Cordis's error, and the screen does not change.
- **A built-in's registration ranks beneath an author's**, whichever loads first, so an author's plugin wins on every start. Among the built-ins, and among the authors, the newest wins. The core reads the registering plugin's fiber, and walks up to the first that has a loader entry, as the loader's `locate` does (`dsh:vendor/loader/src/index.ts#Loader`). A registration is a built-in's when that entry's `name` is `binnacle` or begins with `binnacle/`: each row of the bundle's patch, and no list kept by hand. A plugin with no entry ranks as an author's. This holds for every registration, an action and a binding too.
- **A Place follows its Part's cursor as the Part's `follow` says.** With `'end'`, the default, the Place shows its end, or the rows the wheel scrolled to, and a cursor outside them is brought to the nearest edge for that draw: below to the bottom row, above to the top row. So the transcript keeps its Marked event's header on the top row. With `'least'`, the rows that a draw shows are kept as the Place's scroll, so the next draw starts from them, and the cursor moves them only as far as its row needs.
- **A scroll by an author wins over the cursor until the cursor moves.** The Place with the Focus shows the row of its Part's cursor, however the wheel scrolled it. After `binnacle.scroll(place, pages)`, the Place shows the rows paged to, and the cursor is not drawn while its row is out of view. Once the Part's cursor is at another line or column than when the page was made, as when a key moves it, the Place follows the cursor again. The wheel ends a page, and the Place follows the cursor, as before.
- **The core counts the lines that a Place shows**, a wrapped line once, from the last draw, so that a List's page is as many items as its Place shows. This is the core's own, and not in the author's `Binnacle`.
- **The core tells where the Focus was last moved**, by a person or an author, on the Screen on view, and keeps it after it forgets the move. A Place that stops taking keys loses the Focus at the next draw, and that draw can come before a watcher of the change that hid the Place. So the Requests view knows whether its Line or its Choices had the Focus, and leaves a Focus that a plugin moved. This is the core's own, and not in the author's `Binnacle`.
- **The alternate screen.** binnacle draws on it, and the layout keeps the composer at the bottom.
- **Styled lines.** A Part's lines may carry colour and style. The core takes out every other control sequence. A plugin makes Untrusted Text plain with `binnacle:packages/binnacle/src/core/view.ts#toPlainText`, and a Part says where its cursor is.
- **Wide content wraps**, as in pi.
- **One owner of the terminal**, `binnacle:packages/binnacle/src/core/host.ts#Host`, so a crash, a suspend and an unload each give it back once. `binnacle:packages/binnacle/src/core/capture.ts#capture` holds back what other code writes while binnacle draws.
- **The session.** `binnacle:packages/binnacle/src/core/session.ts#openChat` opens the Chat's session as dsh's headless bundle does: on `dsh-base`, with no preset, on the default model. A stored session is read once.
- **Hot reload is off** in the bundle's patch, until the core stays up while its plugins reload.
- **pi-tui** is copied, with credit, under `packages/binnacle/src/terminal/`: its input decoding, text width, terminal I/O, editor and input, and how it draws an exact colour.

## Built by

Stage 1, Stage 2 (before Specs). Spec [#156](https://github.com/patrick-xin/binnacle/issues/156) · PR [#167](https://github.com/patrick-xin/binnacle/pull/167): clicks reach the Part under the pointer. Spec [#183](https://github.com/patrick-xin/binnacle/issues/183) · Ticket [#190](https://github.com/patrick-xin/binnacle/issues/190): a built-in's registration ranks beneath an author's. Ticket [#191](https://github.com/patrick-xin/binnacle/issues/191): named Layouts, `first`, floats, `unless`, `mouse: false` and sizes in named Layouts, and `CHAT_LAYOUT`. Ticket [#192](https://github.com/patrick-xin/binnacle/issues/192): the lines that a Place shows, for a List's page. Fix [#207](https://github.com/patrick-xin/binnacle/issues/207): a fixed node counts as its size in a float or a named Layout. Fix [#212](https://github.com/patrick-xin/binnacle/issues/212): a registration made while its plugin unloads is not held. Spec [#184](https://github.com/patrick-xin/binnacle/issues/184) · Ticket [#196](https://github.com/patrick-xin/binnacle/issues/196): `follow` on a Part, a node that shrinks what fills in it, and the Layout `request` in the Chat.
