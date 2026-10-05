import type { Part } from '../api.ts'
import { stripTerminalSequences, wrapTextWithAnsi } from '../terminal/utils.ts'

// Stripping sequences leaves single controls that a terminal still obeys: C0 but the tab, DEL, and C1.
const CONTROLS = /[\x00-\x08\x0a-\x1f\x7f-\x9f]/g
// pi-tui's width counts a tab as three columns, so a tab is drawn as three spaces.
const TAB = '   '

export function toPlainText(untrusted: string): string {
  return stripTerminalSequences(untrusted).replace(CONTROLS, '').replaceAll('\t', TAB)
}

export function rowsOf(part: Part | undefined, width: number): string[] {
  if (part === undefined || width < 1) return []
  return part.lines(width).flatMap((line) => wrapTextWithAnsi(toPlainText(line), width))
}
