/**
 * The rows on the terminal, and the bytes that change them.
 * @module binnacle/core/display
 */

export class Display {
  #drawn: readonly string[] = []
  readonly #write: (data: string) => void

  constructor(write: (data: string) => void) {
    this.#write = write
  }

  /**
   * Bring the terminal to these rows, writing only the rows that changed.
   * @param rows - each row's text, already cut to the width, top first.
   */
  draw(rows: readonly string[]): void {
    let out = ''
    const count = Math.max(rows.length, this.#drawn.length)
    for (let y = 0; y < count; y++) {
      const row = rows[y] ?? ''
      if (row === (this.#drawn[y] ?? '')) continue
      out += `\x1b[${y + 1};1H${row}\x1b[0m\x1b[K`
    }
    this.#drawn = rows
    // Synchronized output: the terminal shows the frame whole, never half drawn.
    if (out !== '') this.#write(`\x1b[?2026h${out}\x1b[?2026l`)
  }

  /** Forget what is drawn: the next draw writes every row, as after the screen was cleared. */
  forget(): void {
    this.#drawn = []
    this.#write('\x1b[2J')
  }
}
