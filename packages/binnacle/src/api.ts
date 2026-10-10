// A module augmentation merges into Cordis's Context only in a file that imports Cordis.
// oxlint-disable-next-line no-unassigned-import
import '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

export interface Part {
  /** Unwrapped. A line keeps its colour and style; the core takes out every other control sequence, then wraps it at the width. */
  lines(width: number): readonly string[]
  /** Where the cursor is in the lines at that width, while the Part has the Focus. */
  cursor?(width: number): Point | undefined
  /** A key, as the terminal sent it, while the Part has the Focus. It returns true when it used the key, and the core draws the Part again; the actions take the rest. */
  key?(data: string): boolean
  /** A click at the cell under the pointer: a line of the Part's lines and a column in cells, however the line wraps and the Place scrolls; past the end of a line, on its row, the column is past the line's end. It returns true when the Part used the click, and the core draws the Part again; its Place's actions take the rest. A click on the Place's box or below the Part's lines does not reach the Part. */
  click?(at: Point): boolean
  /** The Place gained or lost the Focus, and the core draws the Part again, as its lines may show the Focus. */
  focus?(has: boolean): void
  /** What the Part is drawn from: the core draws it again after each of them changes. */
  readonly models?: readonly Watchable[]
  /**
   * How its Place follows its cursor, while the Place has the Focus. `'end'`, the default: the Place shows its end, and a cursor above the rows shown is brought to the top row.
   * `'least'`: the Place keeps the rows it showed, and moves them only as far as the cursor's row needs.
   */
  readonly follow?: 'end' | 'least'
}

/** Anything a Part can be drawn from: it says when it changed. */
export interface Watchable {
  /** `changed` runs after each change, once for the changes made together. It returns what stops it. */
  watch(changed: () => void): () => void
}

/** State, and the one way to change it. */
export interface Model<S extends object> extends Watchable {
  readonly state: S
  /** Changes the state. The watchers learn of it in a microtask after the change, never while it is made. */
  set(change: (state: S) => void): void
}

/** A colour of the theme's, named by what is drawn in it, as pi's themes name it. */
export type Tone = 'text' | 'accent' | 'muted' | 'dim' | 'success' | 'warning' | 'error' | 'border' | 'borderAccent' | 'borderMuted'

export type Glyph = 'mark' | 'unmarked' | 'checked' | 'unchecked' | 'rule' | 'separator' | 'divider' | 'more'

/** One of the terminal's sixteen colours, so the person's palette decides how it looks. */
export type Sixteen =
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'bright-black'
  | 'bright-red'
  | 'bright-green'
  | 'bright-yellow'
  | 'bright-blue'
  | 'bright-magenta'
  | 'bright-cyan'
  | 'bright-white'

/** One of the sixteen by name; a 256-colour index; or an exact colour, as `#rrggbb`, `#rgb`, `okhsl(h s% l%)` or `oklch(l c h)`, drawn as the nearest of 256 where the terminal has no truecolor. */
export type Colour = Sixteen | number | (string & {})

/** How a Tone is drawn: a colour, the terminal's own when it has none, and attributes. */
export interface Style {
  readonly color?: Colour
  readonly bold?: boolean
  readonly dim?: boolean
  readonly italic?: boolean
  readonly underline?: boolean
}

/** What everything binnacle draws is drawn with, as the theme's layers make it. */
export interface Tokens {
  readonly colors: { readonly [tone in Tone]: Style }
  readonly glyphs: { readonly [glyph in Glyph]: string }
  /** The edge of a box that names none. */
  readonly edge: string
  /** The padding of a box that names none, in cells. */
  readonly padding: number
  /** The gap between the children of a node that names none, in cells. */
  readonly gap: number
}

/** A layer of the theme: only the tokens it names change. A plain colour stands for `{ color }`. */
export interface ThemeLayer {
  readonly colors?: { readonly [tone in Tone]?: Colour | Style }
  readonly glyphs?: { readonly [glyph in Glyph]?: string }
  readonly edge?: string
  readonly padding?: number
  readonly gap?: number
}

