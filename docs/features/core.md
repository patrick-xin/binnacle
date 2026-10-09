# Core

Row `binnacle` · Code `binnacle:packages/binnacle/src/index.ts#apply` · Intent: none yet

The core is not a feature that a person turns off: it owns the terminal, and every feature needs it.

## What a person can do

- Start binnacle with `dsh --profile binnacle`. It opens the Chat on a new session.
- Open a stored session with `dsh --profile binnacle --session <id>`. It is drawn, and nothing can be sent to it.
- Scroll the Place under the pointer with the wheel.
- Suspend binnacle with ctrl+z, and come back to it.
- Get the terminal back as it was when binnacle exits, crashes or is suspended. What other code wrote while binnacle drew is written after, in order.

## What an author can change

- The Chat's layout: `binnacle.layout('chat', …)` replaces its tree of Places, so the composer can go on top or a Place can be added.
- A Screen of their own: `binnacle.show(…)`.
- What a Place draws: `binnacle.place(name, part)`; the newest Part wins.
- Anything a built-in row registers: what an author registers ranks above it, whichever loads first.
- A Place's box: padding, gap, borders, a title, and an edge style by name.

The author API is `binnacle:packages/binnacle/src/api.ts#Binnacle`, exported from binnacle's entry with `toPlainText`.

## How it is built

- **A feature is a Cordis plugin on the `binnacle` service** ([ADR 1](../adr/0001-a-feature-is-a-cordis-plugin-on-the-binnacle-service.md)). The core is one row, and each feature is a row of its own, which a person turns off in their profile's patch.
- **A Screen is a layout tree of named Places** ([ADR 2](../adr/0002-a-screen-is-a-layout-tree-of-named-places.md)). The Chat's tree is `binnacle:packages/binnacle/src/core/chat.ts#CHAT`: the transcript fills, then the status line and the composer take what their lines need. `binnacle:packages/binnacle/src/core/layout.ts#arrange` lays it out; a terminal too small gives up padding, gaps and borders before it cuts rows.
- **Edges** are a named table: `binnacle:packages/binnacle/src/core/theme.ts#edges`. A box's borders are drawn in the theme's `border` Tone, and its default edge, padding and gap are the theme's ([Kit](kit.md)).
- **A row ends where its style does.** The display clears each row to its end, so the blanks at a row's end are not written while no style is open. The layout follows each style to where it is closed, as a border closes only what it opened.
- **Each registration is held apart**: a Part placed, a Layout, a Screen shown, a named Model and a theme layer. When a plugin unloads, only its own registrations go, even when another plugin registered the same object, and the newest one left wins again.
- **A built-in's registration ranks beneath an author's**, whichever loads first, so an author's plugin wins on every start. Among the built-ins, and among the authors, the newest wins. The core reads the registering plugin's fiber, and walks up to the first that has a loader entry, as the loader's `locate` does (`dsh:vendor/loader/src/index.ts#Loader`). A registration is a built-in's when that entry's `name` is `binnacle` or begins with `binnacle/`: each row of the bundle's patch, and no list kept by hand. A plugin with no entry ranks as an author's. This holds for every registration, an action and a binding too.
- **A scroll by an author wins over the cursor until the cursor moves.** The Place with the Focus shows the row of its Part's cursor, however the wheel scrolled it. After `binnacle.scroll(place, pages)`, the Place shows the rows paged to, and the cursor is not drawn while its row is out of view. Once the Part's cursor is at another line or column than when the page was made, as when a key moves it, the Place follows the cursor again. The wheel ends a page, and the Place follows the cursor, as before.
- **The alternate screen.** binnacle draws on it, and the layout keeps the composer at the bottom.
- **Styled lines.** A Part's lines may carry colour and style. The core takes out every other control sequence. A plugin makes Untrusted Text plain with `binnacle:packages/binnacle/src/core/view.ts#toPlainText`, and a Part says where its cursor is.
- **Wide content wraps**, as in pi.
- **One owner of the terminal**, `binnacle:packages/binnacle/src/core/host.ts#Host`, so a crash, a suspend and an unload each give it back once. `binnacle:packages/binnacle/src/core/capture.ts#capture` holds back what other code writes while binnacle draws.
- **The session.** `binnacle:packages/binnacle/src/core/session.ts#openChat` opens the Chat's session as dsh's headless bundle does: on `dsh-base`, with no preset, on the default model. A stored session is read once.
- **Hot reload is off** in the bundle's patch, until the core stays up while its plugins reload.
- **pi-tui** is copied, with credit, under `packages/binnacle/src/terminal/`: its input decoding, text width, terminal I/O, editor and input, and how it draws an exact colour.

## Built by

Stage 1, Stage 2 (before Specs). Spec [#156](https://github.com/patrick-xin/binnacle/issues/156) · PR [#167](https://github.com/patrick-xin/binnacle/pull/167): clicks reach the Part under the pointer. Spec [#183](https://github.com/patrick-xin/binnacle/issues/183) · Ticket [#190](https://github.com/patrick-xin/binnacle/issues/190): a built-in's registration ranks beneath an author's.
