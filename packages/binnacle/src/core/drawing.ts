import type { Layout, Part } from '../api.ts'
import { Display } from './display.ts'
import type { Size } from './host.ts'
import { arrange } from './layout.ts'
import type { Placed } from './layout.ts'
import { Scroll } from './scroll.ts'
import { Rows } from './view.ts'

/** What is on view: the service's Screen and its Parts. */
export interface OnView {
  readonly layoutOnView: Layout
  readonly focusOnView: string | undefined
  partIn(place: string): Part | undefined
}

/** Draws the Screen on view onto the terminal, and knows where each Place was drawn. */
export class Drawing {
  readonly #size: () => Size | undefined
  readonly #onView: () => OnView
  readonly #display: Display
  readonly #rows = new Rows()
  readonly #scroll = new Scroll()
  #placed: readonly Placed[] = []

  constructor(size: () => Size | undefined, write: (data: string) => void, onView: () => OnView) {
    this.#size = size
    this.#onView = onView
    this.#display = new Display(write)
  }

  readonly draw = (): void => {
    const size = this.#size()
    if (size === undefined) return
    const view = this.#onView()
    this.#scroll.startDraw()
    const arranged = arrange(view.layoutOnView, size.columns, size.rows, {
      rows: (place, width) => {
        const rows = this.#rows.of(view.partIn(place), width)
        this.#scroll.anchor(place, width, rows.length)
        return rows
      },
      scrolledUp: (place) => this.#scroll.up(place),
      cursor: (place, width) => (place === view.focusOnView ? this.#rows.cursorOf(view.partIn(place), width) : undefined),
    })
    this.#placed = arranged.placed
    this.#scroll.clamp(this.#placed)
    this.#display.draw(arranged.rows, arranged.cursor)
  }

  readonly redrawAll = (): void => {
    this.#display.clear()
    this.draw()
  }

  /** A Part whose lines changed is wrapped again at its next draw. */
  forget(part: Part): void {
    this.#rows.forget(part)
  }

  /** The Part with the Focus, while its Place is drawn. */
  focused(): Part | undefined {
    const view = this.#onView()
    const place = view.focusOnView
    return place !== undefined && this.#placed.some((drawn) => drawn.place === place) ? view.partIn(place) : undefined
  }

  /** The wheel scrolls the Place under the pointer, at a cell counted from 0. */
  wheel(notches: number, x: number, y: number): void {
    const under = this.#placed.find(({ top, left, width, height }) => y >= top && y < top + height && x >= left && x < left + width)
    if (under === undefined) return
    this.#scroll.wheel(under.place, notches)
    this.draw()
  }
}
