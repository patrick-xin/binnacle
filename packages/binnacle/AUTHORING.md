# Changing binnacle

binnacle is a terminal app for dsh. Everything it draws and answers is a plugin. This page says how an author changes it.

binnacle's own features are plugins too, and they use only what this page says. Each one is a default that you replace, and an example to copy. Their source is in `src/` of this package:

| Row | Feature | Source |
|---|---|---|
| `binnacle` | the core: the terminal, Layouts, Places, the Focus, gestures, and the Kit | `src/index.ts`, `src/core/`, `src/kit/` |
| `binnacle-transcript` | the session's events | `src/plugins/transcript/index.ts` |
| `binnacle-composer` | what a person types, before it is sent | `src/plugins/composer/index.ts` |
| `binnacle-status-line` | whether the agent runs, and on which model | `src/plugins/status-line/index.ts` |
| `binnacle-approvals` | a tool asks for an approval, and a person answers | `src/plugins/approvals/index.ts` |
| `binnacle-questions` | the agent asks a person a question | `src/plugins/questions/index.ts` |

The components of the Kit, in `src/kit/`, are made from the author API, as your own can be.

## The layers

binnacle is built in layers, as a web app is built from a framework, a design system and its pages:

| Layer | Holds | On the web |
|---|---|---|
| the core | the terminal, Layouts, Places, the Focus and gestures | React and the DOM's layout |
| the theme | a colour for each Tone, the glyphs, a box's edge and spacing | Tailwind's tokens |
| the components: List, Title, Line and Tabs | what each one does, and the keys that do it | Radix's primitives |
| the Looks | how each piece of a component is drawn, with the theme | shadcn's styles |
| the features: the transcript, the composer and the rest | components and Parts put together, and the talk with dsh | an app's pages |

You change binnacle when you lay a piece over the defaults. The newest piece wins, and what you do not replace stays binnacle's.

## A plugin

A plugin is a Cordis plugin, in a package of its own: an ES module that exports `name`, `inject` and `apply`.

```js
// plugins/my-change/index.js
export const name = 'my-change'
export const inject = ['binnacle']
export function apply(ctx) {
  ctx.binnacle.theme({ colors: { accent: 'magenta' } })
}
```

```json
{ "name": "my-change", "version": "0.0.0", "type": "module", "main": "index.js" }
```

A plugin in TypeScript imports the types with `import type { Binnacle, Part } from 'binnacle'`. That import also gives `ctx.binnacle` its type. The types are in `dist/index.d.ts`.

### Load it in a profile

A dsh profile is a folder, `~/.dsh/profiles/<profile>/`. A profile runs binnacle when its `package.json` has `binnacle` in its dependencies, and `"dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "binnacle"] } }`.

1. Put the plugin in the profile, such as in `plugins/my-change/`.
2. Add it to the dependencies of the profile's `package.json`: `"my-change": "link:./plugins/my-change"`.
3. Run `pnpm install` in the profile.
4. Add a row for it to the profile's `cordis.patch.yml`:

   ```yaml
   - insert:
       - id: my-change
         name: 'my-change'
   ```

5. Start binnacle with `dsh --profile <profile>`.

Hot reload is off. After you change the plugin, start binnacle again.

### Turn a built-in off

Each built-in feature is a row of this package's `cordis.patch.yml`. Turn it off by its row, in the profile's `cordis.patch.yml`:

```yaml
- id: binnacle-status-line
  disabled: true
```

The core, row `binnacle`, cannot be turned off. Every feature needs it.

## Each way to change something

What a plugin registers, such as a Part, a Layout, a theme layer, a Look, an action or a binding, goes when the plugin unloads. Of two registrations by one name, the newest wins. What binnacle's own rows register ranks beneath what you register, whichever loads first: a row is binnacle's own when the specifier of its `name` is `binnacle` or begins with `binnacle/`. So your plugin wins over a built-in on every start, and its `beneath` is the built-in's.

