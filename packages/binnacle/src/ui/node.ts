/**
 * The nodes a view draws with: data, never a render callback.
 *
 * A view returns a node; the ui lays it out with pi-tui at a width. So a view,
 * built-in or an author's, never holds a pi-tui component, and a change in
 * how pi-tui draws reaches every view at once.
 */

import { affordances, describe } from '../contract/index.ts'
import type { Affordance } from '../contract/index.ts'

/** Something a view draws. */
export type Node =
  | {
    readonly kind: 'blank'
  }
  | {
    readonly kind: 'text'
    /** What it says; wrapped at the width it is given. */
    readonly text: string
  }
  | {
    readonly kind: 'stack'
    /** What it draws, top to bottom. */
    readonly children: readonly Node[]
  }
  | {
    readonly kind: 'offer'
    /** The region's id; stable while its content is on screen. */
    readonly id: string
    /** What the content offers, primary first. */
    readonly affordances: readonly Affordance[]
    /** The content. */
    readonly child: Node
  }
  | {
    readonly kind: 'fold'
    /** The region's id; what `expand` opens and folds. */
    readonly id: string
    /** How many rows it shows while folded. */
    readonly rows: number
    /** The content. */
    readonly child: Node
  }

/**
 * Read a node from code binnacle does not own, copying it into fresh data so nothing of it runs later.
 * @param value - what an author's view returned.
 * @returns the node, as data.
 * @throws an error saying what is wrong with it, or whatever reading it threw.
 */
export function parseNode(value: unknown): Node {
  if (typeof value !== 'object' || value === null) throw new Error(`it is ${value === null ? 'null' : typeof value}`)
  const kind = 'kind' in value ? value.kind : undefined
  const field = (name: string): unknown => name in value ? (value as Record<string, unknown>)[name] : undefined
  switch (kind) {
    case 'blank':
      return { kind: 'blank' }
    case 'text': {
      const text = field('text')
      if (typeof text !== 'string') throw new Error('a text node needs its text')
      return { kind: 'text', text }
    }
    case 'stack': {
      const children = field('children')
      if (!Array.isArray(children)) throw new Error('a stack needs its children')
      return { kind: 'stack', children: Array.from(children, child => parseNode(child)) }
    }
    case 'offer': {
      const id = field('id')
      const offered = field('affordances')
      if (typeof id !== 'string') throw new Error('an offer needs an id')
      if (!Array.isArray(offered)) throw new Error('an offer needs its affordances')
      return { kind: 'offer', id, affordances: Array.from(offered, affordance => affordanceOf(affordance)), child: parseNode(field('child')) }
    }
    case 'fold': {
      const id = field('id')
      const rows = field('rows')
      if (typeof id !== 'string') throw new Error('a fold needs an id')
      if (typeof rows !== 'number' || !Number.isInteger(rows) || rows < 0) throw new Error(`a fold's rows are ${describe(rows)}`)
      return { kind: 'fold', id, rows, child: parseNode(field('child')) }
    }
    default:
      throw new Error(`${describe(kind)} is no kind of node`)
  }
}

/**
 * Read one affordance an author's offer declares.
 * @param value - the affordance, as returned.
 * @returns it, as data.
 * @throws when its kind is not one binnacle knows, or it has no label.
 */
function affordanceOf(value: unknown): Affordance {
  const kind: unknown = typeof value === 'object' && value !== null && 'kind' in value ? value.kind : undefined
  const label: unknown = typeof value === 'object' && value !== null && 'label' in value ? value.label : undefined
  if (typeof kind !== 'string' || !Object.hasOwn(affordances, kind)) throw new Error(`${describe(kind)} is no affordance`)
  if (typeof label !== 'string') throw new Error('an affordance needs a label')
  return { kind: kind as Affordance['kind'], label }
}