/** How a piece of a component is drawn, such as a List's row: what it takes is the component's to say. */
export type Look = (...args: never[]) => unknown

export interface LookOptions {
  /** What the Look is drawn from, as a Part's `models` are. */
  readonly models?: readonly Watchable[]
}

/** A line of a Part's lines, and a column in cells. */
export interface Point {
  readonly line: number
  readonly column: number
}

/** A `fixed` size is in cells, its box included; `content` is the cells its lines need; `fill` shares what is left. */
export type Size = { readonly fixed: number } | 'content' | 'fill'

export type Side = 'top' | 'right' | 'bottom' | 'left'

export interface Box {
  readonly padding?: number | { readonly [side in Side]?: number }
  readonly gap?: number
  /** `true` is every side; a gutter is `['left']`. */
  readonly border?: boolean | readonly Side[]
  readonly edge?: string
  /** Untrusted Text, as a Part's lines are. */
  readonly title?: string
}

interface Node extends Box {
  /** In a Screen's own Layout, a node with no size fills; in a Layout set by name, it takes what its lines need. */
  readonly size?: Size
  /** It draws nothing, and takes no cells, while the Layout or the Place by this name has a line to draw. */
  readonly unless?: string
  /** `false`: a click or the wheel inside it does nothing, and a click there moves no Focus. */
  readonly mouse?: boolean
}

interface Kinds {
  readonly place?: never
  readonly row?: never
  readonly separator?: never
  readonly column?: never
  readonly layout?: never
  readonly first?: never
  readonly over?: never
  readonly float?: never
  readonly at?: never
}

export type Layout =
  | (Node & Omit<Kinds, 'place'> & { readonly place: string })
  | (Node &
      Omit<Kinds, 'row' | 'separator'> & {
        readonly row: readonly Layout[]
        /**
         * `true`: the row draws one line, the first line of each child that draws one, joined by the theme's `divider` glyph, and cut at its end with `more`.
         * Each child is drawn at the row's whole width, with no size and no box, and `gap` does nothing.
         */
        readonly separator?: boolean
      })
  | (Node & Omit<Kinds, 'column'> & { readonly column: readonly Layout[] })
  /** The Layout set by that name with `binnacle.layout(name, …)`. While it has no line to draw, it takes no cells, its box included. */
  | (Node & Omit<Kinds, 'layout'> & { readonly layout: string })
  /** Only its first child that has a line to draw. While none has, it takes no cells, its box included. */
  | (Node & Omit<Kinds, 'first'> & { readonly first: readonly Layout[] })
  /** `over` fills the node, and `float` is drawn on top of it while `float` has a line to draw. A click lands on the float before what it covers. */
  | (Node & Omit<Kinds, 'over' | 'float' | 'at'> & { readonly over: Layout; readonly float: Layout; readonly at?: Anchor })

interface Edits {
  readonly insert?: never
  readonly after?: never
  readonly before?: never
  readonly remove?: never
  readonly replace?: never
  readonly with?: never
}

/**
 * A change to one node of a Layout, which it names by an anchor: the name in a node's `place` or `layout`.
 * `insert` adds a node beside the anchor's, `remove` takes the anchor's node out, and `replace` puts `with` in its place.
 */
export type Edit =
  | (Omit<Edits, 'insert' | 'after'> & { readonly insert: Layout; readonly after: string })
  | (Omit<Edits, 'insert' | 'before'> & { readonly insert: Layout; readonly before: string })
  | (Omit<Edits, 'remove'> & { readonly remove: string })
  | (Omit<Edits, 'replace' | 'with'> & { readonly replace: string; readonly with: Layout })

