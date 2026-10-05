const moveTo = (row: number): string => `\x1b[${row + 1};1H`
const RESET_STYLE = '\x1b[0m'
const CLEAR_TO_LINE_END = '\x1b[K'
const CLEAR_SCREEN = '\x1b[2J'
const BEGIN_SYNCHRONIZED = '\x1b[?2026h'
const END_SYNCHRONIZED = '\x1b[?2026l'

/** Writes only the rows that changed since the last draw. */
export class Display {
  #drawn: readonly string[] = []
  readonly #write: (data: string) => void

  constructor(write: (data: string) => void) {
    this.#write = write
  }

  /** Each row must already fit the terminal's width. */
  draw(rows: readonly string[]): void {
    let changes = ''
    const count = Math.max(rows.length, this.#drawn.length)
    for (let y = 0; y < count; y++) {
      const row = rows[y] ?? ''
      if (row === (this.#drawn[y] ?? '')) continue
      changes += moveTo(y) + row + RESET_STYLE + CLEAR_TO_LINE_END
    }
    this.#drawn = rows
    if (changes !== '') this.#write(BEGIN_SYNCHRONIZED + changes + END_SYNCHRONIZED)
  }

  clear(): void {
    this.#drawn = []
    this.#write(CLEAR_SCREEN)
  }
}
