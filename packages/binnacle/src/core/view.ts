import type { Part } from '../api.ts'
import { stripTerminalSequences, wrapTextWithAnsi } from '../terminal/utils.ts'

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

export function rowsOf(part: Part | undefined, width: number): string[] {
  if (part === undefined || width < 1) return []
  return part.lines(width).flatMap((line) => wrapTextWithAnsi(toStyledText(line), width))
}
