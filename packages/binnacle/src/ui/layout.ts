/**
 * Layout: a node at a width, as the lines it draws and the regions on them.
 */

import { Text } from '@earendil-works/pi-tui'
import type { Region } from '../contract/index.ts'
import type { Node } from './node.ts'

/** UI state layout reads: which collapsible regions are open. */
export interface LayoutState {
  /** The ids of the regions a person expanded. */
  readonly expanded: ReadonlySet<string>
}

/** A region, and the rows it covers. */
export interface Placed {
  /** The region. */
  readonly region: Region
  /** Its first row. */
  readonly top: number
  /** How many rows it covers. */
  readonly height: number
}

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
      return { lines: new Text(node.text, 0, 0).render(width), regions: [] }
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
      return { lines: frame.lines, regions: [{ region, top: 0, height: frame.lines.length }, ...frame.regions] }
    }
    case 'fold': {
      const frame = layout(node.child, width, state)
      const cut = frame.lines.length - node.rows
      if (cut <= 0) return frame
      if (state.expanded.has(node.id)) {
        const label = node.rows === 0 ? 'fold it away' : `fold to ${node.rows} ${line(node.rows)}`
        const region = { id: node.id, affordances: [{ kind: 'expand' as const, label }], overflows: false }
        return { lines: frame.lines, regions: [{ region, top: 0, height: frame.lines.length }, ...frame.regions] }
      }
      const shown = frame.lines.slice(0, node.rows)
      const marker = new Text(`… ${cut} more ${line(cut)}`, 0, 0).render(width)
      const region = { id: node.id, affordances: [{ kind: 'expand' as const, label: `show ${cut} more ${line(cut)}` }], overflows: false }
      const inside = frame.regions
        .filter(placed => placed.top < node.rows)
        .map(placed => ({ ...placed, height: Math.min(placed.height, node.rows - placed.top) }))
      return { lines: [...shown, ...marker], regions: [{ region, top: 0, height: node.rows + marker.length }, ...inside] }
    }
  }
}

/**
 * The regions a row lands on.
 * @param regions - a frame's regions, outermost first.
 * @returns the regions covering it, innermost first.
 */
export function under(regions: readonly Placed[], row: number): Region[] {
  return regions.filter(placed => row >= placed.top && row < placed.top + placed.height).map(placed => placed.region).toReversed()
}
