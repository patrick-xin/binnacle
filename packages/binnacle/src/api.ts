// A module augmentation merges into Cordis's Context only in a file that imports Cordis.
// oxlint-disable-next-line no-unassigned-import
import '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

export interface Part {
  /** Unwrapped. A line keeps its colour and style; the core takes out every other control sequence, then wraps it at the width. */
  lines(width: number): readonly string[]
  /** Where the cursor is in the lines at that width, while the Part has the Focus. */
  cursor?(width: number): Cursor | undefined
  /** A key, as the terminal sent it, while the Part has the Focus. It returns true when it used the key, and the core draws the Part again; the Key Table takes the rest. */
  key?(data: string): boolean
}

/** A line of a Part's lines, and a column in cells. */
export interface Cursor {
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
  /** The Place that has the Focus while the Screen is on view. */
  readonly focus?: string
}

export interface Handle {
  redraw(): void
  /** The core also disposes it when the plugin that drew it unloads. */
  dispose(): void
}

export interface Keys {
  /** The ids of the actions a key is bound to, for the key as the terminal sent it. */
  actionsOf(key: string): readonly string[]
}

export interface Binnacle {
  readonly keys: Keys
  /** Only the newest Screen shown is drawn. The Chat is the first. */
  show(screen: Screen): Handle
  /** Replaces the layout of the Screen by that name; the newest layout wins. */
  layout(screen: string, layout: Layout): Handle
  /** Fills the Place by that name on every Screen; the newest Part wins. */
  place(name: string, part: Part): Handle
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
