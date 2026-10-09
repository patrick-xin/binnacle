# Kit

Row `binnacle`, part of the core · Code `binnacle:packages/binnacle/src/core/model.ts#createModel`, `binnacle:packages/binnacle/src/core/theme.ts#layered`, `binnacle:packages/binnacle/src/core/looks.ts#drawer`, `binnacle:packages/binnacle/src/kit/list.ts#list`, `binnacle:packages/binnacle/src/kit/title.ts#title` · Intent: [authoring](../../intents/authoring/intent.md)

The Kit is what an author builds a feature from, as binnacle's built-ins do. It is not a row that a person turns off. How to use it is in the package's [`AUTHORING.md`](../../packages/binnacle/AUTHORING.md).

## What a person can do

- See the borders of each box drawn dim, in the theme's `border` Tone, so they stand back from what the box holds.
- See binnacle in their own palette: each default Tone is one of the terminal's sixteen colours, or only an attribute.
- Pick an item of a List: up and down move its mark, and wrap; page up and page down move it by a page, and stop at the first and the last item; enter picks the marked item, and a click picks the item clicked. Nothing built-in draws a List yet.
- Read a Title: a rule across the width, with its text in it.

## What an author can change

- Make a Model with `createModel(state)`: its `state`, `set(change)`, and `watch(changed)`.
- List a Part's Models in `Part.models`, so that the core draws the Part again after each of them changes, with no code of the author's.
- Name a Model with `binnacle.model(name, model)`, and find it with `binnacle.modelOf(name)`. The newest by a name wins, an author's above a built-in's ([Core](core.md)), and it goes when the plugin that named it unloads.
- Add a theme layer with `binnacle.theme(layer)`: its `colors`, `glyphs`, `edge`, `padding` and `gap`. Each token that it names changes for everything drawn with it, and the others stay as they were. The newest layer wins for each token, an author's above a built-in's, and a layer goes when the plugin that added it unloads.
- Read the tokens with `binnacle.tokens`, and draw text in a Tone with `binnacle.paint(tone, text)`.
- Set a Look with `binnacle.look(name, (beneath) => look)`: by a component's kind, such as `list.row`, for every instance of that kind, or by an instance's name, such as `request.choices.row`, for that instance alone. The Look is handed the Look beneath it, so it can draw that Look and add to it. A Look goes when the plugin that set it unloads, and everything is drawn again.
- Draw a piece of a component with `binnacle.lookOf(names, fallback)`: the newest Look by the first name, with the chain beneath it, down to `fallback`, the component's default. An author's Looks are above a built-in's.
- Give a component actions that an author binds by kind, such as `list.toggle`, and changes on the action beneath: `binnacle.action`, `binnacle.bind`, `binnacle.keysOf` and `binnacle.run`. The [Gestures](gestures.md) doc says how a gesture reaches them.
- Make a List with `list(binnacle, { name, items, pick, key, toggle, models })`. Its Place and its Model are named `name`, and its Model holds the index of its mark. Its actions are `<name>.up`, `.down`, `.pageUp`, `.pageDown`, `.pick`, `.click` and `.toggle`, of the kinds `list.up` and the rest. `toggle` has no keys until someone binds it. Its row is the Look `<name>.row`, then `list.row`. An item with `checked` draws a box.
- Make a Title with `title(binnacle, { name, text, models })`. Its Place is named `name`, and its row is the Look `<name>.row`, then `title.row`.
- Lay out a feature's Places in a Layout of its own name, and build on the Chat's Layout, `CHAT_LAYOUT`, with the nodes that the [Core](core.md) draws: `{ layout: name }`, `first`, a float, `unless` and `mouse: false`.

The Tones, what draws with each, and their defaults, which are v0's:

| Tone | Draws | Default |
|---|---|---|
| `text` | text with no other meaning | the terminal's own |
| `accent` | a marked item, a Title | cyan |
| `muted` | a description | bright black |
| `dim` | what stands back | dim |
| `success` | a chosen box | green |
| `warning` | a warning | yellow |
| `error` | an error | red |
| `border` | the borders of a box | dim |
| `borderAccent` | the frame of what waits on the person, such as a Request | cyan |
| `borderMuted` | a border that stands further back | dim |

The glyphs are `mark` `›`, `unmarked` a space, `checked` `[x]`, `unchecked` `[ ]`, `rule` `─`, `separator` ` | ` and `more` `…`. The edge is `rounded`, and the padding and the gap are 0. The borders, the List and the Title draw with the theme. A List's mark and its marked item draw in `accent`, a description in `muted`, a box's frame in `border`, and what a checked box holds in `success`. A Title draws in `accent`. A Request's frame draws with its Tone when it is built.

