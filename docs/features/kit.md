# Kit

Row `binnacle`, part of the core · Code `binnacle:packages/binnacle/src/index.ts`, `binnacle:packages/binnacle/src/core/model.ts#createModel`, `binnacle:packages/binnacle/src/core/theme.ts#layered`, `binnacle:packages/binnacle/src/core/looks.ts#drawer`, `binnacle:packages/binnacle/src/kit/list.ts#list`, `binnacle:packages/binnacle/src/kit/title.ts#title`, `binnacle:packages/binnacle/src/kit/line.ts#line`, `binnacle:packages/binnacle/src/kit/tabs.ts#tabs` · Intent: [authoring](../../intents/authoring/intent.md)

The Kit is what an author builds a feature from, as binnacle's built-ins do. It is not a row that a person turns off. How to use it is in the package's [`AUTHORING.md`](../../packages/binnacle/AUTHORING.md), the guide.

## What a person can do

- See the borders of each box drawn dim, in the theme's `border` Tone, so they stand back from what the box holds.
- See binnacle in their own palette: each default Tone is one of the terminal's sixteen colours, or only an attribute.
- Pick an item of a List: up and down move its mark, and wrap; page up and page down move it by a page, and stop at the first and the last item; enter picks the marked item, and a click picks the item clicked. The Requests' Choices are a List.
- Keep their place in a List taller than its Place: a mark that moves within the rows shown moves no row, and a mark that moves past an edge brings the view on until the mark is at that edge.
- Read a Title: a rule across the width, with its text in it.
- Type in a Line: it takes every key while it is shown, enter submits the text and escape escapes. Its text stays after a submit, an escape, or while it is hidden. A Request's typed answer is a Line.
- Move between Tabs: tab goes to the next and shift+tab to the one before, and they wrap at each end, even while a Line takes the keys. A click on a tab goes to it. When the Tabs are wider than the screen, the current tab shows with its neighbours that fit, and `…` marks each end where the row is cut. Nothing built-in draws Tabs yet.

## What an author can change

- Make a Model with `createModel(state)`: its `state`, `set(change)`, and `watch(changed)`.
- List a Part's Models in `Part.models`, so that the core draws the Part again after each of them changes, with no code of the author's.
- Name a Model with `binnacle.model(name, model)`, and find it with `binnacle.modelOf(name)`. The newest by a name wins, an author's above a built-in's ([Core](core.md)), and it goes when the plugin that named it unloads.
- Add a theme layer with `binnacle.theme(layer)`: its `colors`, `glyphs`, `edge`, `padding` and `gap`. Each token that it names changes for everything drawn with it, and the others stay as they were. The newest layer wins for each token, an author's above a built-in's, and a layer goes when the plugin that added it unloads.
- Read the tokens with `binnacle.tokens`, and draw text in a Tone with `binnacle.paint(tone, text)`.
- Set a Look with `binnacle.look(name, (beneath) => look)`: by a component's kind, such as `list.row`, for every instance of that kind, or by an instance's name, such as `request.choices.row`, for that instance alone. The Look is handed the Look beneath it, so it can draw that Look and add to it. A Look goes when the plugin that set it unloads, and everything is drawn again. `binnacle.look(name, make, { models })` names the models that the Look reads: when one of them changes, everything drawn with Looks is drawn again.
- Draw a piece of a component with `binnacle.lookOf(names, fallback)`: the newest Look by the first name, with the chain beneath it, down to `fallback`, the component's default. An author's Looks are above a built-in's.
- Give a component actions that an author binds by kind, such as `list.toggle`, and changes on the action beneath: `binnacle.action`, `binnacle.bind`, `binnacle.keysOf` and `binnacle.run`. The [Gestures](gestures.md) doc says how a gesture reaches them.
- Make a List with `list(binnacle, { name, items, pick, key, toggle, models })`. Its Place and its Model are named `name`, and its Model holds the index of its mark. Its actions are `<name>.up`, `.down`, `.pageUp`, `.pageDown`, `.pick`, `.click` and `.toggle`, of the kinds `list.up` and the rest. `toggle` has no keys until someone binds it. Its row is the Look `<name>.row`, then `list.row`. An item with `checked` draws a box.
- Make a Title with `title(binnacle, { name, text, models })`. Its Place is named `name`, and its row is the Look `<name>.row`, then `title.row`.
- Make a Line with `line(binnacle, { name, shown, submit, escape, key, models })`. Its Place and its Model are named `name`. Its Model holds `texts`, the text of each value of `key()`: setting the shown key's text changes the Line, with the cursor at its end, and the text stays until the author clears it. It is the Look `<name>.row`, then `line.row`, which is handed the typed text to draw in a width.
- Make Tabs with `tabs(binnacle, { name, labels, current, go, keysIn, models })`. Their Place is named `name`. Their actions are `<name>.next` on tab and `<name>.previous` on shift+tab, of the kinds `tabs.next` and `tabs.previous`, marked `first` in the Places `keysIn`, or in their own. A tab is the Look `<name>.tab`, then `tabs.tab`.
- Read the guide, `AUTHORING.md`, in the installed package. It holds each way to change something, and the shortest way to make it. It holds each component and the Chat's Layout. It lists each Tone, what draws with it, and its default. It says how to load a plugin in a profile. The built-ins' source ships beside it, in `src/`, as examples.
- Import the Kit from `binnacle`: `createModel`, `list`, `title`, `line`, `tabs`, `CHAT_LAYOUT`, and the types of the author API. Import `toPlainText`, `visibleWidth` and `truncateToWidth` to make text plain and fit it to a width. pi-tui's `Input` and its cursor marker are not exported, as a Line does what they did.
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

