import type { Layout, Part, Point, Screen } from '../api.ts'
import { Display } from './display.ts'
import type { Size } from './host.ts'
import { arrange } from './layout.ts'
import type { Hit, Placed } from './layout.ts'
import type { Moved } from './service.ts'
import type { Theme } from './theme.ts'
import { Scroll } from './scroll.ts'
import { Rows } from './view.ts'

/** The service, read through this: the service draws through Drawing, so neither is whole when the other is made. */
export interface OnView extends Theme {
  readonly screenOnView: Screen
  readonly layoutOnView: Layout
  /** The Place the Focus was moved to on the Screen on view; `null` once the core forgot it; `undefined` if no one has moved it. */
  focusMovedTo(): Moved | null | undefined
  /** A person or an author moved the Focus on the Screen on view to that Place. */
  moveFocus(place: string): void
  /** The core forgets the Focus moved on the Screen on view: its Place had it and stopped taking keys. */
  forgetMovedFocus(): void
  partIn(place: string): Part | undefined
  /** The newest Layout set by that name. */
  layoutNamed(name: string): Layout | undefined
  /** A Place takes keys while its Part does, or while an action acts in it. */
  takesKeys(place: string): boolean
  /** A click that the Part in the Place did not take goes to the Place's actions bound to it. True when one took it. */
  clickActions(gesture: string, place: string, at: Point | undefined): boolean
}

/** The Focus, the wheel and a click need where each Place was last drawn, so what draws keeps it. */
export class Drawing {
  readonly #size: () => Size | undefined
  readonly #onView: () => OnView
  readonly #display: Display
  readonly #rows = new Rows()
  readonly #scroll = new Scroll()
  #placed: readonly Placed[] = []
  #hits: readonly Hit[] = []
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
      arrange(
        view.layoutOnView,
        size.columns,
        size.rows,
        {
          rows: (place, width) => {
            const rows = this.#rows.of(view.partIn(place), width)
            this.#scroll.anchor(place, width, rows.length)
            return rows
          },
          scrolledUp: (place) => this.#scroll.up(place),
          cursor: (place, width) => (place === focus ? this.#rows.cursorOf(view.partIn(place), width) : undefined),
          paged: (place, width) => this.#scroll.paged(place, view.partIn(place)?.cursor?.(width)),
          layout: (name) => view.layoutNamed(name),
        },
        view,
      )
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
    this.#hits = arranged.hits
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

  forgetAll(): void {
    this.#rows.forgetAll()
  }

  /** The Part with the Focus, while its Place is drawn. */
  focused(): Part | undefined {
    const focus = this.focusedPlace()
    return focus === undefined ? undefined : this.#onView().partIn(focus)
  }

  focusedPlace(): string | undefined {
    return this.#focus(this.#placed)
  }

  /** The wheel scrolls the Place under the pointer, at a cell counted from 0. */
  wheel(notches: number, x: number, y: number): void {
    const under = this.#under(x, y)
    if (under === undefined) return
    this.#scroll.wheel(under.place, notches)
    this.draw()
  }

  /** A press of the left button at the cell under the pointer, by its gesture's name. The Focus moves first, then the click reaches the Part, then the Place's actions. */
  click(x: number, y: number, gesture: string): boolean {
    const view = this.#onView()
    const under = this.#under(x, y)
    if (under === undefined) return false
    const part = view.partIn(under.place)
    if (view.takesKeys(under.place)) view.moveFocus(under.place)
    const at = this.#pointIn(under, part, x, y)
    if (at !== undefined && part?.click?.(at) === true) {
      this.forget(part)
      this.draw()
      return true
    }
    return view.clickActions(gesture, under.place, at)
  }

  /** A page is as many rows as the Place's box shows. */
  scroll(place: string, pages: number): void {
    const placed = this.#placed.find((drawn) => drawn.place === place)
    if (placed === undefined || placed.content.height < 1) return
    const { width, height } = placed.content
    // The cursor of the Part with the Focus can show other rows than the Place's scroll, so a page starts from the rows shown.
    const shownUp = Math.max(0, placed.maxScroll - placed.shownFrom)
    this.#scroll.page(place, shownUp, pages * height, this.#onView().partIn(place)?.cursor?.(width))
    this.draw()
  }

  /** Shift+tab: the Focus to the next Place on view that takes keys, in the order of the layout, from the last back to the first. */
  nextFocus(): void {
    const takers = this.#takers(this.#placed)
    if (takers.length === 0) return
    const focus = this.#focus(this.#placed)
    const from = takers.findIndex(({ place }) => place === focus)
    this.#onView().moveFocus(takers[(from + 1) % takers.length]!.place)
  }

  /** The Place under the pointer, a float before what it covers, unless the mouse does nothing there. */
  #under(x: number, y: number): Placed | undefined {
    return this.#hits.find(({ top, left, width, height }) => y >= top && y < top + height && x >= left && x < left + width)?.placed
  }

  /** The Places on view that take keys, in the order of the layout. */
  #takers(placed: readonly Placed[]): readonly Placed[] {
    const view = this.#onView()
    return placed.filter(({ place, width, height }) => width > 0 && height > 0 && view.takesKeys(place))
  }

  #focus(placed: readonly Placed[]): string | undefined {
    const view = this.#onView()
    const takers = this.#takers(placed)
    const moved = view.focusMovedTo()
    if (typeof moved === 'object' && moved !== null) {
      if (takers.some(({ place }) => place === moved.place)) {
        moved.had = true
        return moved.place
      }
      // A Focus moved before its Place draws waits for it, so an author can move it to a Place that is still to come.
      if (moved.had) view.forgetMovedFocus()
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
    if (part === undefined) return undefined
    const { top, left, width, height } = under.content
    if (y < top || y >= top + height || x < left || x >= left + width) return undefined
    return this.#rows.pointAt(part, width, under.shownFrom + y - top, x - left)
  }
}