/** Where a float is drawn over what it covers: at its top, its bottom or its centre, and centred across. Its height is what its lines need. */
export interface Anchor {
  readonly side?: 'top' | 'center' | 'bottom'
  /** In cells, its box included. With none, the float is 4 cells narrower than what it covers, and at most 80. */
  readonly width?: number
}

export interface Screen {
  /** The name a plugin replaces the Screen's layout by. */
  readonly name: string
  readonly layout: Layout
  /** Where the Focus starts while the Screen is on view. */
  readonly focus?: string
}

export interface Handle {
  redraw(): void
  /** The core also disposes it when the plugin that drew it unloads. */
  dispose(): void
}

/** The Handle of a Part placed. */
export interface PlacedHandle extends Handle {
  /** Moves the Focus to the Place this Part fills, as `binnacle.focus(place)` does. */
  focus(): void
}

export interface Gestures {
  /**
   * The ids of the actions a gesture is bound to now: a key, as the terminal sent it, or a mouse gesture by name.
   * The editor's keys of the Gesture Table, and each enabled action, the core's own or an author's, that acts wherever the Focus is or in the Place with the Focus.
   */
  actionsOf(gesture: string): readonly string[]
}

/** Gestures by name, or a function of the gestures beneath the binding, read each time a gesture is resolved, so that it adds to the keys of an action set later. */
export type Binding = readonly string[] | ((beneath: readonly string[]) => readonly string[])

/** Something a person does with a key, or with a click in its Place. */
export interface Action {
  /**
   * At a click, `at` is the cell clicked in the lines of the Part in the Place; at a key, or below the Part's lines, it is `undefined`.
   * `beneath` runs the action that this one hides, the newest enabled action by its id beneath it, with the same `at`; with none, it does nothing.
   */
  run(at: Point | undefined, beneath: () => void): void
  /** The gestures it is bound to until someone binds it or its kind: keys by name, such as `enter`, `space`, `tab` or `ctrl+n`, and `click`. */
  readonly keys?: readonly string[]
  /** It takes a gesture only while this Place, or one of these, has the Focus, or for a click, while the click is in it. With none, it keeps the Place of the action it hides, and with none there either, it takes a key wherever the Focus is, and the wheel. A Place that an action acts in takes the Focus. */
  readonly place?: string | readonly string[]
  /** An action of a Place takes its key before the Part with the Focus, such as tab while a line is being typed. An action with no Place is never before the Part. An action that names no Place keeps the newest `first` named among the actions it hides, down to the action whose Place it keeps. */
  readonly first?: boolean
  /** The name that every action of its kind shares, such as `list.toggle`: binding the kind binds each of them. */
  readonly kind?: string
  /** While it returns false, the action is as if it were not set: a gesture goes on to the action beneath it by its id, then to the next taker. */
  enabled?(): boolean
  readonly description?: string
}

