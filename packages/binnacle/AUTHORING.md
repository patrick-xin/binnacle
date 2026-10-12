# Changing binnacle

binnacle is a terminal app for dsh. Everything it draws and answers is a plugin. This page says how an author changes it.

binnacle's own features are plugins too, and they use only what this page says and what the package exports. Each one is a default that you replace, whole or one piece at a time. This page names what each one sets, so you need not read its source. A check holds each built-in to the package's exports. Their source is in `src/` of this package:

| Row | Feature | Source |
|---|---|---|
| `binnacle` | the core: the terminal, Layouts, Places, the Focus, gestures, and the Kit | `src/index.ts`, `src/core/`, `src/kit/` |
| `binnacle-transcript` | the session's events | `src/plugins/transcript/index.ts` |
| `binnacle-transcript-view` | the transcript a person reads: prompts, answers and what the agent did | `src/plugins/transcript-view/index.ts` |
| `binnacle-tool-cards` | each tool call and its result as one card, from the views dsh's tools give | `src/plugins/tool-cards/index.ts` |
| `binnacle-composer` | what a person types, before it is sent | `src/plugins/composer/index.ts` |
| `binnacle-commands` | the offer of dsh's commands while a person types `/` | `src/plugins/commands/index.ts` |
| `binnacle-status-line` | whether the agent runs, and on which model | `src/plugins/status-line/index.ts` |
| `binnacle-requests` | the approvals and the questions that stand, and the talk with dsh: a model that draws nothing | `src/plugins/requests/index.ts` |
| `binnacle-requests-view` | the Requests' default view: a person answers an approval or a question | `src/plugins/requests-view/index.ts` |

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

### Test it

