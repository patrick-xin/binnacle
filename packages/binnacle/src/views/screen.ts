/**
 * The screen: a session's facts, the UI state and a size, as the lines a
 * person sees and the regions on them.
 * @module binnacle/views/screen
 */

import type { Fact } from '../facts/adapt.ts'
import { transcript } from '../models/transcript.ts'
import { layout } from '../ui/layout.ts'
import type { Frame } from '../ui/layout.ts'
import type { Node } from '../ui/node.ts'
import type { Bounds, UiState } from '../ui/state.ts'
import { drawEntry } from './entries.ts'

/** The rows and columns the screen is given. */
export interface Size {
  /** Columns. */
  readonly width: number
  /** Rows. */
  readonly height: number
}

/** What the screen shows, and what bounds an action on it. */
export interface Screen extends Frame {
  /** How far it can scroll, and what on it can take focus. */
  readonly bounds: Bounds
}

/**
 * Draw the screen.
 * @param facts - the session's facts, in log order.
 * @param state - what the person has changed about the screen.
 * @param size - the rows and columns it is given.
 * @returns what it shows, every region on it, and what bounds an action on it.
 */
export function screen(facts: readonly Fact[], state: UiState, size: Size): Screen {
  const turns = transcript(facts).turns.map((turn): Node => ({ kind: 'stack', children: turn.entries.map(drawEntry) }))
  const children = turns.flatMap((turn, index): Node[] => index === 0 ? [turn] : [{ kind: 'blank' }, turn])
  const frame = layout({ kind: 'stack', children }, size.width, state)
  const total = frame.lines.length
  const end = total - Math.min(Math.max(state.scroll, 0), Math.max(total - size.height, 0))
  const start = Math.max(end - size.height, 0)
  const lines = frame.lines.slice(start, end)
  const visible = frame.regions.flatMap((placed) => {
    const top = Math.max(placed.top, start)
    const bottom = Math.min(placed.top + placed.height, end)
    return bottom > top ? [{ ...placed, top: top - start, height: bottom - top }] : []
  })
  const region = { id: 'transcript', affordances: [], overflows: total > size.height }
  const bounds = {
    scrollLimit: Math.max(total - size.height, 0),
    focusable: visible.filter(placed => placed.region.affordances.length > 0).map(placed => placed.region.id),
  }
  return { lines, regions: [{ region, top: 0, height: lines.length }, ...visible], bounds }
}
