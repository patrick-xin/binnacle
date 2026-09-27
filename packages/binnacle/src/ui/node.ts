/**
 * The nodes a view draws with: data, never a render callback.
 *
 * A view returns a node; the ui lays it out with pi-tui at a width. So a view,
 * built-in or an author's, never holds a pi-tui component, and a change in
 * how pi-tui draws reaches every view at once.
 */

import { affordances, describe } from '../contract/index.ts'
import type { Affordance } from '../contract/index.ts'
import { marks, tones } from './theme.ts'
import type { Mark, Tone } from './theme.ts'

/** One run of a text node's line: its text drawn in the node's tone as a bare string, or in a tone of its own; or one of the theme's marks, whose glyph the theme draws in the mark's tone, or in a tone of the span's own. */
export type Span = string | { readonly text: string, readonly tone: Tone } | { readonly mark: Mark, readonly tone?: Tone }

/** Something a view draws. */
export type Node =
  | {
    readonly kind: 'blank'
  }
  | {
    readonly kind: 'text'
    /** What it says, as one string or as spans, each in a tone; wrapped at the width it is given. */
    readonly text: string | readonly Span[]
    /** The theme's colour it is drawn in; the terminal's own when it has none. */
    readonly tone?: Tone
  }
  | {
    readonly kind: 'markdown'
    /** What it says, as a markdown document laid out by pi-tui's component in the theme's markdown styles. */
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
    readonly kind: 'card'
    /** One line on its top edge, left off whole where the edge is too narrow for it. */
    readonly title?: string
    /** What it holds, inside a rounded border; drawn without one where the width leaves no room inside it. */
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
      const tone = field('tone')
      if (typeof text !== 'string' && !Array.isArray(text)) throw new Error('a text node needs its text')
      if (tone !== undefined && (typeof tone !== 'string' || !Object.hasOwn(tones, tone))) throw new Error(`${describe(tone)} is no tone`)
      const read = typeof text === 'string' ? text : Array.from(text, span => spanOf(span))
      return tone === undefined ? { kind: 'text', text: read } : { kind: 'text', text: read, tone: tone as Tone }
    }
    case 'markdown': {
      const text = field('text')
      if (typeof text !== 'string') throw new Error('a markdown block needs text')
      return { kind: 'markdown', text }
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
    case 'card': {
      const title = field('title')
      if (title !== undefined && typeof title !== 'string') throw new Error(`a card's title is ${describe(title)}`)
      if (typeof title === 'string' && /[\r\n]/.test(title)) throw new Error('a card\'s title is one line')
      const child = parseNode(field('child'))
      return title === undefined ? { kind: 'card', child } : { kind: 'card', title, child }
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
 * Read one span of a text node's line.
 * @param value - the span, as returned.
 * @returns it, as data.
 * @throws when it is neither a bare string, a text with a tone, nor a mark with a tone; when its mark is no mark or its tone is no tone; or when it names a mark and carries text anyway.
 */
function spanOf(value: unknown): Span {
  if (typeof value === 'string') return value
  if (typeof value !== 'object' || value === null) throw new Error(`${describe(value)} is no span`)
  const record = value as Record<string, unknown>
  const tone = 'tone' in record ? record.tone : undefined
  const toned = tone !== undefined && (typeof tone !== 'string' || !Object.hasOwn(tones, tone))
  if ('mark' in record) {
    const mark = record.mark
    if (typeof mark !== 'string' || !Object.hasOwn(marks, mark)) throw new Error(`${describe(mark)} is no mark`)
    if (toned) throw new Error(`${describe(tone)} is no tone`)
    if ('text' in record) throw new Error('a span that names a mark carries no text')
    return tone === undefined ? { mark: mark as Mark } : { mark: mark as Mark, tone: tone as Tone }
  }
  const text = record.text
  if (typeof text !== 'string') throw new Error('a span needs its text')
  if (toned || tone === undefined) throw new Error(`${describe(tone)} is no tone`)
  return { text, tone: tone as Tone }
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
