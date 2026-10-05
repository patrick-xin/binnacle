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

export function rowsOf(part: Part | undefined, width: number): string[] {
  if (part === undefined || width < 1) return []
  return part.lines(width).flatMap((line) => rowsOfLine(line, width))
}

/** A Part's cursor, moved to the rows its lines wrap to. */
export function cursorOf(part: Part | undefined, width: number): { row: number; column: number } | undefined {
  const cursor = part?.cursor?.(width)
  if (part === undefined || cursor === undefined || width < 1) return undefined
  const lines = part.lines(width)
  let row = lines.slice(0, cursor.line).reduce((rows, line) => rows + rowsOfLine(line, width).length, 0)
  let column = cursor.column
  for (const wrapped of rowsOfLine(lines[cursor.line] ?? '', width).slice(0, -1)) {
    if (column < visibleWidth(wrapped)) break
    column -= visibleWidth(wrapped)
    row++
  }
  return { row, column }
}
