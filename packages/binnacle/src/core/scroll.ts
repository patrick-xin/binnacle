import type { Placed } from './layout.ts'

const ROWS_PER_WHEEL_NOTCH = 3

/** How far each Place is scrolled up from its end, in rows. */
export class Scroll {
  readonly #up = new Map<string, number>()
  readonly #counted = new Map<string, number>()
  readonly #anchored = new Set<string>()

  up(place: string): number {
    return this.#up.get(place) ?? 0
  }

  wheel(place: string, notches: number): void {
    this.#up.set(place, Math.max(0, this.up(place) + notches * ROWS_PER_WHEEL_NOTCH))
  }

  /** Each draw anchors each Place once. */
  startDraw(): void {
    this.#anchored.clear()
  }

  // While a person reads scrolled up, the rows a Part adds or takes away at its end move the view with them.
  // A Place sized by its content is also measured at other widths, so it moves once a draw, at the first width asked.
  anchor(place: string, width: number, count: number): void {
    const key = `${width} ${place}`
    const before = this.#counted.get(key) ?? count
    this.#counted.set(key, count)
    const up = this.up(place)
    if (up === 0 || this.#anchored.has(place)) return
    this.#anchored.add(place)
    this.#up.set(place, Math.max(0, up + count - before))
  }

  /** A Place is never scrolled past its start. */
  clamp(placed: readonly Placed[]): void {
    for (const { place, maxScroll } of placed) this.#up.set(place, Math.min(this.up(place), maxScroll))
  }
}
