/**
 * The screen on view, cut into the rows the terminal holds.
 * @module binnacle/core/view
 */
import type { Screen } from '../api.ts'
import { stripTerminalSequences, wrapTextWithAnsi } from '../terminal/utils.ts'

// What stripping sequences leaves that a terminal still obeys: C0 controls but the tab, DEL, and C1 controls.
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
 * The rows of a screen at a width and a height, scrolled up from its end.
 * @param screen - the screen to draw, or none.
 * @param width - the terminal's columns.
 * @param height - the terminal's rows.
 * @param back - how many rows the screen is scrolled up from its end.
 * @returns the rows on view, top first, and how far up the screen can scroll.
 */
export function rowsOf(screen: Screen | undefined, width: number, height: number, back: number): { rows: string[]; most: number } {
  if (screen === undefined) return { rows: [], most: 0 }
  const all = screen.lines().flatMap((line) => wrapTextWithAnsi(plain(line), width))
  const most = Math.max(0, all.length - height)
  const end = all.length - Math.min(back, most)
  return { rows: all.slice(Math.max(0, end - height), end), most }
}