| To change | The shortest way |
|---|---|
| where a Place is drawn | a Layout built on `CHAT_LAYOUT`: `binnacle.layout('chat', …)` ([Layouts](#layouts)) |
| a colour or a glyph, everywhere | a theme layer: `binnacle.theme(layer)` ([The theme](#the-theme)) |
| how one piece of a component looks | a Look: `binnacle.look(name, make)` ([Looks](#looks)) |
| what a Place draws | a Part: `binnacle.place(name, part)` ([Parts, Places and Screens](#parts-places-and-screens)) |
| which keys run an action | a binding: `binnacle.bind(name, keys)` ([Bind an action](#bind-an-action)) |
| what an action does | an action by its id, which runs `beneath()` ([Run an action, and change what it does](#run-an-action-and-change-what-it-does)) |
| a new gesture that does what an action does | an enabled action that runs the other by its id: `binnacle.run(id)` ([Run an action, and change what it does](#run-an-action-and-change-what-it-does)) |
| the state that a feature draws | its Model: `binnacle.modelOf(name)` ([Models](#models)) |
| the whole Screen | a Screen: `binnacle.show(screen)` ([Parts, Places and Screens](#parts-places-and-screens)) |
| a whole feature | its row, turned off, and your plugin in its place ([Turn a built-in off](#turn-a-built-in-off)) |

## Parts, Places and Screens

A Place is a leaf of a Layout, by its name. A Part fills a Place: it gives the lines that the Place draws.

```js
const placed = ctx.binnacle.place('status', {
  lines: (width) => [`${width} cells wide`],
})
```

- `binnacle.place(name, part)` fills the Place by that name, on every Screen. The newest Part in a Place wins. It returns a Handle.
- `lines(width)` gives the lines to draw at that width. A line keeps its colour and style. binnacle takes out every other control sequence, then wraps the line at the width.
- `models` are the Models that the Part is drawn from. binnacle draws the Part again after each of them changes.
- `cursor(width)`, while the Place has the Focus, says where the cursor is: `{ line, column }`.
- `key(data)` takes a key, as the terminal sent it, while the Place has the Focus. It returns `true` when it used the key.
- `click(at)` takes a click on the Part's lines. `at` is `{ line, column }` in its own lines. It returns `true` when it used the click.
- `focus(has)` says when the Place gets the Focus, or loses it.
- The Handle has `redraw()`, `focus()`, which moves the Focus to the Part's Place, and `dispose()`, which takes the Part away.

A Screen is a Layout that fills the terminal. The Chat is the first Screen, by the name `chat`, and its Layout is `CHAT_LAYOUT`.

- `binnacle.show(screen)` shows a Screen: `{ name, layout, focus }`. Only the newest Screen shown is drawn. `focus` names the Place where the Focus starts. Dispose its Handle to show the Screen beneath it again.
- `binnacle.layout(name, layout)` replaces a Screen's Layout by its name, as [Layouts](#layouts) says.

### Text

Text from a model, a tool or a stored session is Untrusted Text. Make it plain before it goes in a Part's lines, as binnacle keeps the colour and style of each line:

```js
import { toPlainText, truncateToWidth, visibleWidth } from 'binnacle'

const lineOf = (untrusted, width) => truncateToWidth(toPlainText(untrusted), width, '…')
```

- `toPlainText(text)` takes every control sequence out of the text.
- `visibleWidth(text)` is the cells that the text takes in the terminal, with its colour and style not counted.
- `truncateToWidth(text, width, ellipsis)` cuts the text to that many cells, and ends it with `ellipsis` where it is cut, `...` if you give none.

### The Chat's session

The core opens the session that the Chat shows, and provides it as `ctx.binnacleSession`: its `id`, its `agent`, its `events`, `send(text)` and `interrupt()`. It opens after dsh's plugins start. So wait for it in `apply`, as the status line does:

```js
export function apply(ctx) {
  ctx.inject(['binnacleSession'], (ctx) => {
    ctx.binnacle.place('status', { lines: () => [ctx.binnacleSession.id] })
  })
}
```

## Models

A Model is state, and the one way to change it.

```js
import { createModel } from 'binnacle'

const counter = createModel({ count: 0 })
counter.set((state) => {
  state.count += 1
})
```

- `createModel(state)` makes a Model: `state`, `set(change)` and `watch(changed)`.
- `set(change)` calls `change` with the state, to change it in place.
- `watch(changed)` calls `changed` after each change, and returns what stops it. The watchers learn of a change in a microtask after it is made, once for the changes made together, and never while it is made. A watcher that changes the Model is told again after its own call.

A Part that lists its Models in `models` is drawn again after each of them changes, so it needs no code to redraw:

```js
ctx.binnacle.place('status', {
  models: [counter],
  lines: () => [`count: ${counter.state.count}`],
})
```

`binnacle.model(name, model)` names a Model, so that another plugin can read and change it. `binnacle.modelOf(name)` finds it, or gives `undefined`. The newest Model by a name wins, and it goes when the plugin that named it unloads.

## The theme

The theme is the tokens that everything binnacle draws is drawn with: a colour for each Tone, the glyphs, and a box's edge, padding and gap. An author changes a token once, and everything drawn with it changes.

```js
ctx.binnacle.theme({
  colors: { accent: 'magenta', border: { color: '#5f87af', bold: true } },
  glyphs: { mark: '>' },
})
```

- `binnacle.theme(layer)` adds a layer. Only the tokens that it names change, and the others stay as they were. The newest layer wins for each token. A layer goes when the plugin that added it unloads, and everything is drawn again.
- A colour is one of the terminal's sixteen by name, such as `cyan` or `bright-black`, so the person's palette decides how it looks; a 256-colour index, such as `67`; or an exact colour, as `#rrggbb`, `#rgb`, `okhsl(h s% l%)` or `oklch(l c h)`. An exact colour is drawn as the nearest of 256 where the terminal has no truecolor.
- A Tone's token is a colour, or a Style: `{ color, bold, dim, italic, underline }`. A plain colour stands for `{ color }`, and a Style with no `color` keeps the terminal's own.
- `binnacle.theme` refuses a colour that is not one, such as `'36'`, and names its Tone.
- `binnacle.tokens` is the tokens as the layers make them now. `binnacle.paint(tone, text)` draws text in a Tone. Paint in a Part's `lines`, so that the lines follow the theme when it changes:

```js
ctx.binnacle.place('status', {
  lines: () => [ctx.binnacle.paint('accent', `${ctx.binnacle.tokens.glyphs.mark} ready`)],
})
```

The Tones, what draws with each, and their defaults:

| Tone | Draws | Default |
|---|---|---|
| `text` | text with no other meaning | the terminal's own |
| `accent` | a marked item, a Title | `cyan` |
| `muted` | a description | `bright-black` |
| `dim` | what stands back | `{ dim: true }` |
| `success` | a chosen box | `green` |
| `warning` | a warning | `yellow` |
| `error` | an error | `red` |
| `border` | the borders of a box | `{ dim: true }` |
| `borderAccent` | the frame of what waits on the person, such as a Request | `cyan` |
| `borderMuted` | a border that stands further back | `{ dim: true }` |

The glyphs, and their defaults: `mark` `›`, `unmarked` a space, `checked` `[x]`, `unchecked` `[ ]`, `rule` `─`, `separator` ` | `, `more` `…`. A box's `edge` is `rounded`, and its `padding` and `gap` are `0`. A node of a Layout that names its own keeps it.

## Looks

A Look is how one piece of a component is drawn, such as a List's row. An author sets a Look by the component's kind, for every instance of it, or by an instance's name, for that instance alone. A component's pieces are named `<instance>.<piece>` and `<component>.<piece>`.

```js
ctx.binnacle.look('list.row', (beneath) => (item, at) => beneath(item, at).toUpperCase())
ctx.binnacle.look('request.choices.row', (beneath) => (item, at) => `\x1b[1m${beneath(item, at)}\x1b[22m`)
```

- `binnacle.look(name, make)` sets a Look. `make` is handed `beneath`, the Look that the new one hides, and returns the new Look, which takes what the component's piece takes. Draw `beneath` to keep what is beneath and add to it, or leave it out to draw the piece your own way.
- The newest Look by a name wins. An instance's Looks lie on its kind's Looks, and those on the component's default. So `request.choices.row` above draws in bold what `list.row` draws, and `list.row` draws the default in capitals.
- `beneath` is found each time it draws. When the plugin of a Look between them unloads, or a Look loads beneath later, the next draw uses the chain as it stands. A Look goes when the plugin that set it unloads, and everything is drawn again.
- `binnacle.lookOf(names, fallback)` gives the Look that draws a piece, for a component of your own: the newest Look by the first name, then by the next, down to `fallback`, the component's default. Call it in a Part's `lines`, so that the lines follow the Looks when they change:

```js
const row = (label) => `- ${label}`
ctx.binnacle.place('fruit', {
  lines: () => ['fig', 'oak'].map((label) => ctx.binnacle.lookOf(['fruit.row', 'tags.row'], row)(label)),
})
```

## Actions

An action is something a person does with a key, or with a click in its Place. It has an id. A component's actions are named `<instance>.<verb>`, and their kind `<component>.<verb>`.

```js
ctx.binnacle.action('fruit.toggle', {
  kind: 'list.toggle',
  place: 'fruit',
  description: 'Check the marked fruit',
  run: () => fruit.set((state) => (state.checked = !state.checked)),
})
```

- `binnacle.action(id, action)` sets an action. `run(at, beneath)` does it. At a click, `at` is the cell clicked, as a line of the Part's lines and a column. At a key, it is `undefined`. The action goes when the plugin that set it unloads.
- `keys` are the gestures it is bound to until someone binds it: keys by name, such as `enter`, `space`, `tab` or `ctrl+n`, and `click`.
- `place` is the Place, or the Places, where it takes a gesture: while the Place has the Focus, or for a click, while the click is in it. With no `place`, it takes a key wherever the Focus is. A Place that an action acts in takes the Focus, as a Part that takes keys does.
- `first: true` makes an action of a Place take its key before the Part with the Focus, such as tab while a line is being typed. An action with no `place` is never before the Part.
- While `enabled()` returns false, the action is as if it were not set. The gesture goes on to the action beneath it by its id, then to the next taker.
- `kind` is a name that every action of its kind shares, so that one binding binds them all.

A key goes, in this order, to:

1. The actions marked `first` of the Place with the Focus.
2. The Part with the Focus.
3. The other actions of the Place with the Focus.
4. The actions with no Place.
5. binnacle's own Gesture Table, such as ctrl+c and escape.

A click goes to the Part under it, then to its Place's actions bound to `click`. In one step, the newest enabled action by an id takes the gesture, and of two ids, the action set last wins.

`binnacle.gestures.actionsOf(gesture)` reads binnacle's own Gesture Table. It takes a key, as the terminal sent it. It gives the ids of the core's gestures and the editor's keys that the key is bound to. It does not give the actions that a plugin sets. Read it to keep a key of your own off a key that binnacle uses.

### Bind an action

```js
ctx.binnacle.bind('list.toggle', ['space'])
ctx.binnacle.bind('requests.send', [...ctx.binnacle.keysOf('requests.send'), 'ctrl+n'])
```

- `binnacle.bind(name, keys)` binds the action by that id, or every action of that kind, to these keys instead of its own. A binding by id wins over its kind's. The newest binding by a name wins, and `[]` unbinds. A binding goes when the plugin that set it unloads.
- `binnacle.keysOf(id)` is the keys that the newest action by that id is bound to now, enabled or not. Use it to add a key without repeating the others. Call it after the action is set. It is read once, at load, while `enabled()` changes as the session runs, so it does not follow `enabled()`: an action that names its own keys owns its id's keys, even while it is disabled.

### Run an action, and change what it does

`binnacle.run(id)` runs the newest enabled action by that id, wherever the Focus is, as a call is not a gesture. With none enabled, nothing runs.

To give an action another gesture, set an action of your own that runs it by its id. Here ctrl+d pages down the List `fruit` of [List](#list). It does this only while the List has more than ten items:

```js
ctx.binnacle.action('fruit.downMore', {
  keys: ['ctrl+d'],
  place: 'fruit',
  enabled: () => fruit.state.items.length > 10,
  run: () => ctx.binnacle.run('fruit.pageDown'),
})
```

An action set with the id of another hides it, and is handed it as `beneath`. Run `beneath()` to keep what the action did, and add to it. So two plugins that each change one action both act, the newest first:

```js
ctx.binnacle.action('requests.send', {
  enabled: () => preview.state.on,
  run: (at, beneath) => {
    preview.set((state) => (state.shown = true))
    beneath()
  },
})
```

- An action with no `keys`, or no `kind`, keeps those of the action it hides.
- `beneath()` is found each time it runs: the newest enabled action by that id beneath this one, wherever the Focus is, or nothing. When the plugin of an action between them unloads, the next `beneath()` uses the actions as they stand.

## Layouts

A Layout is a tree. Its leaves are Places, which Parts fill, by name.

| Node | Draws |
|---|---|
| `{ place: 'status' }` | the Part placed in that Place |
| `{ row: [...] }`, `{ column: [...] }` | its children side by side, or one above the other |
| `{ layout: 'request' }` | the Layout set by that name |
| `{ first: [...] }` | only its first child that has a line to draw |
| `{ over, float, at }` | `over`, with `float` on top of it while `float` has a line to draw |

Every node can also take:

- `size`: `'fill'`, a share of what is left; `'content'`, the cells its lines need; or `{ fixed: n }`, in cells, its box included. A node with no size fills in a Screen's own Layout, and takes what its lines need in a Layout set by name.
- `unless: name`: it draws nothing, and takes no cells, while the Layout or the Place by that name has a line to draw.
- `mouse: false`: a click or the wheel inside it does nothing, and a click there moves no Focus.
- A box: `padding` and `gap` in cells, a `border` on every side (`true`) or on the sides it names, the `edge` its border is drawn with, and a `title` set in its top edge.

A `{ layout: name }` node or a `first` that has no line to draw takes no cells, its box included. A node has a line to draw while a Place in it does.

A float is the only node that draws over what it covers. A click and the wheel land on it first. `at.side` is `'top'`, `'center'` or `'bottom'`, and `at.width` is its width in cells. With no `at`, it is centred, and 4 cells narrower than what it covers, at most 80. Its height is what its lines need.

`binnacle.layout(name, layout)` sets the Layout by that name, and the newest wins. A Screen's Layout has the Screen's name, so `binnacle.layout('chat', …)` replaces the Chat's. The Chat's own Layout is exported as `CHAT_LAYOUT`:

```js
{
  column: [
    { place: 'transcript', size: 'fill' },
    { place: 'status', size: 'content' },
    { place: 'composer', size: 'content' },
  ],
}
```

Build on it to move one node, such as the composer to the top:

```js
import { CHAT_LAYOUT } from 'binnacle'

const composer = CHAT_LAYOUT.column.filter((node) => node.place === 'composer')
const others = CHAT_LAYOUT.column.filter((node) => node.place !== 'composer')
ctx.binnacle.layout('chat', { ...CHAT_LAYOUT, column: [...composer, ...others] })
```

Or float a Layout of your own over the Chat, and hide the status line while it shows:

```js
ctx.binnacle.layout('chat', {
  over: { column: CHAT_LAYOUT.column.map((node) => (node.place === 'status' ? { ...node, unless: 'menu' } : node)) },
  float: { layout: 'menu', border: true },
  at: { side: 'bottom', width: 40 },
})
ctx.binnacle.layout('menu', { column: [{ place: 'menu.title' }, { place: 'menu.items' }] })
```

`CHAT_LAYOUT` is frozen: make a new node, as above, rather than change one in place.

## The Focus and the scroll

```js
const handle = ctx.binnacle.place('preview', preview)
handle.focus()
ctx.binnacle.focus('composer')
ctx.binnacle.scroll('transcript', -1)
```

- `binnacle.focus(place)` moves the Focus to the Place by that name, as a click does. The Handle that `binnacle.place(name, part)` returns has `focus()`, which moves the Focus to its own Place.
- A Place that is not drawn yet, or that takes no keys yet, takes the Focus once it draws and takes keys. The Focus moved is forgotten after its Place has had it and stopped taking keys. Then the Focus goes back to the Screen's own, else to the first Place that takes keys.
- `binnacle.scroll(place, pages)` scrolls the Place by that name by pages, and stops at its first and its last line. A positive `pages` moves toward the last line, as page down does, and a negative one toward the first. A page is as many rows as the Place's box shows, from the rows it shows now.
- A scroll of a Place that is not drawn, or that has no rows of room, does nothing. A scroll never moves the Focus.
- A Place with the Focus shows its Part's cursor. After `binnacle.scroll`, it shows the rows paged to, until the Part's cursor moves to another line or column, as when a key moves it. Then it follows the cursor again. The wheel follows the cursor, as before.

## Components

A component is a piece that binnacle's own features are built from, and yours can be. Each one fills the Place by its `name`, which you put in a Layout. Its Looks are `<name>.<piece>`, then `<component>.<piece>`, and its actions `<name>.<verb>`, of the kind `<component>.<verb>`. It gives back `{ handle }`, the Handle of its Part. `handle.dispose()` also takes away what else the component registered.

### List

Items that a person marks and picks.

```js
import { createModel, list } from 'binnacle'

const fruit = createModel({ items: [{ label: 'fig' }, { label: 'pear', description: 'ripe' }] })
const picker = list(ctx.binnacle, {
  name: 'fruit',
  items: () => fruit.state.items,
  pick: (index) => eat(fruit.state.items[index]),
  models: [fruit],
})
```

- `items()` gives the items: a `label`, an optional `description`, and an optional `checked`. An item with `checked` draws a box, `[x]` or `[ ]`. The List makes each label and description plain.
- `pick(index)` runs when the person picks an item: enter picks the marked item, and a click picks the item clicked.
- Up and down move the mark, and wrap. Page up and page down move it by a page, and stop at the first and the last item. A page is as many items as the Place shows at once, an item that wraps counted once, and at least one.
- `key()`, if you give it, says which items are shown. When what it returns changes, the mark goes back to the first item. When the items are fewer and `key()` is the same, the mark stays on the last item. With no items there is no mark, and enter and the page keys do nothing.
- `toggle(index)`, if you give it, runs for the marked item on the action `<name>.toggle`. It has no keys until someone binds it: `ctx.binnacle.bind('list.toggle', ['space'])`.
- `models` are what the items are drawn from, so that the List is drawn again when they change.
- `picker.model` is the List's Model, also named `name`: `{ mark }`, the index of the marked item.
- The actions are `<name>.up`, `<name>.down`, `<name>.pageUp`, `<name>.pageDown`, `<name>.pick`, `<name>.click` and `<name>.toggle`, of the kinds `list.up` and the rest.
- The Look `list.row`, or `<name>.row`, draws one item: `(item, { marked, index, width }) => line`. Its default draws the `mark` glyph and the marked item in `accent`, a description in `muted`, a box's frame in `border`, and what a checked box holds in `success`. A box glyph that is not framed in brackets draws whole, in `success` when checked and in `border` when not.

### Title

A rule across the width, with its text in it: `── Fruit ─────`.

```js
import { title } from 'binnacle'

title(ctx.binnacle, { name: 'fruit.title', text: () => 'Fruit' })
```

- `text()` gives the text, which the Title makes plain. While it gives `undefined`, the Title draws nothing. `''` draws the rule alone.
- `models` are what the text is drawn from, so that the Title is drawn again when it changes.
- The Look `title.row`, or `<name>.row`, draws it: `(text, { width }) => line`. Its default draws the `rule` glyph and the text in `accent`.

### Line

One line that a person types in: `› what they typed`.

```js
import { createModel, line } from 'binnacle'

const asking = createModel({ shown: true, question: 0 })
const answer = line(ctx.binnacle, {
  name: 'answer',
  shown: () => asking.state.shown,
  key: () => asking.state.question,
  submit: (text) => send(text),
  escape: () => asking.set((state) => (state.shown = false)),
  models: [asking],
})
```

- `shown()` says whether the Line is drawn. While it is, the Line takes every key while its Place has the Focus. Move the Focus to it with `answer.handle.focus()`.
- `submit(text)` runs on enter, and `escape()` on escape. Neither clears the text.
- `key()`, if you give it, says which text the Line holds: each value keeps its own, as each question of a form keeps its answer.
- `models` are what `shown()` and `key()` read, so that the Line is drawn again when they change.
- `answer.model` is the Line's Model, also named `name`: `{ texts }`, a `Map` from each value of `key()` to its text. It is what the Line holds. Set the shown key's text to change the Line, with the cursor at its end, and delete it to clear the Line: `answer.model.set((state) => state.texts.delete(key))`. The text stays after a submit, an escape, or while the Line is hidden, until you clear it.
- The Look `line.row`, or `<name>.row`, draws it: `(typed, { width }) => line`, where `typed(width)` is the text with its cursor, drawn in that many cells and scrolled to show the cursor. Its default draws the `mark` glyph in `accent`, then the text. A Look that adds to the line gives `typed` the cells that are left, and the cursor follows where the text is drawn.

### Tabs

Labels in a row, one of them current, that a person moves between: `› Fruit |   Trees`.

```js
import { createModel, tabs } from 'binnacle'

const pages = createModel({ current: 0 })
tabs(ctx.binnacle, {
  name: 'pages',
  labels: () => ['Fruit', 'Trees'],
  current: () => pages.state.current,
  go: (index) => pages.set((state) => (state.current = index)),
  keysIn: ['answer'],
  models: [pages],
})
```

- `labels()` gives the labels, which the Tabs make plain. The Tabs draw while there is more than one.
- `current()` gives the index of the current tab. An index past the last draws the last as current.
- `go(index)` runs when the person goes to a tab: a click on it, or tab and shift+tab. `index` is always within the labels.
- Tab goes to the next tab, and shift+tab to the one before. Tab on the last goes to the first, and shift+tab on the first to the last. They move from the tab drawn as current.
- `keysIn` names the Places where tab and shift+tab move between the tabs, even while a Line there takes every key. With none, the Tabs' own Place. A click on the Tabs moves no Focus.
- When the tabs are wider than the row, the current one is drawn, then its neighbours while they fit, and the `more` glyph marks each end where the row is cut. A current tab wider than the row is cut with `more`. A click on a `more` or a separator does nothing.
- `models` are what the labels and the current tab are drawn from, so that the Tabs are drawn again when they change.
- The actions are `<name>.next` and `<name>.previous`, of the kinds `tabs.next` and `tabs.previous`, marked `first`.
- The Look `tabs.tab`, or `<name>.tab`, draws one tab: `(label, { current, index }) => text`. Its default draws the `mark` glyph and the label in `accent` for the current tab, and the `unmarked` glyph and the label for the others. The `separator` glyph goes between the tabs.
