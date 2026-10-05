/**
 * The screen on view, cut into the rows the terminal holds.
 * @module binnacle/core/view
 */
import type { Screen } from '../api.ts'
import { stripTerminalSequences, wrapTextWithAnsi } from '../terminal/utils.ts'

// What stripping sequences leaves that a terminal still obeys: C0 controls but the tab, DEL, and C1 controls.
// oxlint-disable-next-line no-control-regex
const CONTROLS = /[\x00-\x08\x0a-\x1f\x7f-\x9f]/g

/**
 * Text from a model or a tool, as text alone: its control sequences and controls taken out, and each tab as three spaces.
 * @param text - one line.
 * @returns what is left to draw.
 */
export function plain(text: string): string {
  return stripTerminalSequences(text).replace(CONTROLS, '').replaceAll('\t', '   ')
}

/**
 * The rows of a screen at a width and a height.
 * @param screen - the screen to draw, or none.
 * @param width - the terminal's columns.
 * @param height - the terminal's rows.
 * @returns each row, top first.
 */
export function rowsOf(screen: Screen | undefined, width: number, height: number): string[] {
  if (screen === undefined) return []
  const rows = screen.lines().flatMap((line) => wrapTextWithAnsi(plain(line), width))
  return rows.slice(0, height)
}