export interface Binnacle {
  /** What each key and each mouse gesture is bound to. */
  readonly gestures: Gestures
  /**
   * Sets the action by that id; the newest enabled one by an id takes its gestures.
   * A key goes to the actions marked `first` of the Place with the Focus, then to the Part with the Focus, then to the Place's other actions, then to the actions with no Place, `first` or not, where the core's own are, beneath an author's.
   * When two actions of different ids take a gesture at one step, the newest set wins.
   */
  action(id: string, action: Action): Handle
  /**
   * Binds the action by that id, or every action of that kind, the core's own too, such as `binnacle.interrupt`, to these gestures instead of its own, or to what a function gives from the gestures it would have without this binding.
   * A binding by id is given, or replaces, what its kind's gives. Bindings by one name apply oldest first: a list replaces, and `[]` unbinds.
   */
  bind(name: string, keys: Binding): Handle
  /** The gestures that the newest action by that id, enabled or not, is bound to now. With no action by that id, what its bindings by id give, or none. */
  keysOf(id: string): readonly string[]
  /** Runs the newest enabled action by that id, wherever the Focus is, as a call is not a gesture. With none enabled, nothing runs. */
  run(id: string, at?: Point): void
  /** Only the newest Screen shown is drawn. The Chat is the first. */
  show(screen: Screen): Handle
  /** Sets the Layout by that name: a Screen's, which replaces the Screen's own, or one that a `{ layout: name }` node draws. The newest wins. */
  layout(name: string, layout: Layout): Handle
  /**
   * Changes one node of the Layout or Screen by that name, and keeps the rest. It applies at each draw, to the newest Layout by that name; while its anchor is not there, it does nothing.
   * Inserts apply first, then replaces, then removes. A replace or a remove acts on the node its anchor names in the Layout as set, never on a node that an insert added.
   * Within each kind, a built-in's apply before an author's, then they go by the name of the plugin that made each, so the order never depends on which loads first.
   * An insert needs a row, a column or a `first` around its anchor. Of several inserts after one anchor, the first in that order is next to it; before it, the last is.
   */
  edit(name: string, edit: Edit): Handle
  /** Fills the Place by that name on every Screen; the newest Part wins. */
  place(name: string, part: Part): PlacedHandle
  /**
   * Moves the Focus to the Place by that name, as a click does. A Place that is not drawn yet takes the Focus once it draws and takes keys.
   * The Focus moved is forgotten once its Place has had it and stopped taking keys.
   */
  focus(place: string): void
  /**
   * Scrolls the Place by that name by pages, and stops at its first and last line. A positive `pages` moves toward the last line, as page down does; a negative one toward the first.
   * A page is as many rows as the Place's box shows. A Place that is not drawn, or that has no rows of room, does not scroll. It never moves the Focus.
   */
  scroll(place: string, pages: number): void
  /** Adds a layer to the theme, and draws everything again. The newest layer wins for each token it names. It refuses a colour that is not one. */
  theme(layer: ThemeLayer): Handle
  /** The theme's tokens, as its layers make them now. */
  readonly tokens: Tokens
  /** The text in the Tone's style. A Part paints at each draw, so that its lines follow the theme. */
  paint(tone: Tone, text: string): string
  /**
   * Sets how a piece of a component is drawn, by an instance's name, such as `request.choices.row`, or by its kind's, such as `list.row`.
   * `make` is handed the Look beneath it, and returns the Look. The Look beneath is found each time it draws.
   * Everything drawn with Looks is drawn again after each of `options.models` changes.
   */
  look<F extends Look>(name: string, make: (beneath: F) => F, options?: LookOptions): Handle
  /**
   * The Look that draws a piece: the newest set by the first of these names, an instance's then its kind's.
   * Each Look's beneath is the one set before it by its name, then the newest by the next name, and at the end `fallback`.
   */
  lookOf<F extends Look>(names: readonly string[], fallback: F): F
  /** Names a model, such as a component's, so that anyone can read and change it; the newest by a name wins. */
  model<S extends object>(name: string, model: Model<S>): Handle
  modelOf<S extends object>(name: string): Model<S> | undefined
}

/**
 * The session that the Chat shows. The core opens it, and provides it as `binnacleSession` once it is open.
 * It opens after dsh's plugins settle, so a plugin waits for it with `ctx.inject(['binnacleSession'], …)` in its apply:
 * dsh reports a plugin that injects it at load as one that did not activate.
 */
export interface ChatSession {
  /** Its id, as dsh names it. */
  readonly id: string
  /** The agent that runs it. A stored session that `--session` names has none, and takes nothing that is sent. */
  readonly agent: Agent | undefined
  /** Its events so far, in order, as dsh keeps them. */
  readonly events: readonly SessionEvent[]
  /** Sends a prompt, or steers the turn that runs. */
  send(text: string): void
  /** Interrupts the turn that runs; what was queued for it waits for the next turn. */
  interrupt(): void
}

