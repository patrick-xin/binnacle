import type { Part } from '../api.ts'
import { stripTerminalSequences, visibleWidth, wrapTextWithAnsi } from '../terminal/utils.ts'

// Stripping sequences leaves single controls that a terminal still obeys: C0 but the tab, DEL, and C1.
const CONTROLS = /[\x00-\x08\x0a-\x1f\x7f-\x9f]/g
// pi-tui's width counts a tab as three columns, so a tab is drawn as three spaces.
const TAB = '   '

// Select Graphic Rendition: colour and style, and nothing that moves the cursor or changes the terminal.
const SGR = /(\x1b\[[\d;:]*m)/

/** Untrusted Text, made plain: every control sequence is taken out. */
export function toPlainText(untrusted: string): string {
  return stripTerminalSequences(untrusted).replace(CONTROLS, '').replaceAll('\t', TAB)
}

function toStyledText(line: string): string {
  return line
    .split(SGR)
    .map((piece, index) => (index % 2 === 1 ? piece : toPlainText(piece)))
    .join('')
}

const rowsOfLine = (line: string, width: number): string[] => wrapTextWithAnsi(toStyledText(line), width)

interface Wrapped {
  readonly width: number
  readonly lines: readonly string[]
  // The rows each line wraps to, then all of them.
  readonly rowsOfLines: readonly (readonly string[])[]
  readonly rows: readonly string[]
}

/** Each Part's lines, wrapped at a width, kept until the Part redraws. A draw then costs only what changed. */
export class Rows {
  private wrapped = new WeakMap<Part, Wrapped>()

  forget(part: Part): void {
    this.wrapped.delete(part)
  }

  of(part: Part | undefined, width: number): readonly string[] {
    return part === undefined ? [] : this.#wrap(part, width).rows
  }

  #wrap(part: Part, width: number): Wrapped {
    const kept = this.wrapped.get(part)
    if (kept?.width === width) return kept
    const lines = width < 1 ? [] : part.lines(width)
    const rowsOfLines = lines.map((line) => rowsOfLine(line, width))
    const wrapped = { width, lines, rowsOfLines, rows: rowsOfLines.flat() }
    this.wrapped.set(part, wrapped)
    return wrapped
  }

  cursorOf(part: Part | undefined, width: number): { row: number; column: number } | undefined {
    const cursor = part?.cursor?.(width)
    if (part === undefined || cursor === undefined || width < 1) return undefined
    const { lines, rowsOfLines } = this.#wrap(part, width)
    const before = rowsOfLines.slice(0, cursor.line).reduce((rows, wrapped) => rows + wrapped.length, 0)
    // A wrap drops the blanks where it breaks, so each row is found in the line to know the column it starts at.
    const plain = toPlainText(lines[cursor.line] ?? '')
    let from = 0
    const starts = (rowsOfLines[cursor.line] ?? []).map((wrapped) => {
      const text = toPlainText(wrapped)
      const at = Math.max(from, plain.indexOf(text, from))
      from = at + text.length
      return visibleWidth(plain.slice(0, at))
    })
    const row = Math.max(
      0,
      starts.findLastIndex((start) => start <= cursor.column),
    )
    return { row: before + row, column: cursor.column - (starts[row] ?? 0) }
  }
}