The types are `binnacle:packages/binnacle/src/api.ts#Model`, `binnacle:packages/binnacle/src/api.ts#Watchable`, `binnacle:packages/binnacle/src/api.ts#ThemeLayer`, `binnacle:packages/binnacle/src/api.ts#Tokens`, `binnacle:packages/binnacle/src/api.ts#Tone`, `binnacle:packages/binnacle/src/api.ts#Style`, `binnacle:packages/binnacle/src/api.ts#Colour` and `binnacle:packages/binnacle/src/api.ts#Look`; a List's are `binnacle:packages/binnacle/src/kit/list.ts#ListItem`, `binnacle:packages/binnacle/src/kit/list.ts#ListOptions`, `binnacle:packages/binnacle/src/kit/list.ts#ListState`, `binnacle:packages/binnacle/src/kit/list.ts#ListRow` and `binnacle:packages/binnacle/src/kit/list.ts#ListComponent`, and a Title's `binnacle:packages/binnacle/src/kit/title.ts#TitleOptions` and `binnacle:packages/binnacle/src/kit/title.ts#TitleRow`.

## How it is built

- **A Model tells its watchers in a microtask after a change**, once for the changes made together. A watcher that changes the Model in its own call is told again after that call, never inside it.
- **A Part's Models are watched while the Part is placed.** Each change draws the Part again, as its Handle's `redraw()` does. The watch stops when the Part's Handle is disposed.
- **A named Model is held as a Part is**, in a list by its name, so it goes with its plugin.
- **A theme layer is held as a Part is.** The tokens are laid from the layers, oldest first, at the first read after a layer comes or goes. Then every Part is wrapped again, as its lines can paint with the tokens.
- **A colour token is a Style**: a colour and the attributes `bold`, `dim`, `italic` and `underline`. A colour is one of the sixteen by name, a 256-colour index, or an exact colour, as `#rrggbb`, `okhsl(…)` or `oklch(…)`. A plain colour stands for `{ color }`. `binnacle.theme` refuses a layer with a colour that is not one, and names its Tone.
- **An exact colour is drawn as the nearest of 256** when the terminal does not say in `COLORTERM` that it has truecolor. The colour code is copied from pi-tui.
- **Each attribute is closed by the code that ends it alone**, so a Tone painted inside another leaves the other standing.
- **A Look is held as a Part is**, in a list by its name, so it goes with its plugin. When a Look comes or goes, every Part is wrapped again, as its lines can draw with it.
- **The chain of a piece is read at each draw**: the Looks by the instance's name, newest first, then the Looks by the kind's name, newest first, then the component's default. By each name, an author's Looks are above a built-in's, whichever loaded first, as the [Core](core.md) ranks every registration. A name given twice, as by an instance named like its kind, is read once. `lookOf` calls each `make` as it draws down the chain.
- **The Look beneath is found when it draws, never captured.** Each `beneath` finds its own Look in the chain as it stands, and draws the next one. A `beneath` kept from an earlier draw so follows a Look that unloads, or one that loads beneath later. A `beneath` whose own Look has gone draws the default.
- **A Look set twice by one function has two places in its chain**, as each is held apart, and each goes with its own plugin.
- **A component is made from the author API**, as an author's feature is: a Part in its Place, a Model by its name, its actions, and its Looks read with `lookOf`, down to its default. The Handle that it gives back also takes away its Model's name and its actions.
- **A List sets its mark right as it reads its items**, at a draw or a gesture, and does not tell the Model's watchers, so that a draw does not draw again. When `key()` returns another value, the mark goes to the first item. When the items are fewer than the mark, it goes to the last. With no items there is no mark, and the gestures do nothing.
- **A List's Part has a cursor on its mark**, which the core does not draw, so that the Place scrolls to show the mark.
- **A List's page is the count of its lines that its Place showed at the last draw**, a wrapped item counted once, and at least one. The core counts them, and keeps the count out of the author's `Binnacle`. A List whose Place is not drawn pages by one item.
- **A box glyph framed in brackets, such as `[x]`, is a frame around what it holds.** Its first and last characters draw in `border`, and a checked box's inside in `success`. A glyph that is not framed draws whole, in `success` when checked and in `border` when not.
- **A List and a Title make their text plain**, as it is Untrusted Text.

## Built by

Spec [#183](https://github.com/patrick-xin/binnacle/issues/183) · Ticket [#186](https://github.com/patrick-xin/binnacle/issues/186): Models, and Parts that redraw with them · Ticket [#187](https://github.com/patrick-xin/binnacle/issues/187): the theme · Ticket [#188](https://github.com/patrick-xin/binnacle/issues/188): Looks, by instance and by kind · Ticket [#189](https://github.com/patrick-xin/binnacle/issues/189): actions, bound by kind, run by id, and the action beneath · Ticket [#190](https://github.com/patrick-xin/binnacle/issues/190): an author's Models, layers and Looks rank above a built-in's. · Ticket [#191](https://github.com/patrick-xin/binnacle/issues/191): Layout nodes, and `CHAT_LAYOUT`. · Ticket [#192](https://github.com/patrick-xin/binnacle/issues/192): List and Title.
