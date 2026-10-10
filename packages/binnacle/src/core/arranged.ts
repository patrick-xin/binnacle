import type { Layout } from '../api.ts'

export interface Places {
  rows(place: string, width: number): readonly string[]
  /** The first of the Part's lines at that width, before it is wrapped; none while it has no line. */
  firstLine(place: string, width: number): string | undefined
  scrolledUp(place: string): number
  /** In the Place's rows; only the Place with the Focus has one. */
  cursor(place: string, width: number): Position | undefined
  /** An author paged the Place, and its cursor has not moved since: the Place shows the paged rows, not the cursor's. */
  paged(place: string, width: number): boolean
  /** The newest Layout set by that name. */
  layout(name: string): Layout | undefined
}

export interface Arranged {
  readonly rows: string[]
  /** In the order of the layout. */
  readonly placed: Placed[]
  /** The topmost first: what floats comes before what it covers. */
  readonly hits: Hit[]
  /** On the terminal, where the cursor of the Part with the Focus is drawn. */
  readonly cursor: Position | undefined
}

export interface Position {
  readonly row: number
  readonly column: number
}

/** A Place as it was laid out: its box's cells, which the wheel hits, and the Part's rows inside, which a click hits. */
export interface Placed {
  readonly place: string
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
  readonly maxScroll: number
  readonly content: { readonly top: number; readonly left: number; readonly width: number; readonly height: number }
  /** The Part's row shown at the top of its box, however the Place is scrolled. */
  readonly shownFrom: number
}

/** Cells that a click or the wheel lands on: a Place drawn, or none, where the mouse does nothing or a float's box covers. */
export interface Hit extends Cells {
  readonly placed: Placed | undefined
}

export interface Cells {
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
}

/** The hit's cells inside the box, or none when it is outside. */
export function clipped(hit: Hit, box: Cells): Hit | undefined {
  const top = Math.max(hit.top, box.top)
  const left = Math.max(hit.left, box.left)
  const bottom = Math.min(hit.top + hit.height, box.top + box.height)
  const right = Math.min(hit.left + hit.width, box.left + box.width)
  return bottom > top && right > left ? { ...hit, top, left, width: right - left, height: bottom - top } : undefined
}
