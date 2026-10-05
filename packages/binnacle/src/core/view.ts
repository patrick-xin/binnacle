import type { Screen } from '../api.ts'
import { stripTerminalSequences, wrapTextWithAnsi } from '../terminal/utils.ts'

// Stripping sequences leaves single controls that a terminal still obeys: C0 but the tab, DEL, and C1.
const CONTROLS = /[\x00-\x08\x0a-\x1f\x7f-\x9f]/g
// pi-tui's width counts a tab as three columns, so a tab is drawn as three spaces.
const TAB = '   '

export function toPlainText(untrusted: string): string {
  return stripTerminalSequences(untrusted).replace(CONTROLS, '').replaceAll('\t', TAB)
}

export function rowsOf(
  screen: Screen | undefined,
  width: number,
  height: number,
  scrolledUp: number,
): { rows: string[]; maxScroll: number } {
  if (screen === undefined) return { rows: [], maxScroll: 0 }
  const all = screen.lines().flatMap((line) => wrapTextWithAnsi(toPlainText(line), width))
  const maxScroll = Math.max(0, all.length - height)
  const end = all.length - Math.min(scrolledUp, maxScroll)
  return { rows: all.slice(Math.max(0, end - height), end), maxScroll }
}