/**
 * The Requests that stand in the Chat, as the row `binnacle-requests` provides them: a question or an approval waits until the one before it is settled.
 * It answers dsh only while a view is attached to it. Its watchers learn after a Request comes or goes, or a draft changes, as a Model's do.
 */
export interface Requests extends Watchable {
  /** The Request on view: the first that stands. */
  readonly shown: Request | undefined
  /** How many stand, the one on view included. */
  readonly standing: number
  /**
   * A view says that it draws the Requests, and the model answers dsh while one is attached. It returns what detaches the view.
   * With no view attached, a Request that comes goes on to dsh's own fallback, and a Request that stands when the last view detaches fails closed.
   */
  attach(): () => void
}

/** A Request that has gone, withdrawn, answered, dismissed or failed, ignores every call made on it after. */
export type Request = QuestionRequest | ApprovalRequest

/** A tool asks before it runs. Each text is plain. */
export interface ApprovalRequest {
  readonly kind: 'approval'
  readonly tool: string
  /** The id of the agent that asks, when it is not the Chat's own agent, such as a subagent. */
  readonly agent: string | undefined
  readonly why: string | undefined
  /** The call's arguments, as JSON indented by two, one line each, at most 12 then a line that says how many more. */
  readonly arguments: readonly string[]
  /** dsh's outcomes that a person can answer: dsh has no "always". */
  readonly choices: readonly ApprovalChoice[]
  /** The outcome chosen so far, which `submit()` sends. */
  readonly chosen: ApprovalChoice | undefined
  /** Changes the draft, and sends nothing. */
  choose(outcome: ApprovalChoice): void
  /** Sends the outcome chosen; with none chosen, nothing is sent. */
  submit(): void
  /** The person rejected it without choosing, and the agent learns it. */
  dismiss(): void
}

export type ApprovalChoice = 'allowed-once' | 'rejected'

/** The agent asks one question or several; their answers go back together. */
export interface QuestionRequest {
  readonly kind: 'question'
  /** The id of the agent that asks, when it is not the Chat's own agent, such as a subagent. */
  readonly agent: string | undefined
  readonly questions: readonly Question[]
  /** The index of the question on view. */
  readonly index: number
  /** Puts the question at that index on view. A question with no options is typed at once. */
  go(index: number): void
  /** Whether the person types an answer to the question on view. */
  readonly typing: boolean
  type(on: boolean): void
  /** Each question's answer so far, by the index of its question. */
  readonly drafts: readonly Draft[]
  /** In the question on view, selects the option by its label, or unselects it; in a question that allows one, it is the only one. */
  toggle(label: string): void
  /** The typed answer to the question on view, trimmed; an empty one, or `undefined`, takes it back. In a question that allows one, it is the only answer. */
  write(text: string | undefined): void
  /** Sends every question's draft, answered or not. */
  submit(): void
  /** The person dismissed the whole Request, and the agent learns it. */
  dismiss(): void
}

export interface Question {
  readonly id: string
  readonly header: string | undefined
  readonly question: string
  readonly detail: readonly string[]
  readonly multiSelect: boolean
  /** A plan review: the detail is the plan, and the option that approves it is first. */
  readonly planReview: boolean
  /** Its options, then a typed answer, then, where more than one can be chosen, done. A question with no options has none. */
  readonly choices: readonly Choice[]
}

export type Choice =
  | {
      readonly kind: 'option'
      /** As the agent offered it: its identity, which `toggle`, the drafts and what is sent carry. It is not plain, so draw `text`. */
      readonly label: string
      /** The label made plain, to draw. */
      readonly text: string
      readonly description: string | undefined
    }
  | { readonly kind: 'other' }
  | { readonly kind: 'done' }

export interface Draft {
  /** The labels selected, as the agent offered them. */
  readonly selected: readonly string[]
  readonly custom: string | undefined
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    binnacle: Binnacle
    binnacleSession: ChatSession
    binnacleRequests: Requests
  }
}
