import { affordances, describe } from '../contract/index.ts'
import type { Affordance } from '../contract/index.ts'

import { binnacleTheme } from './theme.ts'
import type { Background, Mark, Theme, Tone } from './theme.ts'

/** One run of a text node's line: its text drawn in the node's tone as a bare string, or in a tone of its own; or one of the theme's marks, whose glyph the theme draws in the mark's tone, or in a tone of the span's own. */
export type Span =
  | string
  | { readonly text: string, readonly tone: Tone }
  | { readonly mark: Mark, readonly tone?: Tone }
  /** The time since a moment, in milliseconds since the epoch, as dsh logs a fact's time: `4s`, `1m 05s`, `1h 02m`, laid out at the time the host hands layout, so a view drawing it stays a function of its entry. */
  | { readonly since: number, readonly tone?: Tone }

/**
 * Something a view draws: data, never a render callback. The ui lays it out
 * with pi-tui at a width, so a view, built-in or an author's, never holds a
 * pi-tui component, and a change in how pi-tui draws reaches every view at once.
 */
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
    /** The region's name within the entry this view draws; binnacle scopes it to that entry, stable while its content is on screen. */
    readonly id: string
    /** What the content offers, primary first. */
    readonly affordances: readonly Affordance[]
    /** The content. */
    readonly child: Node
  }
  | {
    readonly kind: 'ask'
    /** One line on its top edge, left off whole where the edge is too narrow for it. */
    readonly title?: string
    /** The theme's background every line of it is filled with, border included; the terminal's own when absent. */
    readonly background?: Background
    /** The theme's tone its border is drawn in; dim when absent. */
    readonly edge?: Tone
    /** What it holds, inside a rounded border; drawn without one where the width leaves no room inside it. */
    readonly child: Node
  }
  | {
    readonly kind: 'show'
    /** The line above what it holds, saying what is shown: a call's name and what it was asked, a document's title. */
    readonly title: readonly Span[]
    /** The theme's tone the title is drawn in; the terminal's own when it has none. */
    readonly tone?: Tone
    /** What is shown, drawn beneath the title along the theme's gutter, which marks it as what the surface shows and did not write. */
    readonly child: Node
  }
  | {
    readonly kind: 'band'
    /** The theme's background the band is filled with, named by what the content it holds means, as a view names a tone or a mark. */
    readonly background: Background
    /** What it holds, padded within the band. */
    readonly child: Node
  }
  | {
    readonly kind: 'fold'
    /** The region's name within the entry this view draws; binnacle scopes it to that entry, so what `expand` opens and folds is this fold's alone. */
    readonly id: string
    /** The line it folds under, drawn above what it holds: while the fold shows no rows its marker rides this line — `title · N lines` — so the fold costs that one line alone. */
    readonly title?: readonly Span[]
    /** The theme's colour the title is drawn in; the terminal's own when it has none. */
    readonly tone?: Tone
    /** How many rows it shows while folded; when absent, what the theme gives the kind of entry it is drawn in, or three. */
    readonly rows?: number
    /** The content. */
    readonly child: Node
  }
  | {
    readonly kind: 'part'
    /** Which part it is, and what it draws from: drawn by the views of its kind, the newest first, each handed it and what the one beneath draws. */
    readonly part: Part
    /** How binnacle draws it, beneath every view of its kind. */
    readonly child: Node
  }

/** A part of an entry a person names, and what it draws from: the answer's thinking, or what a tool returned. */
export type Part =
  | {
    readonly kind: 'thinking'
    /** The reasoning, as the model wrote it. */
    readonly text: string
  }
  | {
    readonly kind: 'output'
    /** The tool that returned it. */
    readonly tool: string
    /** What it returned, as text. */
    readonly text: string
  }

