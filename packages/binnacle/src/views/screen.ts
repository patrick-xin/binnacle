/**
 * The screen: a session's transcript and the UI state, at a width, as every
 * line of the transcript and the regions on them.
 *
 * It draws the whole transcript, which pi-tui windows, scrolls and selects,
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
  /** For each entry, in log order across turns, the line after its last; the blank line opening a turn is drawn before its first entry, so it is never an entry's own. An entry that drew nothing ends where the one before it did, and a turn every entry of which drew nothing draws no line at all, not even the blank one that opens a turn. */
  readonly ends: readonly number[]
}

/** Draws one screen after another from the same session. */
export type DrawScreen = (model: Transcript, state: UiState, width: number, views?: Views) => Screen

/** What an entry drew, and how it was last laid out. */
interface Drawing {
  /** The views of its key that drew it, as they stood; none when binnacle's own did. */
  readonly by: readonly View[] | undefined
  /** What its views returned, its regions scoped to the entry. */
  readonly node: Node
  /** The id of every fold in it, in the order `layout` cuts them. */
  readonly folds: readonly string[]
  /** The id of every region in it, cut or not. */
  readonly regions: readonly string[]
  /** Its last layout: at what width, which of `folds` were open, which region in it had focus, and what it drew. */
  readonly laid?: { readonly width: number, readonly open: readonly boolean[], readonly focus: string | undefined, readonly frame: Frame }
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
 * What scopes the regions an entry draws: its first fact's place in the log, stable as the log is — across a redraw, a change of adapters that reads the log again, and a switch of screens. A tool entry's first fact is its call, which no result of its own replaces.
 * @param entry - the entry.
 * @returns the scope every region it draws is named within.
 */
function scopeOf(entry: Entry): string {
  return String(entry.kind === 'tool' ? entry.call.seq : entry.fact.seq)
}

/**
 * A node with every region id scoped to the entry that drew it, so one name in two entries is two regions, and two views of one entry that name a region alike share what a person did to it.
 * @param node - what the entry's views drew, its regions named within it.
 * @param scope - the entry's scope.
 * @returns the node, its regions named for the whole screen.
 */
function scopedWithin(node: Node, scope: string): Node {
  switch (node.kind) {
    case 'blank':
    case 'text':
    case 'markdown':
      return node
    case 'stack':
      return { ...node, children: node.children.map(child => scopedWithin(child, scope)) }
    case 'offer':
    case 'fold':
      return { ...node, id: `${scope}/${node.id}`, child: scopedWithin(node.child, scope) }
    case 'card':
      return { ...node, child: scopedWithin(node.child, scope) }
  }
}

/**
 * The id of every region in a node, however deep, cut or not: any of them can take focus.
 */
function regionsIn(node: Node): string[] {
  switch (node.kind) {
    case 'blank':
    case 'text':
    case 'markdown':
      return []
    case 'stack':
      return node.children.flatMap(regionsIn)
    case 'offer':
    case 'fold':
      return [node.id, ...regionsIn(node.child)]
    case 'card':
      return regionsIn(node.child)
  }
}

/**
 * A way to draw screens that keeps what each entry drew, its regions scoped to it — one name in two entries is two regions, and a region's state is kept under its scoped id across redraws, adapter changes that read the log again, and switches of screens. An entry is a value
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
      const node = scopedWithin(drawEntry(entry, views), scopeOf(entry))
      drawing = { by, node, folds: foldsIn(node), regions: regionsIn(node) }
    }
    const laid = drawing.laid
    // The layout is kept against all of the state layout reads: the width, which folds are open, and focus, which draws its own row.
    const focus = state.focus !== undefined && drawing.regions.includes(state.focus) ? state.focus : undefined
    if (laid?.width === width && drawing.folds.every((id, index) => state.expanded.has(id) === laid.open[index]) && laid.focus === focus) return laid.frame
    const frame = layout(drawing.node, width, state)
    drawings.set(entry, { ...drawing, laid: { width, open: drawing.folds.map(id => state.expanded.has(id)), focus, frame } })
    return frame
  }
  return (model, state, width, views = new Map()) => {
    const lines: string[] = []
    const regions: Placed[] = []
    const ends: number[] = []
    let opened = false
    for (const turn of model.turns) {
      const turnLines: string[] = []
      const turnRegions: Placed[] = []
      const turnEnds: number[] = []
      for (const entry of turn.entries) {
        const frame = frameOf(entry, state, width, views)
        for (const placed of frame.regions) turnRegions.push({ ...placed, top: placed.top + turnLines.length })
        // One line at a time: spreading an entry's lines into `push` throws once it draws more than about a hundred thousand.
        for (const line of frame.lines) turnLines.push(line)
        turnEnds.push(turnLines.length)
      }
      // A turn whose entries drew nothing — the machinery before the first, a turn of quiet kinds — draws no line at all, not even the blank one that opens a turn.
      if (turnLines.length === 0) {
        for (const end of turnEnds) ends.push(end + lines.length)
        continue
      }
      if (opened) lines.push('')
      opened = true
      for (const placed of turnRegions) regions.push({ ...placed, top: placed.top + lines.length })
      // One line at a time: spreading a turn's lines into `push` throws once it draws more than about a hundred thousand, as an entry's do.
      for (const line of turnLines) lines.push(line)
      for (const end of turnEnds) ends.push(end + lines.length - turnLines.length)
    }
    return { lines, regions, focusable: regions.filter(placed => placed.region.affordances.length > 0).map(placed => placed.region.id), ends }
  }
}

/**
 * Draw the whole transcript at a width, once, each entry's regions scoped to it so their ids name them across the whole screen.
 * @param facts - the session's facts, in log order.
 * @param state - what the person has changed about the screen.
 * @param width - the columns it is given.
 * @param views - authors' views, as `drawEntry` takes them.
 * @returns every line, every region on them, and what can take focus.
 */
export function screen(facts: readonly Fact[], state: UiState, width: number, views: Views = new Map()): Screen {
  return screens()(transcript(facts), state, width, views)
}
