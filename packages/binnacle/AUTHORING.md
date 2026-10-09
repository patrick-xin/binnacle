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
