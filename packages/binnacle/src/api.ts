// A module augmentation merges into Cordis's Context only in a file that imports Cordis.
// oxlint-disable-next-line no-unassigned-import
import '@deepseek-ai/cordis'

export interface Part {
  /** Unwrapped, and untrusted: the core takes out control sequences, then wraps each line at the width. */
  lines(width: number): readonly string[]
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
  /** Untrusted, as a part's lines are. */
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
  /** The name a plugin replaces the screen's layout by. */
  readonly name: string
  readonly layout: Layout
}

export interface Drawn {
  redraw(): void
  /** The core also disposes it when the plugin that drew it unloads. */
  dispose(): void
}

export interface Binnacle {
  /** The id that `--session` names. */
  readonly session: string | undefined
  /** Only the newest screen shown is drawn. Talk is the first. */
  show(screen: Screen): Drawn
  /** Replaces the layout of the screen by that name; the newest layout wins. */
  layout(screen: string, layout: Layout): Drawn
  /** Fills the place by that name on every screen; the newest part wins. */
  place(name: string, part: Part): Drawn
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    binnacle: Binnacle
  }
}
