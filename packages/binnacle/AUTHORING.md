# Changing binnacle

binnacle is a terminal app for dsh. Everything it draws and answers is a plugin. This page says how an author changes it. It grows with each part of the Kit that is built.

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

### Bind an action

```js
ctx.binnacle.bind('list.toggle', ['space'])
ctx.binnacle.bind('requests.send', [...ctx.binnacle.keysOf('requests.send'), 'ctrl+n'])
```

- `binnacle.bind(name, keys)` binds the action by that id, or every action of that kind, to these keys instead of its own. A binding by id wins over its kind's. The newest binding by a name wins, and `[]` unbinds. A binding goes when the plugin that set it unloads.
- `binnacle.keysOf(id)` is the keys that the newest action by that id is bound to now, enabled or not. Use it to add a key without repeating the others. Call it after the action is set. It is read once, at load, while `enabled()` changes as the session runs, so it does not follow `enabled()`: an action that names its own keys owns its id's keys, even while it is disabled.

### Run an action, and change what it does

`binnacle.run(id)` runs the newest enabled action by that id, wherever the Focus is, as a call is not a gesture. With none enabled, nothing runs.

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
