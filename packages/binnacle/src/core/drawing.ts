import type { Layout, Part, Point, Screen } from '../api.ts'
import { Display } from './display.ts'
import type { Size } from './host.ts'
import { arrange } from './layout.ts'
import type { Placed } from './layout.ts'
import { Scroll } from './scroll.ts'
import { Rows } from './view.ts'

/** The service, read through this: the service draws through Drawing, so neither is whole when the other is made. */
export interface OnView {
  readonly screenOnView: Screen
  readonly layoutOnView: Layout
  /** The Place a person moved the Focus to on the Screen on view; `null` once the core forgot it; `undefined` if no one has. */
  focusMovedTo(): string | null | undefined
  /** A person moved the Focus on the Screen on view to that Place. */
  moveFocus(place: string): void
  /** The core forgets the Focus a person moved on the Screen on view: its Place stopped taking keys. */
  forgetMovedFocus(): void
  partIn(place: string): Part | undefined
}

/** The Focus, the wheel and a click need where each Place was last drawn, so what draws keeps it. */
export class Drawing {
  readonly #size: () => Size | undefined
  readonly #onView: () => OnView
  readonly #display: Display
  readonly #rows = new Rows()
  readonly #scroll = new Scroll()
  #placed: readonly Placed[] = []
  // The Part last told it has the Focus.
  #focusTold: Part | undefined

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
    const measure = (focus: string | undefined) =>
      arrange(view.layoutOnView, size.columns, size.rows, {
        rows: (place, width) => {
          const rows = this.#rows.of(view.partIn(place), width)
          this.#scroll.anchor(place, width, rows.length)
          return rows
        },
        scrolledUp: (place) => this.#scroll.up(place),
        cursor: (place, width) => (place === focus ? this.#rows.cursorOf(view.partIn(place), width) : undefined),
      })
    // Which Places take keys is known only once they are laid out, and telling a Part the Focus can move the layout
    // and so the Places that take keys: the Screen is measured and the Focus settled again until it stops moving.
    let focus: string | undefined
    let arranged = measure(undefined)
    for (let pass = 0; ; pass++) {
      const settled = this.#focus(arranged.placed)
      const told = this.#tellFocus(settled === undefined ? undefined : view.partIn(settled))
      if ((settled === focus && !told) || pass === 7) break
      focus = settled
      arranged = measure(focus)
    }
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
    const focus = this.#focus(this.#placed)
    return focus === undefined ? undefined : this.#onView().partIn(focus)
  }

  /** The wheel scrolls the Place under the pointer, at a cell counted from 0. */
  wheel(notches: number, x: number, y: number): void {
    const under = this.#placed.find(({ top, left, width, height }) => y >= top && y < top + height && x >= left && x < left + width)
    if (under === undefined) return
    this.#scroll.wheel(under.place, notches)
    this.draw()
  }

  /** A press of the left button at the cell under the pointer. The Focus moves first, then the click reaches the Part. */
  click(x: number, y: number): boolean {
    const view = this.#onView()
    const under = this.#placed.find(({ top, left, width, height }) => y >= top && y < top + height && x >= left && x < left + width)
    if (under === undefined) return false
    const part = view.partIn(under.place)
    if (part?.key !== undefined) view.moveFocus(under.place)
    const at = this.#pointIn(under, part, x, y)
    if (at === undefined || part?.click?.(at) !== true) return false
    this.forget(part)
    this.draw()
    return true
  }

  /** Shift+tab: the Focus to the next Place on view whose Part takes keys, in the order of the layout, from the last back to the first. */
  nextFocus(): void {
    const takers = this.#takers(this.#placed)
    if (takers.length === 0) return
    const focus = this.#focus(this.#placed)
    const from = takers.findIndex(({ place }) => place === focus)
    this.#onView().moveFocus(takers[(from + 1) % takers.length]!.place)
  }

  /** The Places on view that take keys, in the order of the layout. */
  #takers(placed: readonly Placed[]): readonly Placed[] {
    const view = this.#onView()
    return placed.filter(({ place, width, height }) => width > 0 && height > 0 && view.partIn(place)?.key !== undefined)
  }

  #focus(placed: readonly Placed[]): string | undefined {
    const view = this.#onView()
    const takers = this.#takers(placed)
    const moved = view.focusMovedTo()
    if (typeof moved === 'string') {
      if (takers.some(({ place }) => place === moved)) return moved
      view.forgetMovedFocus()
    }
    const own = view.screenOnView.focus
    if (own !== undefined && takers.some(({ place }) => place === own)) return own
    // A Screen that names no Focus of its own, that no person has moved, has none; a Focus that was lost goes to the first Place that takes keys.
    return own === undefined && moved === undefined ? undefined : takers[0]?.place
  }

  /** The Part drawn in the Place with the Focus learns when it gains or loses the Focus; true when a Part was told. */
  #tellFocus(part: Part | undefined): boolean {
    if (this.#focusTold === part) return false
    const told = this.#focusTold
    this.#focusTold = part
    told?.focus?.(false)
    if (told !== undefined) this.forget(told)
    part?.focus?.(true)
    if (part !== undefined) this.forget(part)
    return true
  }

  /** The cell under the pointer as the Part's line and column, or none on the Place's box or below the Part's lines. */
  #pointIn(under: Placed, part: Part | undefined, x: number, y: number): Point | undefined {
    if (part?.click === undefined) return undefined
    const { top, left, width, height } = under.content
    if (y < top || y >= top + height || x < left || x >= left + width) return undefined
    return this.#rows.pointAt(part, width, under.shownFrom + y - top, x - left)
  }
}