The glyphs are `mark` `›`, `unmarked` a space, `checked` `[x]`, `unchecked` `[ ]`, `rule` `─`, `separator` ` | `, `divider` ` · ` and `more` `…`. The edge is `rounded`, and the padding and the gap are 0. The borders, the List, the Title, the Line and the Tabs draw with the theme. A List's mark and its marked item draw in `accent`, a description in `muted`, a box's frame in `border`, and what a checked box holds in `success`. A Title draws in `accent`. A Line's prompt is the `mark` glyph in `accent`. The current tab draws the `mark` glyph and its label in `accent`, the others the `unmarked` glyph, with the `separator` between them and `more` at a cut end. A separated row, such as the status line, joins its children by the `divider`, and cuts its end with `more`. The Requests' view draws its Title in `accent`, and its rule as a box's border, in `border`.

The types are `binnacle:packages/binnacle/src/api.ts#Model`, `binnacle:packages/binnacle/src/api.ts#Watchable`, `binnacle:packages/binnacle/src/api.ts#ThemeLayer`, `binnacle:packages/binnacle/src/api.ts#Tokens`, `binnacle:packages/binnacle/src/api.ts#Tone`, `binnacle:packages/binnacle/src/api.ts#Style`, `binnacle:packages/binnacle/src/api.ts#Colour`, `binnacle:packages/binnacle/src/api.ts#Look` and `binnacle:packages/binnacle/src/api.ts#LookOptions`; a List's are `binnacle:packages/binnacle/src/kit/list.ts#ListItem`, `binnacle:packages/binnacle/src/kit/list.ts#ListOptions`, `binnacle:packages/binnacle/src/kit/list.ts#ListState`, `binnacle:packages/binnacle/src/kit/list.ts#ListRow` and `binnacle:packages/binnacle/src/kit/list.ts#ListComponent`, a Title's `binnacle:packages/binnacle/src/kit/title.ts#TitleOptions` and `binnacle:packages/binnacle/src/kit/title.ts#TitleRow`; a Line's `binnacle:packages/binnacle/src/kit/line.ts#LineOptions`, `binnacle:packages/binnacle/src/kit/line.ts#LineState`, `binnacle:packages/binnacle/src/kit/line.ts#LineRow`, `binnacle:packages/binnacle/src/kit/line.ts#Typed` and `binnacle:packages/binnacle/src/kit/line.ts#LineComponent`; and the Tabs' `binnacle:packages/binnacle/src/kit/tabs.ts#TabsOptions`, `binnacle:packages/binnacle/src/kit/tabs.ts#TabLook` and `binnacle:packages/binnacle/src/kit/tabs.ts#TabAt`.

## How it is built

