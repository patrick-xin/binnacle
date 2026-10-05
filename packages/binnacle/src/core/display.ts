const moveTo = (row: number, column = 0): string => `\x1b[${row + 1};${column + 1}H`
const RESET_STYLE = '\x1b[0m'
const CLEAR_TO_LINE_END = '\x1b[K'
const CLEAR_SCREEN = '\x1b[2J'
const BEGIN_SYNCHRONIZED = '\x1b[?2026h'
const END_SYNCHRONIZED = '\x1b[?2026l'

/** Writes only the rows that changed since the last draw. */
export class Display {
  #drawn: readonly string[] = []
  #cursorTo = ''
  readonly #write: (data: string) => void

  constructor(write: (data: string) => void) {
    this.#write = write
  }

  /** Each row must already fit the terminal's width. */
  draw(rows: readonly string[], cursor?: { row: number; column: number }): void {
    let changes = ''
    const count = Math.max(rows.length, this.#drawn.length)
    for (let y = 0; y < count; y++) {
      const row = rows[y] ?? ''
      if (row === (this.#drawn[y] ?? '')) continue
      changes += moveTo(y) + row + RESET_STYLE + CLEAR_TO_LINE_END
    }
    this.#drawn = rows
    // Writing a row moves the cursor, so it is put back after any row changes. It stays hidden: a Part draws its own.
    const cursorTo = cursor === undefined ? '' : moveTo(cursor.row, cursor.column)
    if (changes !== '' || cursorTo !== this.#cursorTo) this.#write(BEGIN_SYNCHRONIZED + changes + cursorTo + END_SYNCHRONIZED)
    this.#cursorTo = cursorTo
  }

  clear(): void {
    this.#drawn = []
    this.#cursorTo = ''
    this.#write(CLEAR_SCREEN)
  }
}
