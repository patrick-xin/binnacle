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
import type { Node, Span } from '../ui/node.ts'
import { binnacleTheme } from '../ui/theme.ts'
import type { Theme } from '../ui/theme.ts'
import type { UiState } from '../ui/state.ts'
import { drawEntry, keyOf } from './entries.ts'
import type { View, Views } from './entries.ts'

/** What the screen draws, and what on it can take focus. */
export interface Screen extends Frame {
  /** The regions that offer something, in screen order. */
  readonly focusable: readonly string[]
  /** Whether any entry drew the time since a moment, so a later time draws it again. */
  readonly timed: boolean
  /** For each entry, in log order across turns, the line after its last; the blank line between two entries that draw something is neither's own. An entry that drew nothing ends where the one before it did, and a run of entries that drew nothing draws no line at all, not even a blank one. */
  readonly ends: readonly number[]
}

/** Draws one screen after another from the same session. */
export type DrawScreen = (model: Transcript, state: UiState, width: number, views?: Views, theme?: Theme, now?: number) => Screen

/** What an entry drew, and how it was last laid out. */
interface Drawing {
  /** The views of its key that drew it, as they stood; none when binnacle's own did. */
  readonly by: readonly View[] | undefined
  /** The theme its views' nodes were read against: a name one theme gives, another may not. */
  readonly theme: Theme
  /** What its views returned, its regions scoped to the entry. */
  readonly node: Node
  /** The id of every fold in it, in the order `layout` cuts them. */
  readonly folds: readonly string[]
  /** The id of every region in it, cut or not. */
  readonly regions: readonly string[]
  /** Whether it draws the time since a moment, so its layout is kept against the time too. */
  readonly timed: boolean
  /** Its last layout: at what width, in which theme, which of `folds` were open, which region in it had focus, and what it drew. */
  readonly laid?: { readonly width: number, readonly theme: Theme, readonly open: readonly boolean[], readonly focus: string | undefined, readonly now: number | undefined, readonly frame: Frame }
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
    case 'band':
      return foldsIn(node.child)
    case 'fold':
      return [node.id, ...foldsIn(node.child)]
  }
}

/**
 * What scopes the regions an entry draws: its first fact's place in the log, stable as the log is — across a redraw, a change of adapters that reads the log again, and a switch of screens. A tool entry's first fact is its call, which no result of its own replaces, an approval entry's its ask, which no decision replaces, and a command entry's its run, which no done replaces.
 * @param entry - the entry.
 * @returns the scope every region it draws is named within.
 */
function scopeOf(entry: Entry): string {
  return String(entry.kind === 'tool' ? entry.call.seq : entry.kind === 'approval' ? entry.asked.seq : entry.kind === 'command' ? entry.run.seq : entry.fact.seq)
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
    case 'band':
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
    case 'band':
      return regionsIn(node.child)
  }
}

/**
 * A way to draw screens that keeps what each entry drew, its regions scoped to it — one name in two entries is two regions, and a region's state is kept under its scoped id across redraws, adapter changes that read the log again, and switches of screens. An entry is a value
 * the transcript replaces when it changes, so what it drew is kept against
 * the entry itself, and against the views of its key, which are replaced as
 * a whole when one is registered, disposed or invalidated; the layout is kept
 * against the width and against which of its folds are open, which is all of
 * the state layout reads, and against the theme, which is replaced as a whole
 * when a theme registration comes or goes.
 * @returns the drawer, holding nothing yet.
 */