export function parseNode(value: unknown, theme: Theme = binnacleTheme): Node {
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
      if (tone !== undefined && (typeof tone !== 'string' || !Object.hasOwn(theme.tones, tone))) throw new Error(`${describe(tone)} is no tone`)
      const read = typeof text === 'string' ? text : Array.from(text, span => spanOf(span, theme))
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
      return { kind: 'stack', children: Array.from(children, child => parseNode(child, theme)) }
    }
    case 'offer': {
      const id = field('id')
      const offered = field('affordances')
      if (typeof id !== 'string') throw new Error('an offer needs an id')
      if (!Array.isArray(offered)) throw new Error('an offer needs its affordances')
      return { kind: 'offer', id, affordances: Array.from(offered, affordance => affordanceOf(affordance)), child: parseNode(field('child'), theme) }
    }
    case 'ask': {
      const title = field('title')
      if (title !== undefined && typeof title !== 'string') throw new Error(`an ask's title is ${describe(title)}`)
      if (typeof title === 'string' && /[\r\n]/.test(title)) throw new Error('an ask\'s title is one line')
      const background = field('background')
      const edge = field('edge')
      if (background !== undefined && (typeof background !== 'string' || !Object.hasOwn(theme.backgrounds, background))) throw new Error(`${describe(background)} is no background`)
      if (edge !== undefined && (typeof edge !== 'string' || !Object.hasOwn(theme.tones, edge))) throw new Error(`${describe(edge)} is no tone`)
      const child = parseNode(field('child'), theme)
      return {
        kind: 'ask',
        ...title === undefined ? {} : { title },
        ...background === undefined ? {} : { background: background as Background },
        ...edge === undefined ? {} : { edge: edge as Tone },
        child,
      }
    }
    case 'show': {
      const title = field('title')
      const tone = field('tone')
      if (!Array.isArray(title)) throw new Error(`a show's title is ${describe(title)}`)
      if (tone !== undefined && (typeof tone !== 'string' || !Object.hasOwn(theme.tones, tone))) throw new Error(`${describe(tone)} is no tone`)
      const read = Array.from(title, span => spanOf(span, theme))
      const child = parseNode(field('child'), theme)
      return tone === undefined ? { kind: 'show', title: read, child } : { kind: 'show', title: read, tone: tone as Tone, child }
    }
    case 'band': {
      const background = field('background')
      if (typeof background !== 'string' || !Object.hasOwn(theme.backgrounds, background)) throw new Error(`${describe(background)} is no background`)
      return { kind: 'band', background: background as Background, child: parseNode(field('child'), theme) }
    }
    case 'fold': {
      const id = field('id')
      const title = field('title')
      const tone = field('tone')
      const rows = field('rows')
      if (typeof id !== 'string') throw new Error('a fold needs an id')
      if (title !== undefined && !Array.isArray(title)) throw new Error(`a fold's title is ${describe(title)}`)
      if (tone !== undefined && (typeof tone !== 'string' || !Object.hasOwn(theme.tones, tone))) throw new Error(`${describe(tone)} is no tone`)
      if (rows !== undefined && (typeof rows !== 'number' || !Number.isInteger(rows) || rows < 0)) throw new Error(`a fold's rows are ${describe(rows)}`)
      const fold: { kind: 'fold', id: string, title?: readonly Span[], tone?: Tone, rows?: number, child: Node } = { kind: 'fold', id, ...rows === undefined ? {} : { rows }, child: parseNode(field('child'), theme) }
      if (title !== undefined) fold.title = Array.from(title, span => spanOf(span, theme))
      if (tone !== undefined) fold.tone = tone as Tone
      return fold
    }
    case 'part':
      return { kind: 'part', part: partOf(field('part')), child: parseNode(field('child'), theme) }
    default:
      throw new Error(`${describe(kind)} is no kind of node`)
  }
}

function partOf(value: unknown): Part {
  if (typeof value !== 'object' || value === null) throw new Error(`${describe(value)} is no part`)
  const field = (name: string): unknown => (value as Record<string, unknown>)[name]
  const text = field('text')
  if (typeof text !== 'string') throw new Error(`a part's text is ${describe(text)}`)
  if (field('kind') === 'thinking') return { kind: 'thinking', text }
  const tool = field('tool')
  if (field('kind') === 'output') {
    if (typeof tool !== 'string') throw new Error(`an output part's tool is ${describe(tool)}`)
    return { kind: 'output', tool, text }
  }
  throw new Error(`${describe(field('kind'))} is no part`)
}

function spanOf(value: unknown, theme: Theme): Span {
  if (typeof value === 'string') return value
  if (typeof value !== 'object' || value === null) throw new Error(`${describe(value)} is no span`)
  const record = value as Record<string, unknown>
  const tone = 'tone' in record ? record.tone : undefined
  const toned = tone !== undefined && (typeof tone !== 'string' || !Object.hasOwn(theme.tones, tone))
  if ('since' in record) {
    const since = record.since
    if (typeof since !== 'number' || !Number.isFinite(since)) throw new Error(`${describe(since)} is no moment`)
    if (toned) throw new Error(`${describe(tone)} is no tone`)
    if ('text' in record || 'mark' in record) throw new Error('a span that says the time since a moment carries no text and no mark')
    return tone === undefined ? { since } : { since, tone: tone as Tone }
  }
  if ('mark' in record) {
    const mark = record.mark
    if (typeof mark !== 'string' || !Object.hasOwn(theme.marks, mark)) throw new Error(`${describe(mark)} is no mark`)
    if (toned) throw new Error(`${describe(tone)} is no tone`)
    if ('text' in record) throw new Error('a span that names a mark carries no text')
    return tone === undefined ? { mark: mark as Mark } : { mark: mark as Mark, tone: tone as Tone }
  }
  const text = record.text
  if (typeof text !== 'string') throw new Error('a span needs its text')
  if (toned || tone === undefined) throw new Error(`${describe(tone)} is no tone`)
  return { text, tone: tone as Tone }
}

function affordanceOf(value: unknown): Affordance {
  const kind: unknown = typeof value === 'object' && value !== null && 'kind' in value ? value.kind : undefined
  const label: unknown = typeof value === 'object' && value !== null && 'label' in value ? value.label : undefined
  if (typeof kind !== 'string' || !Object.hasOwn(affordances, kind)) throw new Error(`${describe(kind)} is no affordance`)
  if (label !== undefined && typeof label !== 'string') throw new Error(`an affordance's label is ${describe(label)}`)
  return label === undefined ? { kind: kind as Affordance['kind'] } : { kind: kind as Affordance['kind'], label }
}
