/**
 * The screen on view, cut into the rows the terminal holds.
 * @module binnacle/core/view
 */
import type { Screen } from '../api.ts'
import { wrapTextWithAnsi } from '../terminal/utils.ts'

/**
 * The rows of a screen at a width and a height.
 * @param screen - the screen to draw, or none.
 * @param width - the terminal's columns.
 * @param height - the terminal's rows.
 * @returns each row, top first.
 */
export function rowsOf(screen: Screen | undefined, width: number, height: number): string[] {
  if (screen === undefined) return []
  const rows = screen.lines().flatMap((line) => wrapTextWithAnsi(line, width))
  return rows.slice(0, height)
}