export function screens(): DrawScreen {
  const drawings = new WeakMap<Entry, Drawing>()
  const frameOf = (entry: Entry, state: UiState, width: number, views: Views, theme: Theme, now: number | undefined): Frame => {
    const by = views.get(keyOf(entry))
    let drawing = drawings.get(entry)
    if (drawing === undefined || drawing.by !== by || drawing.theme !== theme) {
      const node = scopedWithin(drawEntry(entry, views, theme), scopeOf(entry))
      drawing = { by, theme, node, folds: foldsIn(node), regions: regionsIn(node), timed: timedIn(node) }
    }
    const laid = drawing.laid
    // The layout is kept against all of the state layout reads: the width, which folds are open, and focus, which draws its own row.
    const focus = state.focus !== undefined && drawing.regions.includes(state.focus) ? state.focus : undefined
    // An entry that draws the time since a moment is kept against the time too; every other one is laid out once for all times.
    if (laid?.width === width && laid.theme === theme && drawing.folds.every((id, index) => state.toggled.has(id) === laid.open[index]) && laid.focus === focus && (!drawing.timed || laid.now === now)) return laid.frame
    // How its folds start is the theme's for its key, then for its kind; the theme is what the layout is kept against, so this needs no key of its own.
    const starts = theme.folds[keyOf(entry)] ?? theme.folds[entry.kind]
    const frame = layout(drawing.node, width, { ...state, ...starts === undefined ? {} : { folds: starts }, ...now === undefined ? {} : { now } }, theme)
    drawings.set(entry, { ...drawing, laid: { width, theme, open: drawing.folds.map(id => state.toggled.has(id)), focus, now, frame } })
    return frame
  }
  return (model, state, width, views = new Map(), theme = binnacleTheme, now = undefined) => {
    const lines: string[] = []
    const regions: Placed[] = []
    const ends: number[] = []
    let drew = false
    let timed = false
    for (const turn of model.turns) {
      for (const entry of turn.entries) {
        const frame = frameOf(entry, state, width, views, theme, now)
        timed = timed || drawings.get(entry)?.timed === true
        // One blank line separates two entries that draw something, whichever turns they sit in — so a turn's gap falls before its prompt, the first entry it drew. An entry that draws nothing takes none, and a turn every entry of which drew nothing draws no line at all.
        const draws = frame.lines.length > 0
        if (draws && drew) lines.push('')
        drew = drew || draws
        const top = lines.length
        for (const placed of frame.regions) regions.push({ ...placed, top: placed.top + top })
        // One line at a time: spreading an entry's lines into `push` throws once it draws more than about a hundred thousand.
        for (const line of frame.lines) lines.push(line)
        ends.push(lines.length)
      }
    }
    return { lines, regions, focusable: regions.filter(placed => placed.region.affordances.length > 0).map(placed => placed.region.id), ends, timed }
  }
}

/**
 * Whether a line's spans say the time since a moment.
 * @param text - a text node's text, or a fold's title.
 * @returns true when a span of it does.
 */
function timedSpans(text: string | readonly Span[] | undefined): boolean {
  return typeof text === 'object' && text.some(span => typeof span === 'object' && 'since' in span)
}

/**
 * Whether a node draws the time since a moment anywhere in it: what a pane keeps a layout for against the time,
 * so a later one lays it out again.
 * @param node - the node.
 * @returns true when a span of it, or of anything it holds, says the time since a moment.
 */
export function timedIn(node: Node): boolean {
  switch (node.kind) {
    case 'blank':
    case 'markdown':
      return false
    case 'text':
      return timedSpans(node.text)
    case 'stack':
      return node.children.some(timedIn)
    case 'offer':
    case 'card':
    case 'band':
      return timedIn(node.child)
    case 'fold':
      return timedSpans(node.title) || timedIn(node.child)
  }
}

/**
 * Draw the whole transcript at a width, once, each entry's regions scoped to it so their ids name them across the whole screen.
 * @param facts - the session's facts, in log order.
 * @param state - what the person has changed about the screen.
 * @param width - the columns it is given.
 * @param views - authors' views, as `drawEntry` takes them.
 * @param theme - the theme it is drawn in.
 * @returns every line, every region on them, and what can take focus.
 */
export function screen(facts: readonly Fact[], state: UiState, width: number, views: Views = new Map(), theme: Theme = binnacleTheme): Screen {
  return screens()(transcript(facts), state, width, views, theme)
}
