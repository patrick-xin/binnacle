/**
 * The screen: a session's transcript and the UI state, at a width, as every
 * line of the transcript and the regions on them.
 *
 * It draws the whole transcript, which pi-tui windows, scrolls and selects
 * ([ADR 7](../../../../docs/adr/0007-pi-tui-windows-scrolls-and-selects-the-transcript.md)),
 * so a frame's cost is kept to what changed: each entry's view is called once
 * and its layout kept while its width and folds stay as they were.
 */

import type { Fact } from '../facts/adapt.ts'
import { transcript } from '../models/transcript.ts'
import type { Entry, Transcript } from '../models/transcript.ts'
import { layout } from '../ui/layout.ts'
import type { Frame, Placed } from '../ui/layout.ts'
import type { Node } from '../ui/node.ts'
import type { UiState } from '../ui/state.ts'
import { drawEntry, keyOf } from './entries.ts'
import type { View, Views } from './entries.ts'

/** What the screen draws, and what on it can take focus. */
export interface Screen extends Frame {
  /** The regions that offer something, in screen order. */
  readonly focusable: readonly string[]
  /** For each entry, in log order across turns, the line after its last; the blank line opening a turn is drawn before its first entry, so it is never an entry's own. */
  readonly ends: readonly number[]
}

/** Draws one screen after another from the same session. */
export type DrawScreen = (model: Transcript, state: UiState, width: number, views?: Views) => Screen

/** What an entry drew, and how it was last laid out. */
interface Drawing {
  /** The views of its key that drew it, as they stood; none when binnacle's own did. */
  readonly by: readonly View[] | undefined
  /** What its views returned. */
  readonly node: Node
  /** The id of every fold in it. */
  readonly folds: readonly string[]
  /** Its last layout: at what width, which of `folds` were open, and what it drew. */
  readonly laid?: { readonly width: number, readonly open: readonly boolean[], readonly frame: Frame }
}

/**
 * The id of every fold in a node, however deep.
 */
function foldsIn(node: Node): string[] {
  switch (node.kind) {
    case 'blank':
    case 'text':
    case 'markdown':
      return []
    case 'stack':
      return node.children.flatMap(foldsIn)
    case 'offer':
    case 'card':
      return foldsIn(node.child)
    case 'fold':
      return [node.id, ...foldsIn(node.child)]
  }
}

/**
 * A way to draw screens that keeps what each entry drew. An entry is a value
 * the transcript replaces when it changes, so what it drew is kept against
 * the entry itself, and against the views of its key, which are replaced as
 * a whole when one is registered, disposed or invalidated; the layout is kept
 * against the width and against which of its folds are open, which is all of
 * the state layout reads.
 * @returns the drawer, holding nothing yet.
 */
export function screens(): DrawScreen {
  const drawings = new WeakMap<Entry, Drawing>()
  const frameOf = (entry: Entry, state: UiState, width: number, views: Views): Frame => {
    const by = views.get(keyOf(entry))
    let drawing = drawings.get(entry)
    if (drawing === undefined || drawing.by !== by) {
      const node = drawEntry(entry, views)
      drawing = { by, node, folds: foldsIn(node) }
    }
    const laid = drawing.laid
    if (laid?.width === width && drawing.folds.every((id, index) => state.expanded.has(id) === laid.open[index])) return laid.frame
    const frame = layout(drawing.node, width, state)
    drawings.set(entry, { ...drawing, laid: { width, open: drawing.folds.map(id => state.expanded.has(id)), frame } })
    return frame
  }
  return (model, state, width, views = new Map()) => {
    const lines: string[] = []
    const regions: Placed[] = []
    const ends: number[] = []
    for (const [index, turn] of model.turns.entries()) {
      if (index > 0) lines.push('')
      for (const entry of turn.entries) {
        const frame = frameOf(entry, state, width, views)
        for (const placed of frame.regions) regions.push({ ...placed, top: placed.top + lines.length })
        // One line at a time: spreading an entry's lines into `push` throws once it draws more than about a hundred thousand.
        for (const line of frame.lines) lines.push(line)
        ends.push(lines.length)
      }
    }
    return { lines, regions, focusable: regions.filter(placed => placed.region.affordances.length > 0).map(placed => placed.region.id), ends }
  }
}

/**
 * Draw the whole transcript at a width, once.
 * @param facts - the session's facts, in log order.
 * @param state - what the person has changed about the screen.
 * @param width - the columns it is given.
 * @param views - authors' views, as `drawEntry` takes them.
 * @returns every line, every region on them, and what can take focus.
 */
export function screen(facts: readonly Fact[], state: UiState, width: number, views: Views = new Map()): Screen {
  return screens()(transcript(facts), state, width, views)
}
