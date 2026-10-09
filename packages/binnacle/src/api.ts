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
  /** A key, as the terminal sent it, while the Part has the Focus. It returns true when it used the key, and the core draws the Part again; the Gesture Table takes the rest. */
  key?(data: string): boolean
  /** A click at the cell under the pointer: a line of the Part's lines and a column in cells, however the line wraps and the Place scrolls; past the end of a line, on its row, the column is past the line's end. It returns true when the Part used the click, and the core draws the Part again; the Gesture Table takes the rest. A click on the Place's box or below the Part's lines does not reach the Part. */
  click?(at: Point): boolean
  /** The Place gained or lost the Focus, and the core draws the Part again, as its lines may show the Focus. */
  focus?(has: boolean): void
  /** What the Part is drawn from: the core draws it again after each of them changes. */
  readonly models?: readonly Watchable[]
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
  readonly size?: Size
}

export type Layout =
  | (Node & { readonly place: string; readonly row?: never; readonly column?: never })
  | (Node & { readonly row: readonly Layout[]; readonly place?: never; readonly column?: never })
  | (Node & { readonly column: readonly Layout[]; readonly place?: never; readonly row?: never })

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

export interface Gestures {
  /** The ids of the actions a gesture is bound to: a key, as the terminal sent it, or a mouse gesture by name. */
  actionsOf(gesture: string): readonly string[]
}

export interface Binnacle {
  /** The Gesture Table: what each key and each mouse gesture is bound to. */
  readonly gestures: Gestures
  /** Only the newest Screen shown is drawn. The Chat is the first. */
  show(screen: Screen): Handle
  /** Replaces the layout of the Screen by that name; the newest layout wins. */
  layout(screen: string, layout: Layout): Handle
  /** Fills the Place by that name on every Screen; the newest Part wins. */
  place(name: string, part: Part): Handle
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

declare module '@deepseek-ai/cordis' {
  interface Context {
    binnacle: Binnacle
    binnacleSession: ChatSession
  }
}
