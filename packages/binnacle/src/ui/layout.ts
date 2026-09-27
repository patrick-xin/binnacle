/**
 * Layout: a node at a width, as the lines it draws and the regions on them.
 */

import { Markdown, Text, visibleWidth } from '@earendil-works/pi-tui'
import type { Region } from '../contract/index.ts'
import type { Node } from './node.ts'
import { markdownTheme, tones } from './theme.ts'

/** UI state layout reads: which collapsible regions are open, and which region has focus. */
export interface LayoutState {
  /** The ids of the regions a person expanded. */
  readonly expanded: ReadonlySet<string>
  /** The id of the focused region, if any. */
  readonly focus?: string
}

/** A region, and the rows and columns it covers. */
export interface Placed {
  /** The region. */
  readonly region: Region
  /** Its first row. */
  readonly top: number
  /** How many rows it covers. */
  readonly height: number
  /** Its first column. */
  readonly left: number
  /** How many columns it covers. */
  readonly width: number
}

/** Columns a card spends on each side: its border, and a column of air inside it. */
const CARD_SIDE = 2

/** What a node draws: its lines, and every region on them, outermost first. */
export interface Frame {
  /** Each line, styled for the terminal. */
  readonly lines: readonly string[]
  /** Every region, outermost first. */
  readonly regions: readonly Placed[]
}

/**
 * The word for a count of lines.
 * @param count - how many.
 * @returns `line` for one, `lines` otherwise.
 */
function line(count: number): string {
  return count === 1 ? 'line' : 'lines'
}

/**
 * The row a focused region draws under it: `▸` and what Enter will do, in accent.
 * @param label - the primary affordance's label, which says what Enter will do.
 * @param width - the columns it is given.
 * @returns the row, wrapped as text is.
 */
function focusRow(label: string, width: number): string[] {
  return new Text(tones.accent(`▸ ${label}`), 0, 0).render(width)
}

/**
 * What a text node's spans draw: joined into one line, each span in its tone, a bare span in the node's.
 * @param node - the text node.
 * @returns its line, styled for the terminal.
 */
function written(node: Extract<Node, { readonly kind: 'text' }>): string {
  if (typeof node.text === 'string') return node.tone === undefined ? node.text : tones[node.tone](node.text)
  return node.text
    .map(span => typeof span === 'string'
      ? node.tone === undefined ? span : tones[node.tone](span)
      : tones[span.tone](span.text))
    .join('')
}

/**
 * Lay a node out.
 * @param node - what to draw.
 * @param width - the columns it is given.
 * @param state - the UI state it is drawn in.
 * @returns its lines and regions.
 */
export function layout(node: Node, width: number, state: LayoutState): Frame {
  switch (node.kind) {
    case 'blank':
      return { lines: [''], regions: [] }
    case 'text':
      // pi-tui wraps styled text, opening each line it wraps to in the style the line before ended in.
      return { lines: new Text(written(node), 0, 0).render(width), regions: [] }
    case 'markdown':
      // pi-tui lays a document out, in the theme's markdown styles; it offers nothing.
      return { lines: new Markdown(node.text, 0, 0, markdownTheme).render(width), regions: [] }
    case 'stack': {
      const lines: string[] = []
      const regions: Placed[] = []
      for (const child of node.children) {
        const frame = layout(child, width, state)
        regions.push(...frame.regions.map(placed => ({ ...placed, top: placed.top + lines.length })))
        lines.push(...frame.lines)
      }
      return { lines, regions }
    }
    case 'offer': {
      const frame = layout(node.child, width, state)
      const region = { id: node.id, affordances: node.affordances, overflows: false }
      const placed = { region, top: 0, height: frame.lines.length, left: 0, width }
      const primary = node.affordances[0]
      if (state.focus !== node.id || primary === undefined) return { lines: frame.lines, regions: [placed, ...frame.regions] }
      const row = focusRow(primary.label, width)
      return { lines: [...frame.lines, ...row], regions: [{ ...placed, height: frame.lines.length + row.length }, ...frame.regions] }
    }
    case 'card':
      return card(node, width, state)
    case 'fold': {
      const frame = layout(node.child, width, state)
      const cut = frame.lines.length - node.rows
      if (cut <= 0) return frame
      if (state.expanded.has(node.id)) {
        const label = node.rows === 0 ? 'fold it away' : `fold to ${node.rows} ${line(node.rows)}`
        const region = { id: node.id, affordances: [{ kind: 'expand' as const, label }], overflows: false }
        if (state.focus !== node.id) return { lines: frame.lines, regions: [{ region, top: 0, height: frame.lines.length, left: 0, width }, ...frame.regions] }
        const row = focusRow(label, width)
        return { lines: [...frame.lines, ...row], regions: [{ region, top: 0, height: frame.lines.length + row.length, left: 0, width }, ...frame.regions] }
      }
      const shown = frame.lines.slice(0, node.rows)
      const label = `show ${cut} more ${line(cut)}`
      // The marker row a focused cut fold draws is the accent row saying what Enter will do, so focusing it moves nothing.
      const marker = new Text(state.focus === node.id ? tones.accent(`▸ ${label}`) : `… ${cut} more ${line(cut)}`, 0, 0).render(width)
      const region = { id: node.id, affordances: [{ kind: 'expand' as const, label }], overflows: false }
      const inside = frame.regions
        .filter(placed => placed.top < node.rows)
        .map(placed => ({ ...placed, height: Math.min(placed.height, node.rows - placed.top) }))
      return { lines: [...shown, ...marker], regions: [{ region, top: 0, height: node.rows + marker.length, left: 0, width }, ...inside] }
    }
  }
}

/**
 * Lay a card out: what it holds, inside a rounded border drawn in the theme's dim tone.
 * @returns its lines, and what it holds's regions moved inside the border; what it holds alone where the width leaves no column inside.
 */
function card(node: Extract<Node, { readonly kind: 'card' }>, width: number, state: LayoutState): Frame {
  const inner = width - 2 * CARD_SIDE
  if (inner < 1) return layout(node.child, width, state)
  const frame = layout(node.child, inner, state)
  const edge = tones.dim
  // A title is left off whole, never cut, where it would leave no rule beside it: a cut title reads as another one.
  const title = node.title !== undefined && visibleWidth(node.title) <= width - 6 ? node.title : undefined
  const top = title === undefined
    ? edge(`╭${'─'.repeat(width - 2)}╮`)
    : `${edge('╭─ ')}${title}${edge(` ${'─'.repeat(width - 5 - visibleWidth(title))}╮`)}`
  const body = frame.lines.map(row => `${edge('│')} ${row}${' '.repeat(Math.max(0, inner - visibleWidth(row)))} ${edge('│')}`)
  return {
    lines: [top, ...body, edge(`╰${'─'.repeat(width - 2)}╯`)],
    regions: frame.regions.map(placed => ({ ...placed, top: placed.top + 1, left: placed.left + CARD_SIDE })),
  }
}

/**
 * The regions a point lands on.
 * @param regions - a frame's regions, outermost first.
 * @param row - the point's row, in the frame's lines.
 * @param column - the point's column, from the frame's left edge.
 * @returns the regions covering it, innermost first.
 */
export function under(regions: readonly Placed[], row: number, column: number): Region[] {
  return regions
    .filter(placed => row >= placed.top && row < placed.top + placed.height && column >= placed.left && column < placed.left + placed.width)
    .map(placed => placed.region)
    .toReversed()
}