- **A Model tells its watchers in a microtask after a change**, once for the changes made together. A watcher that changes the Model in its own call is told again after that call, never inside it.
- **A Part's Models are watched while the Part is placed.** Each change draws the Part again, as its Handle's `redraw()` does. The watch stops when the Part's Handle is disposed.
- **A named Model is held as a Part is**, in a list by its name, so it goes with its plugin.
- **A theme layer is held as a Part is.** The tokens are laid from the layers, oldest first, at the first read after a layer comes or goes. Then every Part is wrapped again, as its lines can paint with the tokens.
- **A colour token is a Style**: a colour and the attributes `bold`, `dim`, `italic` and `underline`. A colour is one of the sixteen by name, a 256-colour index, or an exact colour, as `#rrggbb`, `okhsl(…)` or `oklch(…)`. A plain colour stands for `{ color }`. `binnacle.theme` refuses a layer with a colour that is not one, and names its Tone.
- **An exact colour is drawn as the nearest of 256** when the terminal does not say in `COLORTERM` that it has truecolor. The colour code is copied from pi-tui.
- **Each attribute is closed by the code that ends it alone**, so a Tone painted inside another leaves the other standing.
- **A Look is held as a Part is**, in a list by its name, so it goes with its plugin. When a Look comes or goes, or one of its models changes, every Part is wrapped again, as its lines can draw with it. A Look's models are watched while it is held, as a Part's are.
- **The chain of a piece is read at each draw**: the Looks by the instance's name, newest first, then the Looks by the kind's name, newest first, then the component's default. By each name, an author's Looks are above a built-in's, whichever loaded first, as the [Core](core.md) ranks every registration. A name given twice, as by an instance named like its kind, is read once. `lookOf` calls each `make` as it draws down the chain.
- **The Look beneath is found when it draws, never captured.** Each `beneath` finds its own Look in the chain as it stands, and draws the next one. A `beneath` kept from an earlier draw so follows a Look that unloads, or one that loads beneath later. A `beneath` whose own Look has gone draws the default.
- **A Look set twice by one function has two places in its chain**, as each is held apart, and each goes with its own plugin.
- **A component is made from the author API**, as an author's feature is: a Part in its Place, a Model by its name, its actions, and its Looks read with `lookOf`, down to its default. The Handle that it gives back also takes away its Model's name and its actions.
- **A List sets its mark right as it reads its items**, at a draw or a gesture, and does not tell the Model's watchers, so that a draw does not draw again. When `key()` returns another value, the mark goes to the first item. When the items are fewer than the mark, it goes to the last. With no items there is no mark, and the gestures do nothing.
- **A List's Part has a cursor on its mark**, which the core does not draw, so that the Place scrolls to show the mark. It sets `follow: 'least'`, so the Place keeps the rows it showed and moves them only as far as the mark needs ([Core](core.md)).
- **A List's page is the count of its lines that its Place showed at the last draw**, a wrapped item counted once, and at least one. The core counts them, and keeps the count out of the author's `Binnacle`. A List whose Place is not drawn pages by one item.
- **A box glyph framed in brackets, such as `[x]`, is a frame around what it holds.** Its first and last characters draw in `border`, and a checked box's inside in `success`. A glyph that is not framed draws whole, in `success` when checked and in `border` when not.
- **A List, a Title and Tabs make their text plain**, as it is Untrusted Text.
- **A Line is pi-tui's Input**, copied, one for each value of `key()`, with no prompt of its own: the Look draws the prompt. Its Model is what it holds: when the Model's text of the shown key is not the Input's, a new Input is made from it, with the text pasted so that the cursor is at its end. Only a key that changes the text writes it to the Model, so a `submit` that clears the Model is not undone.
- **A Line's cursor is where its Look draws it.** The Look is handed the text with pi-tui's cursor marker in it, and the core's cursor goes where the marker lands in what the Look draws.
- **Tabs' click is their Part's, not an action**, so that a click on the Tabs moves no Focus, and a Line keeps the keys. A click lands on the tab drawn at the last draw, and a `more` or a separator takes none.
- **Tabs fit from the current tab.** Its neighbours are added after it, then before it, while the row with its separators and its `more` marks fits the width. When the current tab alone does not fit, the marks stay and the tab is cut to the room that is left, with a `more` of its own after it that takes no click, where the `more` fits. A `current()` outside the labels is drawn, and moved from, as the nearest label.

- **The package ships the guide and the source**: `files` holds `AUTHORING.md` and `src/` beside `dist/`, and `prepack` builds `dist/`, so `pnpm pack` holds what an author reads from a clean checkout.

## Built by

Spec [#183](https://github.com/patrick-xin/binnacle/issues/183) · Ticket [#186](https://github.com/patrick-xin/binnacle/issues/186): Models, and Parts that redraw with them · Ticket [#187](https://github.com/patrick-xin/binnacle/issues/187): the theme · Ticket [#188](https://github.com/patrick-xin/binnacle/issues/188): Looks, by instance and by kind · Ticket [#189](https://github.com/patrick-xin/binnacle/issues/189): actions, bound by kind, run by id, and the action beneath · Ticket [#190](https://github.com/patrick-xin/binnacle/issues/190): an author's Models, layers and Looks rank above a built-in's. · Ticket [#191](https://github.com/patrick-xin/binnacle/issues/191): Layout nodes, and `CHAT_LAYOUT`. · Ticket [#192](https://github.com/patrick-xin/binnacle/issues/192): List and Title. · Ticket [#193](https://github.com/patrick-xin/binnacle/issues/193): Line and Tabs. · Ticket [#194](https://github.com/patrick-xin/binnacle/issues/194): the guide and the package. Spec [#184](https://github.com/patrick-xin/binnacle/issues/184) · Ticket [#196](https://github.com/patrick-xin/binnacle/issues/196): a List's view moves only as far as its mark needs. Spec [#224](https://github.com/patrick-xin/binnacle/issues/224) · Ticket [#226](https://github.com/patrick-xin/binnacle/issues/226): the `divider` glyph. · Ticket [#231](https://github.com/patrick-xin/binnacle/issues/231): a Look's models.