`binnacle/testing` runs binnacle with no terminal, on a fake agent and a fake clock, with the built-ins and your plugins loaded as a profile loads them. Read the screen as a person sees it, as plain rows. This tests the plugin of [The turn](#the-turn), in `plugins/elapsed/index.js`, with `node --test`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mount } from 'binnacle/testing'
import * as elapsed from './index.js'

test('the status line shows how long the turn has run', async () => {
  const app = await mount({ size: { columns: 30, rows: 5 }, plugins: [elapsed] })
  try {
    await app.agent.status('running')
    await app.agent.commit({ type: 'turn/start', data: { turn: 1 } })
    await app.clock.pass(65_000)
    assert.equal((await app.screen())[1], 'running 1:05 · deepseek-v4')
  } finally {
    await app.close()
  }
})
```

- `mount(options)` takes the terminal's `size`, 80 × 24 by default; `builtins`, the rows of the bundle by id, `'all'` by default, or `[]` for none; `plugins`, your plugins, each a module or `[module, config]`; `stored`, `{ id, events }`, to open a stored session in place of a new one; `model`, `{ provider, model }`, the fake agent's model, `deepseek-v4` by default; and `provide(ctx)`, to provide a service of dsh's that your test fakes, such as `tools` for a tool's views or `commands` for dsh's commands. A service by the name of one of the mount's own fakes, `agents` or `agentDefaultModel`, replaces it: an `agents` whose `create` never settles keeps the session from opening.
- `screen()` gives the rows. `style(x, y)` gives how a cell is drawn, and `cursor()` the cell where the core puts the cursor of the Part with the Focus.
- `press(key)` sends a key by name, such as `enter`, `escape`, `shift+tab`, `up`, `pagedown` or `ctrl+k`, `type(text)` sends text, and `click(x, y)` and `wheel(x, y, notches)` send the mouse, each as a terminal sends it. `resize(columns, rows)` resizes the terminal.
- `agent.status(status)`, `agent.commit({ type, data })` and `agent.stream(frame)` do what dsh does in a session: an event's seq is the next, and its time the fake clock's, unless it names `seq` or `time`. `agent.sent` is what the session sent the agent, and `agent.cancels` each time it interrupted the turn, with what it asked dsh's agent to cancel with.
- `ask(questions)` and `approve(toolName, { callId, reason })` are a question and an approval that a tool asks. Each gives what the person answers, once they answer. Give either `signal` to withdraw it, and `agent: app.agent.child(id)` to ask as a subagent.
- `clock.pass(ms)` moves the fake clock, and runs each timer that falls due. `clock.now` is its time.
- `binnacle` is the binnacle service, and `ctx` the Context that dsh's services and events live on, for what the calls above do not drive. `unload(name)` unloads a row by its id, such as `binnacle-composer`, or the core's `binnacle`, or your plugin by its `name`. `exits` holds each code that binnacle asked dsh to exit with, such as `0` after ctrl+c twice on an empty draft.
- Each call that drives binnacle settles once binnacle has drawn what it causes.
- One mount is open at a time in a process, as the core holds one terminal: `mount` throws while another is open. `close()` unloads every plugin, those that a test loaded on `ctx` too, and puts back what the mount replaced. A closed mount throws at each call. A question or an approval that still stands is dismissed.
- The core and the built-ins load as rows of a profile, so they rank beneath your plugins as they do under dsh.

## Each way to change something

What a plugin registers, such as a Part, a Layout, a theme layer, a Look, an action or a binding, goes when the plugin unloads. Of two registrations by one name, the newest wins. What binnacle's own rows register ranks beneath what you register, whichever loads first: a row is binnacle's own when the specifier of its `name` is `binnacle` or begins with `binnacle/`. So your plugin wins over a built-in on every start, and its `beneath` is the built-in's.

| To change | The shortest way |
|---|---|
| where a Place is drawn | an edit of one node: `binnacle.edit('chat', …)` ([Edit one node](#edit-one-node)) |
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
const placed = ctx.binnacle.place('status.state', {
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
- `follow` says how the Place follows the cursor. With `'end'`, the default, the Place with the Focus shows its end, and a cursor above the rows shown is brought to the top row. With `'least'`, the Place keeps the rows it showed, and moves them only as far as the cursor's row needs. It does this with the Focus or without it. The terminal's cursor is drawn only in the Place with the Focus. A List sets `'least'`, so it keeps its mark in view while the person types in another Place.
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
- `wrap(text, width, { first, rest })` wraps the text at that many cells, with `first` before its first line and `rest` before each line after it. With no `rest`, the lines after the first start under the text. A style that spans a wrap is carried to the next line. An empty text gives `first` alone. A prefix wider than the width draws as wide as it is, and the text gets one cell a line. This wraps a prompt with a `> ` before each line:

  ```js
  import { toPlainText, wrap } from 'binnacle'
  const lines = wrap(toPlainText(untrusted), width, { first: '> ', rest: '> ' })
  ```

- `markdown(binnacle, text, width)` gives the lines of a markdown text, wrapped at that many cells. It makes the text plain itself, so give it the text as it came. The transcript's view draws each answer with it. It draws headings, bold, italic, inline code, code blocks, lists, quotes, links and rules. Any other token, such as a table, raw HTML, a strikethrough or an image, draws as its source text. An empty text gives no line. Blocks are joined by one blank line, and the items of a list by none.
- Each block draws through a Look of its own, given what it draws, already drawn, and `{ width }`, and returns lines. Its types are from `binnacle`:

  | Look | Draws | Given | Default | Type |
  |---|---|---|---|---|
  | `markdown.heading` | a heading | its inline text, and `{ depth }` | the text in the `heading` Tone, with no `#` | `MarkdownHeadingLook` |
  | `markdown.paragraph` | a paragraph, and a token drawn as its source | its inline text | wrapped at the width | `MarkdownParagraphLook` |
  | `markdown.code` | a code block | its lines, made plain, and `{ lang }`, `''` with none | each line indented two cells in the `code` Tone, wrapped under its indent | `MarkdownCodeLook` |
  | `markdown.item` | a list item | its blocks' lines, drawn at the width less its marker, and `{ marker, ordered, number }` | the marker, `• ` or `<number>. `, before the first line, and the other lines under the text | `MarkdownItemLook` |
  | `markdown.quote` | a quote | its blocks' lines, drawn at the width less two | each line after `│ `, in the `muted` Tone | `MarkdownQuoteLook` |
  | `markdown.rule` | a rule | `{ width }` alone | the `rule` glyph across the width, in the `border` Tone | `MarkdownRuleLook` |

  Inline, bold and italic draw as the terminal's bold and italic, code in the `code` Tone, and a link as its text in the `link` Tone, then ` (<destination>)` when the destination is not its text. An item's `number` counts from its list's start, and from 1 in a list that is not ordered. A nested list is a block of its item, so it draws under the item's text. A task's box draws as its source, such as `[x] `, at the start of the text, and counts toward its wrap. This draws each code block in a frame with its language in the top edge:

  ```js
  import { markdown } from 'binnacle'
  ctx.binnacle.look('markdown.code', () => (lines, { lang, width }) => [
    `┌─ ${lang} ${'─'.repeat(Math.max(0, width - lang.length - 4))}`,
    ...lines.map((line) => ctx.binnacle.paint('code', `│ ${line}`)),
    `└${'─'.repeat(Math.max(0, width - 1))}`,
  ])
  const lines = markdown(ctx.binnacle, untrusted, width)
  ```

- `frame(binnacle, lines, width, { title, tone })` gives the lines in a box, `width` wide, drawn with the theme's `edge`. Each line is wrapped inside the box. The edge draws in the `border` Tone, or in `tone` when you give one. `title` draws in the top edge, cut with the `more` glyph where it does not fit. A frame narrower than 4 cells gives the lines wrapped at the width, with no box. A line keeps its colour and style, so make Untrusted Text plain first. A line is a string, or an object with its `text`, such as a transcript's `Line`: each row it wraps to keeps its other fields, so a line marked `fold` or `run` still acts in a frame. Its `from` moves past the left edge on its first row, and each row after it acts from its first cell inside the edge. Its options' type is `FrameOptions`, and a line's `Framed`. This draws an error in a box of the `error` Tone:

  ```js
  import { frame, toPlainText } from 'binnacle'
  const lines = frame(ctx.binnacle, [toPlainText(untrusted)], width, { title: 'Failed', tone: 'error' })
  ```

- `rule(binnacle, text, width)` gives a Title's rule: the `rule` glyph across the width, with the text in it, in the `accent` Tone, such as `── Fruit ─────`. An empty text gives the rule alone. The default Look of a [Title](#title) draws it.

### The Chat's session

The core opens the session that the Chat shows, and provides it as `ctx.binnacleSession`: its `id`, its `agent`, its `events`, `send(text)` and `interrupt()`. It opens after dsh's plugins start. So wait for it in `apply`, as the status line does:

```js
export function apply(ctx) {
  ctx.inject(['binnacleSession'], (ctx) => {
    ctx.binnacle.place('status.model', { lines: () => [ctx.binnacleSession.id] })
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
ctx.binnacle.place('status.state', {
  models: [counter],
  lines: () => [`count: ${counter.state.count}`],
})
```

`binnacle.model(name, model)` names a Model, so that another plugin can read and change it. The newest Model by a name wins, and it goes when the plugin that named it unloads.

`binnacle.modelOf(name)` gives a Model that stands for the newest Model by that name, found each time it is read, set or watched. Find it in `apply`, whichever plugin names it first, and use it later:

- While no Model by that name is named, its `state` is `undefined`, `set` does nothing, and a watcher waits for one.
- A watcher is told when the newest Model changes, and when a newer Model by that name comes or goes.

### The clock

The core names the model `clock`. Its state's `now` is the time in epoch milliseconds. Name it in `models`, as any Model, to draw a time that changes:

```js
const clock = ctx.binnacle.modelOf('clock')
const started = Date.now()
ctx.binnacle.look('status.state', (beneath) => (value) => `${beneath(value)} ${Math.floor((clock.state.now - started) / 1000)}s`, {
  models: [clock],
})
```

- While `now` is read, the clock changes each second, and what names it is drawn again.
- Once a second passes with no read, nothing ticks. What is not drawn reads nothing, so it costs nothing.
- `set` on the clock does nothing.
- The type of its state is `ClockState`.

### The turn

The core names the model `turn`. Its state's `startedAt` is when the turn that runs started, in epoch milliseconds, or `undefined` while the agent does not run.

- It is the time of dsh's newest `turn/start` event. A turn that was queued starts while the agent runs, and sets it again.
- When the agent runs before its turn's `turn/start` comes, it is when the agent began to run.
- A plugin that loads while a turn runs reads that turn's start. On a stored session, and before the session opens, it is `undefined`.
- `set` on it does nothing. The type of its state is `TurnState`.

Read it with the clock to show how long the turn has run. This shows `running 1:05` in the status line ([The status line](#the-status-line)), and draws what is beneath while no turn runs:

```js
const turn = ctx.binnacle.modelOf('turn')
const clock = ctx.binnacle.modelOf('clock')
ctx.binnacle.look(
  'status.state',
  (beneath) => (value) => {
    const { startedAt } = turn.state
    if (startedAt === undefined) return beneath(value)
    const seconds = Math.max(0, Math.floor((clock.state.now - startedAt) / 1000))
    return `${beneath(value)} ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  },
  { models: [turn, clock] },
)
```

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
- `binnacle.tokens` is the tokens as the layers make them now. `binnacle.paint(tone, text)` draws text in a Tone, and `binnacle.paint(style, text)` in a Style of your own, such as `{ bold: true }`, so you need no escape code. A Style's colour that is not one makes `paint` throw. A Tone follows the theme, and a Style does not. A Tone or a style painted inside it ends, and the text after it draws in the outer Tone again. Paint in a Part's `lines`, so that the lines follow the theme when it changes:

```js
ctx.binnacle.place('status.state', {
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
| `heading` | a markdown heading | `{ color: 'cyan', bold: true }` |
| `code` | markdown's inline code and code blocks | `yellow` |
| `link` | a markdown link's text | `{ color: 'blue', underline: true }` |

The glyphs, and their defaults: `mark` `›`, `unmarked` a space, `checked` `[x]`, `unchecked` `[ ]`, `rule` `─`, `separator` ` | `, `divider` ` · `, `more` `…`. A box's `edge` is `rounded`, and its `padding` and `gap` are `0`. A node of a Layout that names its own keeps it.

## Looks

A Look is how one piece of a component is drawn, such as a List's row. An author sets a Look by the component's kind, for every instance of it, or by an instance's name, for that instance alone. A component's pieces are named `<instance>.<piece>` and `<component>.<piece>`.

```js
ctx.binnacle.look('list.row', (beneath) => (item, at) => beneath(item, at).toUpperCase())
ctx.binnacle.look('request.choices.row', (beneath) => (item, at) => ctx.binnacle.paint({ bold: true }, beneath(item, at)))
```

- `binnacle.look(name, make)` sets a Look. `make` is handed `beneath`, the Look that the new one hides, and returns the new Look, which takes what the component's piece takes. Draw `beneath` to keep what is beneath and add to it, or leave it out to draw the piece your own way.
- `binnacle.look(name, make, { models })` names the models that the Look reads, such as a Model or `ctx.binnacleRequests`. When one of them changes, everything drawn with Looks is drawn again, so the Look follows it. A Look that names none is drawn again when the Part that draws it is.
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
4. The actions with no Place. binnacle's own gestures are here, such as ctrl+c and escape, beneath each action that an author sets.

A click goes to the Part under it, then to its Place's actions bound to `click`. The wheel goes to the actions with no Place. In one step, the newest enabled action by an id takes the gesture, and of two ids, the action set last wins.

`binnacle.gestures.actionsOf(gesture)` gives the ids of the actions that a gesture is bound to now. It takes a key, as the terminal sent it. It gives the editor's keys of the Gesture Table, and each enabled action, binnacle's own or a plugin's, that acts wherever the Focus is or in the Place with the Focus. A Part that takes keys can pass on each key that another action is bound to, as the composer does. Read it also to keep a key of your own off a key that binnacle uses.

### Bind an action

```js
ctx.binnacle.bind('list.toggle', ['space'])
ctx.binnacle.bind('request.choices.down', (keys) => [...keys, 'j'])
```

- `binnacle.bind(name, keys)` binds the action by that id, or every action of that kind. A binding by id is given, or replaces, what its kind's gives. A binding goes when the plugin that set it unloads.
- binnacle's own gestures are actions that you bind by id: `binnacle.clear` (ctrl+c), `binnacle.interrupt` (escape), `binnacle.suspend` (ctrl+z), `binnacle.focus.next` (shift+tab), `binnacle.scroll.up` and `binnacle.scroll.down` (the wheel). So `binnacle.bind('binnacle.interrupt', (keys) => [...keys, 'ctrl+x'])` makes ctrl+x interrupt the turn, from the composer too.
- A list of keys replaces the keys beneath it, and `[]` unbinds.
- A function adds to the keys beneath it, or takes some away: it is given the keys the action would have without it, and returns its keys. binnacle calls it each time a key or a click is resolved, so it holds whichever plugin loads first, and for an action set after it. Two such bindings by one name both apply, the newest given what the one beneath it gives. Use it to add a key without repeating the others.
- `binnacle.keysOf(id)` is the keys that the newest action by that id is bound to now, enabled or not. Use it to show or to check a key, after the action is set: it is read when you call it, so it does not follow a binding or an action that comes later. It does not follow `enabled()` either: an action that names its own keys owns its id's keys, even while it is disabled.
- With no action by an id, `binnacle.keysOf(id)` gives what the bindings by that id give over the Gesture Table's keys for it. The Gesture Table holds the editor's keys, by pi-tui's names, such as `tui.select.up` (up), `tui.select.confirm` (enter), `tui.input.submit` (enter) and `tui.input.newLine` (shift+enter and ctrl+j). The transcript and the composer take their keys from it so: `keys: ctx.binnacle.keysOf('tui.select.up')`.

### Run an action, and change what it does

`binnacle.run(id)` runs the newest enabled action by that id, wherever the Focus is, as a call is not a gesture. With none enabled, nothing runs. `binnacle.run(id, at)` gives the action `at`, a cell `{ line, column }` in the lines of its Part, as a click gives the cell clicked. So an action that a click runs can hand its cell to the action that owns what the click does.

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

- An action with no `keys`, or no `kind`, keeps those of the action it hides. An action with no `place` keeps the `place` and the `first` of the action it hides. So it takes a gesture only where that action did. An action that names its own `place` acts there. To act from every Place, set an action of a new id.
- An action with no `enabled` is enabled while the action it hides is: the newest beneath it that names `enabled`. With none, it is enabled always. To be enabled always over a gated action, name `enabled: () => true`.
- An action with no `run` runs `beneath()`. Set one with only `keys`, `place` or `enabled` to change where or when the action acts, and keep what it does.

This changes what enter does in the offer of commands, and keeps when it does it: enter sends the draft as it is typed, but only while the offer draws, as the List's own pick did:

```js
ctx.binnacle.action('commands.list.pick', { run: () => ctx.binnacle.run('composer.send') })
```

A `place` can be a function. It is given the Places the action would keep with no `place` of its own, as a list, `[]` where the action it hides has none, and returns the action's Places. The action keeps the `first` of the action it hides. binnacle reads it at each gesture, so it adds a Place to an action whichever plugin loads first. This moves the offer's mark with up from a search line of your own, `commands.search`, too:

```js
ctx.binnacle.action('commands.list.up', { place: (places) => [...places, 'commands.search'] })
```
- `beneath()` is found each time it runs: the newest enabled action by that id beneath this one, wherever the Focus is, or nothing. When the plugin of an action between them unloads, the next `beneath()` uses the actions as they stand.

## Layouts

A Layout is a tree. Its leaves are Places, which Parts fill, by name.

| Node | Draws |
|---|---|
| `{ place: 'composer.input' }` | the Part placed in that Place |
| `{ row: [...] }`, `{ column: [...] }` | its children side by side, or one above the other |
| `{ row: [...], separator: true }` | one line: the first line of each child, joined by the `divider` glyph |
| `{ layout: 'request' }` | the Layout set by that name |
| `{ first: [...] }` | only its first child that has a line to draw |
| `{ over, float, at }` | `over`, with `float` on top of it while `float` has a line to draw |

Every node can also take:

- `size`: `'fill'`, a share of what is left (in a column, a node that fills takes no more than its lines need while another that fills needs more, and what is left after is shared evenly); `'content'`, the cells its lines need; `{ fixed: n }`, in cells, its box included; or `{ most: n }`, the cells its lines need, up to `n`, its box included. A Place taller than a node of `{ most: n }` scrolls in it, as a Place does, so a List keeps its mark in view. A node with no size fills in a Screen's own Layout, and takes what its lines need in a Layout set by name.
- `unless: name`: it draws nothing, and takes no cells, while the Layout or the Place by that name has a line to draw.
- `mouse: false`: a click or the wheel inside it does nothing, and a click there moves no Focus.
- A box: `padding` and `gap` in cells, a `border` on every side (`true`) or on the sides it names, the `edge` its border is drawn with, and a `title` set in its top edge.

A `{ layout: name }` node or a `first` that has no line to draw takes no cells, its box included. A node has a line to draw while a Place in it does.

A row with `separator: true` draws one line, as the status line does. Each child is drawn at the row's whole width, and gives its first line: a Part's first line, before it wraps, or a node's first drawn row. Its lines past the first are not drawn. A child that draws nothing, or an empty line, takes no divider. The joined line is cut at its end with the `more` glyph, and draws empty where `more` does not fit. A child's `size` and box are not drawn, and `gap` does nothing. A click lands on the child under it.

A float is the only node that draws over what it covers. A click and the wheel land on it first. `at.side` is `'top'`, `'center'` or `'bottom'`, and `at.width` is its width in cells. With no `at`, it is centred, and 4 cells narrower than what it covers, at most 80. Its height is what its lines need.

`binnacle.layout(name, layout)` sets the Layout by that name, and the newest wins. A Screen's Layout has the Screen's name, so `binnacle.layout('chat', …)` replaces the Chat's. The Chat's own Layout is exported as `CHAT_LAYOUT`:

```js
{
  column: [
    { place: 'transcript', size: 'fill' },
    { layout: 'status', size: 'content' },
    { layout: 'request', size: 'content' },
    { layout: 'composer', size: 'content', unless: 'request' },
  ],
}
```

The Layout `status` is the status line, as [The status line](#the-status-line) says, and the Layout `composer` is the composer, as [The composer](#the-composer) says. A Request that stands is drawn by the Layout `request` in the composer's stead, as [Requests](#requests) says.

Build on it to move one node, such as the composer to the top:

```js
import { CHAT_LAYOUT } from 'binnacle'

const composer = CHAT_LAYOUT.column.filter((node) => node.layout === 'composer')
const others = CHAT_LAYOUT.column.filter((node) => node.layout !== 'composer')
ctx.binnacle.layout('chat', { ...CHAT_LAYOUT, column: [...composer, ...others] })
```

Or float a Layout of your own over the Chat, and hide the status line while it shows:

```js
ctx.binnacle.layout('chat', {
  over: { column: CHAT_LAYOUT.column.map((node) => (node.layout === 'status' ? { ...node, unless: 'menu' } : node)) },
  float: { layout: 'menu', border: true },
  at: { side: 'bottom', width: 40 },
})
ctx.binnacle.layout('menu', { column: [{ place: 'menu.title' }, { place: 'menu.items' }] })
```

`CHAT_LAYOUT` is frozen: make a new node, as above, rather than change one in place.

### Edit one node

`binnacle.edit(name, edit)` changes one node of the Layout or Screen by that name, and keeps the rest. Two plugins that edit one Layout both apply, where two Layouts set by one name replace each other. An edit names its node by an anchor: the name in a node's `place` or `layout`.

| Edit | Does |
|---|---|
| `{ insert: node, after: 'x' }`, `{ insert: node, before: 'x' }` | adds `node` beside the anchor's node |
| `{ move: 'y', after: 'x' }`, `{ move: 'y', before: 'x' }` | takes the node of `y`, as it stands with its box, out of its place, and puts it beside the node of `x` |
| `{ remove: 'x' }` | takes the anchor's node out |
| `{ replace: 'x', with: node }` | puts `node` in the anchor's node's place |

So one edit moves the composer above the transcript, and its `size` and `unless: 'request'` come with it:

```js
ctx.binnacle.edit('chat', { move: 'composer', before: 'transcript' })
```

- An edit applies each time the Layout is drawn, to the newest Layout by that name, whoever set it. While its anchor is not there, it does nothing, and it applies again when the anchor comes back.
- It looks for its anchor through rows, columns, `first`, `over` and `float`, children in order and `over` before `float`, and takes the first node it finds. It does not look inside a named Layout that the Layout draws: edit that one by its own name.
- An insert or a move needs a row, a column or a `first` around its anchor. Beside the root, `over` or `float`, it does nothing. A removed root draws nothing.
- A move finds both its anchors as an insert does. While either is not there, it does nothing. What an insert put beside the moved node stays in the old place.
- Inserts apply first, then moves, then replaces, then removes. A replace or a remove acts on its anchor's node in the Layout as set, where a move put it, so it never acts on a node that an insert added. An insert beside a node that another plugin removes stays, and a remove after a replace takes out what the replace put there. An insert can find its anchor in a node that another insert added.
- Within each kind, a built-in's edits apply before yours, then the edits go by the `name` of the plugin that made each, a plugin with no name first. Of two replaces of one node, the one applied last holds. So the order never depends on which plugin loads first.
- Several inserts after one anchor go in that order: the first is next to it. Before it, the last is next to it.

## The Focus and the scroll

```js
const handle = ctx.binnacle.place('preview', preview)
handle.focus()
ctx.binnacle.focus('composer.input')
ctx.binnacle.scroll('transcript', -1)
```

- `binnacle.focus(place)` moves the Focus to the Place by that name, as a click does. The Handle that `binnacle.place(name, part)` returns has `focus()`, which moves the Focus to its own Place.
- A Place that is not drawn yet, or that takes no keys yet, takes the Focus once it draws and takes keys. The Focus moved is forgotten after its Place has had it and stopped taking keys. Then the Focus goes back to the Screen's own, else to the first Place that takes keys.
- `binnacle.scroll(place, pages)` scrolls the Place by that name by pages, and stops at its first and its last line. A positive `pages` moves toward the last line, as page down does, and a negative one toward the first. A page is as many rows as the Place's box shows, from the rows it shows now.
- A scroll of a Place that is not drawn, or that has no rows of room, does nothing. A scroll never moves the Focus.
- `binnacle.focusMovedLast()` is the Place that a person or an author last moved the Focus to on the Screen on view, kept after the core forgets the move, or `undefined` if no one moved it. The Requests' view reads it to leave a Focus that a plugin moved.
- `binnacle.linesShown(place)` is how many of the Part's lines the Place shows now, a wrapped line counted once, or `undefined` while the Place is not drawn. The List reads it for its page, and the offer of commands for whether it draws.
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
- An item can hold fields of your own, such as a command's `hint`. The List gives the Look `<name>.row` each item as `items()` gave it. In TypeScript, `list<Fruit>(…)` takes items of your type `Fruit`, which extends `ListItem`, and `ListRow<Fruit>` is the type of its row Look, so `item.hint` type-checks there.
- `pick(index)` runs when the person picks an item: enter picks the marked item, and a click picks the item clicked.
- Up and down move the mark, and wrap. Page up and page down move it by a page, and stop at the first and the last item. A page is as many items as the Place shows at once, an item that wraps counted once, and at least one.
- `key()`, if you give it, says which items are shown. When what it returns changes, the mark goes back to the first item. When the items are fewer and `key()` is the same, the mark stays on the last item. With no items there is no mark, and enter and the page keys do nothing.
- `toggle(index)`, if you give it, runs for the marked item on the action `<name>.toggle`. It has no keys until someone binds it: `ctx.binnacle.bind('list.toggle', ['space'])`.
- `keysIn` names the Places where up, down, page up, page down and enter act on the List, before the Part that has the Focus there, while the List draws a line. So a List above a Line moves its mark while the person types in the Line, as Tabs' `keysIn` does. While the List draws no line, the keys go to the Part. With no `keysIn`, the keys act in the List's own Place. A click and `toggle` always act in the List's own Place.
- `models` are what the items are drawn from, so that the List is drawn again when they change.
- `fuzzy(query, items, text)` gives the items whose `text(item)` holds the letters of `query` in order, whatever their case: the items whose text starts with the query first, then the items whose letters are closest together, then in their order. An empty query gives every item. This filters a List by `query()`, what the person types in the Line `search`:

  ```js
  import { fuzzy, list } from 'binnacle'
  const shown = () => fuzzy(query(), fruit.state.items, (item) => item.label)
  list(ctx.binnacle, {
    name: 'fruit',
    items: shown,
    key: query,
    keysIn: 'search',
    pick: (index) => eat(shown()[index]),
    models: [fruit],
  })
  ```

- `picker.model` is the List's Model, also named `name`: `{ mark }`, the index of the marked item.
- The actions are `<name>.up`, `<name>.down`, `<name>.pageUp`, `<name>.pageDown`, `<name>.pick`, `<name>.click` and `<name>.toggle`, of the kinds `list.up` and the rest.
- The Look `list.row`, or `<name>.row`, draws one item: `(item, { marked, index, width }) => line`. Its default draws the mark, a space, the box, the label and the description. A row wider than the List wraps. A row Look of your own draws instead of all of it, and its `beneath` is the default row.
- The default row draws three pieces, each a Look of the type `ListPiece<T>`, `(item, { marked, index, width }) => text`. Change one piece, and the row stays the List's own:

  | Look | Default |
  |---|---|
  | `<name>.mark`, then `list.mark` | the `mark` glyph in `accent` when marked, and the `unmarked` glyph when not |
  | `<name>.label`, then `list.label` | the label as plain text, in `accent` when marked |
  | `<name>.description`, then `list.description` | ` — ` and the description as plain text, in `muted`, or `''` with none |

- The box draws a box's frame in `border`, and what a checked box holds in `success`. A box glyph that is not framed in brackets draws whole, in `success` when checked and in `border` when not.

### Title

A rule across the width, with its text in it: `── Fruit ─────`.

```js
import { title } from 'binnacle'

title(ctx.binnacle, { name: 'fruit.title', text: () => 'Fruit' })
```

- `text()` gives the text, which the Title makes plain. While it gives `undefined`, the Title draws nothing. `''` draws the rule alone.
- `models` are what the text is drawn from, so that the Title is drawn again when it changes.
- The Look `title.row`, or `<name>.row`, draws it: `(text, { width }) => line`. Its default is `rule(binnacle, text, width)`, which draws the `rule` glyph and the text in `accent`.

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
- `change(text)`, if you give it, runs after each key of the person's that changes the text, a paste too, with the new text. It does not run when you set the Model. Use it to act as the person types, such as to filter a List by what they type.
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

## The transcript

The row `binnacle-transcript` places its Part in the Place `transcript`, which the Chat draws. On its own, it draws each event of the session raw: its header, `▾ #<seq> <type>`, then its data as JSON, and the answer that streams as one live block. The row `binnacle-transcript-view` lays the transcript a person reads over it, as [The transcript's view](#the-transcripts-view) says. Turn the view off to see each event raw.

- Its state is the model `transcript`, of the type `TranscriptState` from `binnacle/plugins/transcript`:
  - `events`: the committed events, in order.
  - `live`: the blocks of the answer that streams, in the answer's order, or `undefined` while none streams. Each block, of the type `LiveBlock`, has a `kind` (`text`, `reasoning` or `tool-call`), its `text`, and a tool call's `name` once dsh gives it. The blocks end when the answer commits.
  - `folded`: the folded regions, as strings, empty at first. An event's own region is its seq, such as `'12'`, and a part of it is a region such as `'12/body'`, which a Look names on a line it draws. An event that draws no line keeps its regions folded.
  - `marked`: the seq of the Marked event, or `undefined`.
- The transcript sets `events` and `live`. Read them. If you set them, the transcript replaces them at the next event or frame.
- Set `folded` and `marked` to change what is drawn. This plugin folds each tool result when it comes:

  ```js
  const transcript = ctx.binnacle.modelOf('transcript')
  ctx.effect(() =>
    transcript.watch(() => {
      const { events, folded } = transcript.state
      const fresh = events.filter((event) => event.type === 'tool/result' && !folded.includes(String(event.seq)))
      if (fresh.length > 0) transcript.set((state) => state.folded.push(...fresh.map((event) => String(event.seq))))
    }),
  )
  ```

- Up, down and enter run the actions `transcript.up`, `transcript.down` and `transcript.fold`. They act in the Place `transcript`, with the keys of the Gesture Table's `tui.select.up`, `tui.select.down` and `tui.select.confirm`. A click in the transcript runs `transcript.click`. Bind them as any action, so `j` and `k` move the Mark:

  ```js
  ctx.binnacle.bind('transcript.down', ['j'])
  ctx.binnacle.bind('transcript.up', ['k'])
  ```

- Set one of them by its id to change what it does, and run `beneath()` to keep the default.
- Every fold goes through `transcript.fold`. Given no cell, at a key, it folds the Marked event's first region marked `fold` on a line it draws, else the event's own region. Given a cell, it folds the region of the line there when the line is marked `fold`, the event's own region when the line is the event's first and a plain string, and nothing else. `transcript.click` Marks the event clicked, then runs the action of the line clicked when it is marked `run`, else `transcript.fold`, each with the cell. So an empty `transcript.fold` stops every fold, by a key and by a click:

  ```js
  ctx.binnacle.action('transcript.fold', { run: () => {} })
  ```

- Each event draws through the Look `transcript.event.<type>`, such as `transcript.event.tool/call`, and beneath it `transcript.event`, which draws every type. Its type is `EventLook` from `binnacle/plugins/transcript`: `(event, { folded, isFolded, width }) => Line[]`. It is given the event, whether the event's own region is folded, `isFolded(region)` for any region, and the transcript's width, and returns the event's lines. The transcript's own default draws the header, the JSON and a blank line, or the header with its count while folded. Make an event's text plain with `toPlainText` before you draw it, and cut a line at `width` to keep it to one row: the core wraps a wider one. This draws each tool call as one line:

  ```js
  import { toPlainText, truncateToWidth } from 'binnacle'
  ctx.binnacle.look('transcript.event.tool/call', () => (event, { width }) => {
    const { name, arguments: args } = event.data
    return [truncateToWidth(toPlainText(`⏺ ${name}(${args})`), width)]
  })
  ```

- A line is a `Line` from `binnacle/plugins/transcript`: a string, or `{ text, fold }` or `{ text, run }`, each with an optional `from`. The transcript draws its `text`. A click on a line with `fold` folds that region, and a click on a line with `run` runs that action, given the cell clicked. A line with both runs its action. Either acts only at the column `from` of its text and after it, counted in cells without its styles, 0 by default: a click before it only Marks its event. Enter folds the first `fold` region whatever its `from`. A click on an event's first line, when it is a string, folds the event's own region, so a Look that returns strings folds as before. A click on any other string Marks its event, and folds nothing. A Look that changes the lines of the Look beneath it reads a line's text with `typeof line === 'string' ? line : line.text`. This draws a `[-]` that folds the body of each tool call, and a `[x]` that runs an action of the author's, given the cell clicked:

  ```js
  ctx.binnacle.action('my.copy', { run: (at) => {} })
  ctx.binnacle.look('transcript.event.tool/call', () => (event, { isFolded, width }) => {
    const body = `${event.seq}/body`
    const head = [`⏺ ${toPlainText(event.data.name)}`, { text: isFolded(body) ? '[+]' : '[-]', fold: body }, { text: '[x]', run: 'my.copy' }]
    return isFolded(body) ? head : [...head, truncateToWidth(toPlainText(event.data.arguments), width)]
  })
  ```

  This folds each tool call's body from the `[-]` at the end of its first line, and a click on its name only Marks it:

  ```js
  import { toPlainText, truncateToWidth, visibleWidth } from 'binnacle'
  ctx.binnacle.look('transcript.event.tool/call', () => (event, { isFolded, width }) => {
    const body = `${event.seq}/body`
    const name = `⏺ ${toPlainText(event.data.name)} `
    const head = { text: name + (isFolded(body) ? '[+]' : '[-]'), fold: body, from: visibleWidth(name) }
    return isFolded(body) ? [head] : [head, truncateToWidth(toPlainText(event.data.arguments), width)]
  })
  ```

- Read an event with the readers from `binnacle/plugins/transcript`, so that a Look need not know dsh's shapes. Each is given an event of any type, and gives `''` or `undefined` for an event of another type or of a shape it cannot read:
  - `textOf(event)`: the text of a person's message, an answer's or a tool result's, its text blocks joined, or `''`.
  - `reasoningOf(event)`: an answer's reasoning, its reasoning blocks joined, or `''`.
  - `callOf(event)`: a tool call's `{ name, args }`, its arguments as the model wrote them, or `''` with none. It is `undefined` for another event, or a call with no name.
  - `producerOf(event)`: the producer of context that the person did not type, such as `agent-instructions`, or `'unknown'` when it names none. It is `undefined` for a prompt or another event.
  - `noticeOf(event)`: what a command, a retry, a compaction or a turn's end says, as a `Notice`: `{ kind, text, severity }`. The `kind` is `command`, `retry`, `compaction` or `turn`, and the `severity` is `info`, `warning` or `error`. It is `undefined` for another event, such as a turn that completed.
  - `isPrompt(event)`: whether the event is a prompt the person typed, not context that dsh added, such as a file's change.
  - `failed(event)`: whether the event is a tool result that failed.
  - `withoutReasoning(event)`: the event with its reasoning taken out, from the answer's message and from its stream, or the event as it is.

  This draws the person's prompts as `> <text>` in the accent Tone, and dsh's context as before:

  ```js
  import { toPlainText } from 'binnacle'
  import { isPrompt, textOf } from 'binnacle/plugins/transcript'
  ctx.binnacle.look('transcript.event.user/message', (beneath) => (event, at) =>
    isPrompt(event) ? [ctx.binnacle.paint('accent', toPlainText(`> ${textOf(event)}`)), ''] : beneath(event, at),
  )
  ```

  With the row `binnacle-transcript-view` off, this hides the reasoning of each committed answer. With the view on, set `transcript.reasoning`, as [The transcript's view](#the-transcripts-view) says:

  ```js
  import { withoutReasoning } from 'binnacle/plugins/transcript'
  ctx.binnacle.look('transcript.event.assistant/message', (beneath) => (event, at) => beneath(withoutReasoning(event), at))
  ```

- The transcript Marks an event's first line in inverse video, and a click lands on the line it was drawn on. Its Look draws what a folded event shows.
- An event whose Look returns no line takes no row, and the Mark passes over it: up and down move between the events that draw. A `marked` whose event draws no line, or that is no event, is drawn on the next event that draws, else the one before it, else nowhere. Drawing never changes `marked`, so the Mark comes back to its event when it draws again. This draws no system message:

  ```js
  ctx.binnacle.look('transcript.event.system/message', () => () => [])
  ```

- The answer that streams draws through the Look `transcript.live`, of the type `LiveLook`: `(blocks, width) => Line[]`, given the blocks, each a `LiveBlock`, and the width. A click on its line marked `run` runs that action. The live block is no event, so it is never Marked. With the view off, this leaves out the reasoning of the answer that streams, as `withoutReasoning` does for the committed answer:

  ```js
  ctx.binnacle.look('transcript.live', (beneath) => (blocks, width) => beneath(blocks.filter((block) => block.kind !== 'reasoning'), width))
  ```

- The transcript calls each Look at each draw, so a Look follows the theme, and the models it names in `binnacle.look`'s `{ models }`.

### The transcript's view

The row `binnacle-transcript-view` draws the transcript a person reads. A prompt draws as `› ` and its text, in the `accent` Tone. An answer draws its reasoning in the `dim` Tone, then its text as markdown, wrapped at the width, with `markdown`. A tool call draws as one line, `⏺ <tool>(<its arguments>)`, and its result as one line, `⎿ ` and its first line of text, or `✗ ` and its first line in the `error` Tone when it failed. Context that dsh added draws as one line in the `dim` Tone, such as `· context: agent-instructions`. A command, a retry, a compaction and how a turn ended draw one line each, such as `/compact`, `retrying (1/3): <why>` in the `warning` Tone, or `✗ <why>` in the `error` Tone. Every other event draws nothing, and takes no row.

- It sets the Looks `transcript.event.<type>` of the types it draws, `transcript.event` beneath them to draw nothing, and `transcript.live`.
- Each piece it draws is a Look of its own, given plain data and `{ width, time }`, never dsh's shapes, and returns lines. `time` is the event's, in epoch milliseconds, and `undefined` for a piece of the answer that streams, which is no event yet. The types are from `binnacle/plugins/transcript-view`:

  | Look | Draws | Given | Type |
  |---|---|---|---|
  | `transcript.prompt` | a prompt the person typed | its text | `TextLook` |
  | `transcript.answer` | an answer's text | its text | `TextLook` |
  | `transcript.reasoning` | an answer's reasoning | its text | `TextLook` |
  | `transcript.call` | a tool call | `{ name, args }` | `CallLook` |
  | `transcript.result` | a tool result | `{ text, failed }` | `ResultLook` |
  | `transcript.context` | context that dsh added | `{ producer }` | `ContextLook` |
  | `transcript.notice` | a command, a retry, a compaction or a turn's end | `{ kind, text, severity }` | `NoticeLook` |

- A piece is given its text as it came, Untrusted Text: make it plain before you draw it. A Look that returns no line takes the piece out. An event left with no line takes no row, its blank line included. This draws each prompt with a `> ` before each of its lines, and takes the reasoning out:

  ```js
  import { toPlainText, wrap } from 'binnacle'
  ctx.binnacle.look('transcript.prompt', () => (text, { width }) =>
    wrap(toPlainText(text), width, { first: '> ', rest: '> ' }).map((line) => ctx.binnacle.paint('accent', line)),
  )
  ctx.binnacle.look('transcript.reasoning', () => () => [])
  ```

- `transcript.reasoning` alone hides the reasoning, of each committed answer and of the answer that streams. With the view on, `transcript.live` and `withoutReasoning` are not needed for it.
- This draws each prompt after the time it was sent, with no change to its type's Look:

  ```js
  ctx.binnacle.look('transcript.prompt', (beneath) => (text, at) => {
    const sent = at.time === undefined ? '' : new Date(at.time).toTimeString().slice(0, 5)
    return [ctx.binnacle.paint('muted', `── ${sent}`), ...beneath(text, at)]
  })
  ```

- The default `transcript.answer` draws the text with `markdown`, as [Text](#text) says, so a markdown Look, such as `markdown.code`, changes the answers. This draws each answer indented by two cells, with a `●` before its first line:

  ```js
  import { markdown } from 'binnacle'
  ctx.binnacle.look('transcript.answer', () => (text, { width }) =>
    markdown(ctx.binnacle, text, width - 2).map((line, at) => (at === 0 ? '● ' : '  ') + line),
  )
  ```

- The type's Look joins its pieces' lines. A folded event with more than one line draws its first line, then `… <n> more lines` in the `muted` Tone. Then a prompt, an answer and a tool result end with a blank line. A context, a call and a notice do not, so a call and its result stand together. Set `transcript.event.<type>` to space or fold an event your own way.
- The answer that streams draws through the same pieces: its reasoning, then its text, then a blank line, then each tool call with its arguments so far.

### Tool cards

The row `binnacle-tool-cards` draws each tool call and its result as one card, where the call is: `⏺ ` and the tool's title, its body, then a blank line. The `⏺` is in the `accent` Tone while the call runs, `success` when it is done, and `error` when it failed, and a card that is done ends its first line with how long the call took, such as ` · 1.2s`, in the `muted` Tone. The body comes from dsh's views of the call and its result, which each tool gives with its `presentCall` and `presentResult`: a shell command's last 12 lines, a diff's counts for each file, a search's matches, or a read's lines. Turn the row off, and a call and its result draw as two lines again, as [The transcript's view](#the-transcripts-view) says.

- It sets `transcript.event.tool/call` to draw the card, and `transcript.event.tool/result` to draw nothing when its call is in the session, and `beneath` when it is not.
- A card draws through the Look `transcript.card`, of the type `CardLook` from `binnacle/plugins/tool-cards`: `(card, { width, isFolded }) => Line[]`. It is given a `Card`:
  - `seq`: the seq of the call's event.
  - `name`: the tool's name.
  - `args`: the call's arguments, parsed, or the raw string when they are not JSON.
  - `call`: dsh's view of the call, a `ToolCallView`, or `undefined` when the tool gives none. Its `card` is `terminal`, `diff` or `generic`.
  - `result`: `{ view, text, failed }` once the result came, else `undefined`. `failed` is true when dsh's `isError` is, or when `view` is `terminal` with an `exitCode` other than 0, or with a `signal`. `view` is dsh's view of the result, a `ToolResultView`, or `undefined`. Its `card` is `terminal`, `diff`, `search`, `read`, `web` or `generic`.
  - `startedAt` and `endedAt`: the times of the call's and the result's events, in epoch milliseconds. `endedAt` is `undefined` while the call runs.

  Text in `call` and `result` is Untrusted Text: make it plain before you draw it. This draws each card in a box, with `frame`:

  ```js
  import { frame, toPlainText } from 'binnacle'
  ctx.binnacle.look('transcript.card', () => (card, { width }) =>
    frame(ctx.binnacle, [toPlainText(card.result?.text ?? 'running')], width, { title: toPlainText(card.call?.title ?? card.name) }),
  )
  ```

- The default card draws each of its pieces through a Look of its own:

  | Look | Draws | Given | Type |
  |---|---|---|---|
  | `transcript.card.title` | the first line's text, without the time | the card, and the width left beside the time | `CardTitleLook` |
  | `transcript.card.mark` | the painted `⏺`, which the default title draws before the title | the card | `CardMarkLook` |
  | `transcript.card.time` | how long the call took, or `''` for none | the card | `CardTimeLook` |
  | `transcript.card.most` | how many lines a terminal, web, generic or no-view body shows, 12 by default | the card | `CardMostLook` |
  | `transcript.tool.<name>` | one tool's body, such as `transcript.tool.grep` | the card, and the body's width | `CardBodyLook` |
  | `transcript.card.<kind>` | one card kind's body, beneath `transcript.tool.<name>`, such as `transcript.card.terminal` | the card, and the body's width | `CardBodyLook` |

  The kind is the result view's `card` once the result came, else the call view's, else `generic`. A body's Look returns its lines without the `⎿` prefix, which the card adds. This example changes three things:

  - A shell command's card shows its last 3 lines, after `… <n> earlier lines`.
  - A running call's dot is hollow.
  - No card shows a time.

  ```js
  ctx.binnacle.look('transcript.card.most', (beneath) => (card) => (card.result?.view?.card === 'terminal' ? 3 : beneath(card)))
  ctx.binnacle.look('transcript.card.mark', (beneath) => (card) => (card.result === undefined ? '○' : beneath(card)))
  ctx.binnacle.look('transcript.card.time', () => () => '')
  ```

- The default time reads no clock, so it shows nothing while the call runs. Name the model `clock` in the Look's `models` to count a running time, as [The clock](#the-clock) says:

  ```js
  const clock = ctx.binnacle.modelOf('clock')
  ctx.binnacle.look('transcript.card.time', (beneath) => (card) =>
    card.endedAt === undefined ? `${Math.floor((clock.state.now - card.startedAt) / 1000)}s` : beneath(card), { models: [clock] })
  ```

- The default card's first line is `{ text, fold: '<seq>/body' }`. So enter on the Marked card, or a click on its first line, folds its body. The folded card draws its first line alone, ending with `(1 line)` or `(<n> lines)`. A card with no body has nothing to fold, and its first line is a string. Set `transcript.card` to put the fold on another line, as [The transcript](#the-transcript) says of a `Line`.

## The composer

The row `binnacle-composer` sets the Layout `composer`, which the Chat draws while no Request stands. It is a row with the Place `composer.input`, where the editor draws the draft, and where the Chat's Focus starts. Its rules are its box, drawn in the `border` Tone:

```js
{ row: [{ place: 'composer.input', size: 'fill' }], border: ['top', 'bottom'] }
```

- The draft is the model `composer`, of the type `ComposerState` from `binnacle/plugins/composer`. Its state's `text` is the draft as it would be sent: a large paste's content in full, not its marker. Typing and pasting change it. Set `text` to another draft, and it replaces the one shown, drawn in full with the cursor at its end. Set it to the draft it holds, and nothing changes. Its `running` is `true` while a command line that was sent runs. binnacle sets it: read it, and do not set it.

  ```js
  const draft = ctx.binnacle.modelOf('composer')
  draft.set((state) => (state.text = ''))
  ```

- Run `composer.send` right after you set `text`, and the draft that you set is sent.
- Enter runs the action `composer.send`, and shift+enter runs `composer.newline`. Both act in `composer.input`. Bind them as any action, so ctrl+s sends and enter makes a new line:

  ```js
  ctx.binnacle.bind('composer.send', ['ctrl+s'])
  ctx.binnacle.bind('composer.newline', ['enter'])
  ```

  A sequence that a terminal sends for shift+enter, and that names no key, runs `composer.newline` whatever its keys. Where one key is bound to both, such as ctrl+j, whose sequence is also enter's, it runs `composer.newline`.
- The default `composer.send` sends the draft as a prompt, or steers the turn that runs, adds it to the history, and clears it. With a backslash before the cursor, it takes the backslash out and runs `composer.newline` in its place. A draft of whitespace sends nothing, and on a stored session, or before the session opens, the draft stays.
- On a draft that starts with `/` and a letter, the default `composer.send` runs the line as a command, through dsh's service `commands`, and the model never sees it. It waits for the command, and while it waits, the draft's `running` is `true`, and `composer.send` does nothing. A command that fails keeps the draft. One that succeeds goes into the history, and clears the draft, unless the person edited the draft while it ran. A line whose name is no command, such as a skill's `/name`, is sent as a prompt. A command that a plugin registers with dsh's `ctx.commands.register` runs so too.
- Set `composer.send` to change what it does: run `beneath()` to keep the default, or leave it out to send nothing, as this one queues each draft while the agent runs:

  ```js
  const queue = []
  ctx.binnacle.action('composer.send', {
    run: (at, beneath) => {
      if (ctx.get('binnacleSession')?.agent?.status !== 'running') return beneath()
      queue.push(draft.state.text)
      draft.set((state) => (state.text = ''))
    },
  })
  ```

- Ctrl+c is `binnacle.clear`. The composer sets an action by that id in `composer.input`, enabled while the draft has text, so ctrl+c clears a draft, and goes on to binnacle's own on an empty one, which quits when it is pressed twice.
- Add a Place beside the draft with an edit of the Layout `composer`:

  ```js
  ctx.binnacle.edit('composer', { insert: { place: 'prompt', size: { fixed: 2 } }, before: 'composer.input' })
  ```

- `COMPOSER_LAYOUT`, the Layout above, frozen, is exported from `binnacle/plugins/composer`. Build on it to set the Layout `composer` again, such as with no rules:

  ```js
  import { COMPOSER_LAYOUT } from 'binnacle/plugins/composer'
  ctx.binnacle.layout('composer', { ...COMPOSER_LAYOUT, border: false })
  ```

- An empty draft draws its line through the Look `composer.empty`, `(width) => line`, of the type `EmptyLook`. It is drawn after the cursor, and given the cells left. Its default draws nothing. This one shows a hint:

  ```js
  ctx.binnacle.look('composer.empty', () => () => ctx.binnacle.paint('dim', 'Ask anything'))
  ```

- To replace the composer whole, turn the row `binnacle-composer` off, and draw an editor of your own in `composer.input`. `Editor`, the editor that the composer draws, is exported from `binnacle`, with its theme's type `EditorTheme`. It marks its cursor in its lines with `CURSOR_MARKER`. Take the mark out of each line, and give the Place its column as the cursor:

  ```js
  import { CURSOR_MARKER, Editor, visibleWidth } from 'binnacle'

  const plain = (text) => text
  let placed
  const editor = new Editor({ requestRender: () => placed?.redraw(), terminal: { rows: 24 } }, {
    selectList: { selectedPrefix: plain, selectedText: plain, description: plain, scrollInfo: plain, noMatch: plain },
  })
  editor.focused = true
  editor.onSubmit = (text) => ctx.get('binnacleSession')?.send(text)
  ctx.binnacle.layout('composer', { row: [{ place: 'composer.input' }] })
  placed = ctx.binnacle.place('composer.input', {
    lines: (width) => editor.render(width).map((line) => line.replace(CURSOR_MARKER, '')),
    cursor: (width) => {
      const lines = editor.render(width)
      const line = lines.findIndex((text) => text.includes(CURSOR_MARKER))
      return line === -1 ? undefined : { line, column: visibleWidth(lines[line].slice(0, lines[line].indexOf(CURSOR_MARKER))) }
    },
    key: (data) => {
      editor.handleInput(data)
      placed.redraw()
      return true
    },
  })
  ```

  The editor reads its keys from the Gesture Table, such as `tui.input.submit` for enter. The built-in composer adds the model `composer`, its actions, a command line run through dsh, and the keys that it passes on to other actions.

## Commands

The row `binnacle-commands` offers dsh's commands while a person types one. A draft that is `/` and a name opens the offer above the composer. The name can be empty. The offer shows the commands that match the name, each as `/<name>` with its description in `muted`.

Up and down move the mark while the person types. Enter runs a command that takes no input, or puts `/<name> ` in the draft for its input. Tab puts `/<name> ` in the draft. Esc closes the offer and keeps the draft.

The offer only offers: the composer runs a command line ([The composer](#the-composer)). So with the row off, a command typed in full still runs.

The offer is the Layout `commands`. The row puts it in the Chat with this edit, so a Request that stands hides it with the composer:

```js
ctx.binnacle.edit('chat', { insert: { layout: 'commands', size: 'content', unless: 'request' }, before: 'composer' })
```

The Layout is `COMMANDS_LAYOUT`, from `binnacle/plugins/commands`, frozen: the List `commands.list`, at most 9 cells with its rule, so 8 rows:

```js
{ place: 'commands.list', size: { most: 9 }, border: ['top'] }
```

- The model `commands`, of the type `CommandsState`, holds `open`, whether the offer is open, and `query`, the name typed after the `/`. Its `items` are the commands whose names match `query` with `fuzzy`, read from dsh at each read, each `{ label, description, name, hint }` of the type `CommandItem`. `label` is `/<name>`, and `hint` is the command's input hint, or `undefined` when it takes no input. The row sets the model: read it, and change it through the actions.

  ```js
  const offer = ctx.binnacle.modelOf('commands')
  offer.state.items.map((item) => item.name)
  ```

- The row opens the offer when the draft becomes `/` and a name, with nothing after it. It sets `query` to the name as the person types. It closes the offer when the draft stops being one. It acts only when the draft changes. So an offer closed with esc stays closed until the person types, and an offer that you open stays open until it is closed. While a command runs, the row closes the offer, and does not open it.
- The offer opens, closes, picks and completes through four actions. Set one to change what it does, or to take it out:
  - `commands.open`: the row runs it. It sets `open`, and a `query` of `''`.
  - `commands.close`: esc, in `composer.input`, before the draft, while the offer draws a line. It clears `open`.
  - `commands.pick`: enter, and a click on a command, through the List. It takes the marked command. With a `hint`, it sets the draft to `/<name> `. With none, it sets the draft to `/<name>`, and runs `composer.send`. Then it runs `commands.close`.
  - `commands.complete`: tab, as esc. It sets the draft to `/<name> ` for the marked command, then runs `commands.close`.

  This one takes the offer out, and a command typed in full still runs:

  ```js
  ctx.binnacle.action('commands.open', { run: () => {} })
  ```

- The List `commands.list` takes its keys in `composer.input` with `keysIn`, so up, down, page up and page down move its mark while the person types. Its Model, `{ mark }`, and its actions, `commands.list.up` and the rest, are named apart from the model `commands` and its actions. Its mark goes back to the first command when `query` changes.
- A command is drawn by the List's pieces, `commands.list.mark`, `commands.list.label` and `commands.list.description`, of the type `ListPiece<CommandItem>`. Each is given the item with its `name` and `hint`. Draw a command's hint after its name, and the row stays the List's own:

  ```js
  ctx.binnacle.look('commands.list.label', (beneath) => (item, at) =>
    item.hint === undefined ? beneath(item, at) : beneath(item, at) + ctx.binnacle.paint('dim', ` ${item.hint}`),
  )
  ```

- The whole row is the Look `commands.list.row`, then `list.row`, of the type `CommandRow`. The row `binnacle-commands` sets it to cut the default row at the width with the `more` glyph, so a command draws in one line. A row Look of yours over it is given the cut row as its `beneath`, and is not cut.

- Move the offer with an edit of the Chat, such as above the transcript:

  ```js
  ctx.binnacle.edit('chat', { move: 'commands', before: 'transcript' })
  ```

  To float it over the transcript, set the Layout `commands` to draw nothing, and draw `COMMANDS_LAYOUT` under a name of your own:

  ```js
  import { COMMANDS_LAYOUT } from 'binnacle/plugins/commands'
  ctx.binnacle.layout('commands', { column: [] })
  ctx.binnacle.layout('offer', { ...COMMANDS_LAYOUT, border: true })
  ctx.binnacle.edit('chat', {
    replace: 'transcript',
    with: { over: { place: 'transcript' }, float: { layout: 'offer' }, at: { side: 'center' } },
  })
  ```

- A command that a plugin registers with dsh's `ctx.commands.register` is offered and runs as dsh's own. Its handler can show a Screen of its own with `binnacle.show`, and the Handle's `dispose` goes back to the Chat.
- On a stored session, or before the session opens, nothing is offered: there is no agent to list the commands for.

## The status line

The row `binnacle-status-line` sets the Layout `status`, which the Chat draws. It is a separated row of segments, each a Place:

```js
{
  row: [{ place: 'status.state' }, { place: 'status.model' }],
  separator: true,
}
```

- `status.state` is the agent's status, `idle` or `running`, or `read only` on a stored session.
- `status.model` is the agent's model, or the stored session's id.
- Each segment draws through the Look by its Place's name, `(value) => line`. It is given its value, plain already, and returns one line. Its default draws the value in `text`. Set one, and only that segment changes:

  ```js
  ctx.binnacle.look('status.state', (beneath) => (value) => (value === 'running' ? ctx.binnacle.paint('accent', value) : beneath(value)))
  ```

  A segment's Look that reads a model names it, and draws again when it changes. This one says `waiting for you` while a Request stands, and draws what is beneath while none does:

  ```js
  const requests = ctx.binnacleRequests
  ctx.binnacle.look('status.state', (beneath) => (value) => (requests.shown === undefined ? beneath(value) : 'waiting for you'), {
    models: [requests],
  })
  ```

- Add a segment with an edit of the Layout `status`, and place a Part in it. It is joined by the `divider` glyph:

  ```js
  ctx.binnacle.edit('status', { insert: { place: 'cwd' }, after: 'status.model' })
  ctx.binnacle.place('cwd', { lines: () => [process.cwd()] })
  ```

- Place a Part in a segment to draw it your own way. A segment draws only its Part's first line.
- Show how long the turn has run after the state with a Look of `status.state` that reads the models `turn` and `clock`, as [The turn](#the-turn) shows.
- `STATUS_LAYOUT`, the Layout above, frozen, is exported from `binnacle/plugins/status-line`, with the type `SegmentLook`. Build on it to set the Layout `status` again.

## Requests

When the agent asks a question, or a tool asks for an approval, a Request stands until a person answers it. The row `binnacle-requests` is its model: it talks to dsh, keeps the queue, and keeps each Request's draft answer. It draws nothing. It provides `ctx.binnacleRequests`, and its types are `Requests` and `Request` from `binnacle`. The row `binnacle-requests-view` is its default view, which draws from it ([The default view](#the-default-view)).

```js
export const inject = ['binnacle', 'binnacleRequests']
export function apply(ctx) {
  const requests = ctx.binnacleRequests
  ctx.effect(() => requests.attach())
  ctx.binnacle.place('status.state', {
    models: [requests],
    lines: () => (requests.shown === undefined ? [] : [`${requests.standing} waiting for you`]),
  })
}
```

- `shown` is the Request on view, the first that stands, or `undefined`. `standing` is how many stand.
- `watch(changed)` is as a Model's: `changed` runs in a microtask after a Request comes or goes, or a draft changes.
- `attach()` says that your view draws the Requests, and returns what detaches it. The model answers dsh only while a view is attached. With none, a Request that comes goes on to dsh, which fails it closed. A Request that stands when the last view detaches fails closed, as when the model unloads: an approval is `unavailable`, and a question is dismissed.
- Each text in a Request is plain already. A Request that has gone, withdrawn, answered, dismissed or failed, ignores every call made on it after.

Both kinds have `agent`, the id of the agent that asks when it is not the Chat's own, such as a subagent. Only `submit()` and `dismiss()` answer dsh; every other call changes the draft and sends nothing.

An approval, `{ kind: 'approval' }`, has:

- `tool`, `why`, and `arguments`: the call's arguments as lines of JSON, at most 12, then a line that says how many more.
- `choices`, dsh's outcomes: `'allowed-once'` and `'rejected'`.
- `chosen` and `choose(outcome)`: the draft. `submit()` sends the outcome chosen, and with none chosen, sends nothing. `dismiss()` rejects it.

A question, `{ kind: 'question' }`, has:

- `questions`: each has `id`, `header`, `question`, `detail` (lines), `multiSelect`, `planReview`, and `choices`. The choices are its options, `{ kind: 'option', label, text, description }`, then `{ kind: 'other' }` for a typed answer, then `{ kind: 'done' }` where more than one can be chosen. A question with no options has none. In a plan review, the option that approves the plan is first.
- `label` is an option's identity, as the agent offered it, and `text` is the label made plain. Draw `text`, and give `label` to `toggle`.
- `index` and `go(index)`: the question on view.
- `typing` and `type(on)`: whether the person types an answer to the question on view. A question with no options is typed at once.
- `drafts`: each question's answer so far, `{ selected, custom }`, by its index.
- `toggle(label)`: in the question on view, selects the option, or unselects it. Where only one can be chosen, it is the only answer.
- `write(text)`: the typed answer to the question on view, trimmed. An empty one takes it back. Where only one can be chosen, it is the only answer.
- `submit()` sends every question's draft, answered or not. `dismiss()` dismisses the whole Request, and the agent learns it.

The model does not decide when a Request is sent: the view does. To draw the Requests your own way, change the default view, or turn off the row `binnacle-requests-view` and attach a view of your own. Turn off `binnacle-requests` and the view goes with it, as it waits for the model.

### The default view

The row `binnacle-requests-view` draws the Request on view in the Layout `request`, made from the Kit:

```js
{
  column: [
    { place: 'request.title', size: 'content' },
    { place: 'request.body', size: 'fill' },
    { place: 'request.choices', size: 'fill' },
    { place: 'request.line', size: 'content' },
  ],
  border: ['bottom'],
}
```

- `request.title` is a Title: an approval's tool, with the agent that asks when it is not the Chat's; a question's header, with `1 of 3` among several.
- `request.body` is a Part: a question and its detail, or an approval's reason and its arguments. The body and the Choices fill, so that each takes what its lines need while there is room, and a tall one scrolls with both in view, the Line beneath them. The wheel scrolls it, and so do page up and page down from `request.choices` and `request.line`, by the actions `requests.pageUp` and `requests.pageDown`. The List's own page keys are not bound in `request.choices`.
- `request.choices` is a List: `Allow once` and `Reject`, or a question's options, then `Type an answer`, then `Done` where more than one can be chosen. Enter or a click picks. Esc there runs `requests.dismiss`, which rejects an approval or dismisses a question. The action `requests.keep` takes ctrl+c, ctrl+z and shift+tab there and does nothing, so the core does not clear, quit, suspend or move the Focus while a Request stands.
- `request.line` is a Line, shown while the person types an answer. Enter writes what was typed and goes on, and esc goes back to the Choices. Its text is kept by `keyOf` the Request and its question.
- A Request that comes takes the Focus. The composer comes back, with its draft, once no Request stands.

Each way that the view sends, a pick, `Done` or the last typed answer, runs the action `requests.send`. Its default sends the Request on view. Set it to change what sending does, and run `beneath` to send, as [Run an action, and change what it does](#run-an-action-and-change-what-it-does) shows. A plugin that sends later keeps its Request: it calls that Request's `submit()`, or runs `beneath` only while that Request is still on view, so that it never sends another.

The view's entry, `binnacle/plugins/requests-view`, exports what it is built from:

- `REQUEST_LAYOUT`, the Layout above, frozen. Build on it to add a Place, such as tabs above the title:

  ```js
  import { REQUEST_LAYOUT } from 'binnacle/plugins/requests-view'

  ctx.binnacle.layout('request', { ...REQUEST_LAYOUT, column: [{ place: 'request.tabs' }, ...REQUEST_LAYOUT.column] })
  ```

- `titleOf(request)`: the Title's text.
- `itemsOf(request)`: the Choices as List items, none while the person types. An option's item is its `text`, not its `label`.
- `pick(binnacle, request, index)`: what a pick of the Choice at that index does.
- `advance(binnacle, request)`: after a question is answered, the next question, or after the last, `requests.send`.
- `keyOf(request)`: a key for each Request and each of its questions, for a List's `key` or a Line's.
