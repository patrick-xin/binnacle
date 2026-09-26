/**
 * The screen: a session's facts and the UI state, at a width, as every line
 * of the transcript and the regions on them.
 *
 * It draws the whole transcript, which pi-tui windows, scrolls and selects
 * ([ADR 7](../../../../docs/adr/0007-pi-tui-windows-scrolls-and-selects-the-transcript.md)).
 */

import type { Fact } from '../facts/adapt.ts'
import { transcript } from '../models/transcript.ts'
import { layout } from '../ui/layout.ts'
import type { Frame } from '../ui/layout.ts'
import type { Node } from '../ui/node.ts'
import type { UiState } from '../ui/state.ts'
import { drawEntry } from './entries.ts'
import type { View } from './entries.ts'

/** What the screen draws, and what on it can take focus. */
export interface Screen extends Frame {
  /** The regions that offer something, in screen order. */
  readonly focusable: readonly string[]
}

/**
 * Draw the whole transcript at a width.
 * @param facts - the session's facts, in log order.
 * @param state - what the person has changed about the screen.
 * @param width - the columns it is given.
 * @param views - authors' views, as `drawEntry` takes them.
 * @returns every line, every region on them, and what can take focus.
 */
export function screen(facts: readonly Fact[], state: UiState, width: number, views: ReadonlyMap<string, View> = new Map()): Screen {
  const turns = transcript(facts).turns.map((turn): Node => ({ kind: 'stack', children: turn.entries.map(entry => drawEntry(entry, views)) }))
  const children = turns.flatMap((turn, index): Node[] => index === 0 ? [turn] : [{ kind: 'blank' }, turn])
  const frame = layout({ kind: 'stack', children }, width, state)
  return { ...frame, focusable: frame.regions.filter(placed => placed.region.affordances.length > 0).map(placed => placed.region.id) }
}
