/**
 * The clock a test of the host drives: what the host reads as now, and what
 * it asks to be called back after, moved on only when the test says so.
 * @module binnacle/test/support/clock
 */

/** A clock that moves only when a test advances it. */
export class FakeClock {
  #now = 0
  readonly #waiting = new Set<{ readonly at: number, readonly call: () => void }>()
  now(): number { return this.#now }
  after(ms: number, then: () => void): () => void {
    const timer = { at: this.#now + ms, call: then }
    this.#waiting.add(timer)
    return () => { this.#waiting.delete(timer) }
  }
  /**
   * Move time on, calling back each timer it passes, in the order they fall due.
   * @param ms - how far, in milliseconds.
   */
  advance(ms: number): void {
    this.#now += ms
    for (const timer of [...this.#waiting].toSorted((left, right) => left.at - right.at)) {
      if (timer.at > this.#now) continue
      this.#waiting.delete(timer)
      timer.call()
    }
  }
}
