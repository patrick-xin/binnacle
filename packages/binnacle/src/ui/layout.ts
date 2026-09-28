/**
 * Layout: a node at a width, as the lines it draws and the regions on them.
 */

import { Box, Markdown, Text, visibleWidth } from '@earendil-works/pi-tui'
import type { Region } from '../contract/index.ts'
import type { Node, Span } from './node.ts'
import { readable } from './readable.ts'
import { backgrounds, chrome, markdownTheme, marks, tones, words } from './theme.ts'
import type { Tone } from './theme.ts'

/** UI state layout reads: which collapsible regions are open, and which region has focus. */
export interface LayoutState {
  /** The ids of the regions a person expanded, each scoped to the entry that drew it. */
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

/** What a band pads around what it holds, in columns each side and lines above and below: as pi pads a person's message (`pi:packages/coding-agent/src/modes/interactive/components/user-message.ts#UserMessageComponent`). */
const BAND_PAD = 1

/** What a node draws: its lines, and every region on them, outermost first. */
export interface Frame {
  /** Each line, styled for the terminal. */
  readonly lines: readonly string[]
  /** Every region, outermost first. */
  readonly regions: readonly Placed[]
}

/**
 * The row a focused region draws under it: the chrome's focus pointer and what Enter will do, in accent.
 * @param label - the primary affordance's label, which says what Enter will do.
 * @param width - the columns it is given.
 * @returns the row, wrapped as text is.
 */
function focusRow(label: string, width: number): string[] {
  return new Text(tones.accent(`${chrome.focus} ${label}`), 0, 0).render(width)
}

/**
 * What a text node's spans draw: joined into one line, each span in its tone,
 * a bare span in the node's, a mark's glyph in the mark's tone or the span's
 * own — and adjacent runs in one tone drawn as one, so a line all in one tone
 * is the one styled run it always was.
 * @param node - the text node.
 * @returns its line, styled for the terminal.
 */
function written(node: Extract<Node, { readonly kind: 'text' }>): string {
  if (typeof node.text === 'string') return node.tone === undefined ? node.text : tones[node.tone](node.text)
  const runs: { text: string, tone: Tone | undefined }[] = []
  for (const span of node.text) {
    const run = typeof span === 'string'
      ? { text: span, tone: node.tone }
      : 'mark' in span
        ? { text: marks[span.mark].glyph, tone: span.tone ?? marks[span.mark].tone }
        : { text: span.text, tone: span.tone }
    const last = runs.at(-1)
    if (last !== undefined && last.tone === run.tone) last.text += run.text
    else runs.push(run)
  }
  return runs.map(run => run.tone === undefined ? run.text : tones[run.tone](run.text)).join('')
}

/**
 * The line a fold's title draws: its spans joined as a text node's line is,
 * a bare span and the fold's marker in the fold's tone.
 * @param spans - the title's spans, and any marker riding them.
 * @param tone - the fold's tone, if it has one.
 * @returns the line, styled for the terminal.
 */
function titleLine(spans: readonly Span[], tone: Tone | undefined): string {
  return written(tone === undefined ? { kind: 'text', text: spans } : { kind: 'text', text: spans, tone })
}

/**
 * Lay a node out: every string it carries is treated first, so none of it
 * reaches the terminal as a control.
 * @param node - what to draw.
 * @param width - the columns it is given.
 * @param state - the UI state it is drawn in.
 * @returns its lines and regions.
 */
export function layout(node: Node, width: number, state: LayoutState): Frame {
  return drawn(readable(node), width, state)
}

/**
 * Lay out a node whose carried strings are already treated.
 * @param node - what to draw, already treated.
 * @param width - the columns it is given.
 * @param state - the UI state it is drawn in.
 * @returns its lines and regions.
 */
function drawn(node: Node, width: number, state: LayoutState): Frame {
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
        const frame = drawn(child, width, state)
        regions.push(...frame.regions.map(placed => ({ ...placed, top: placed.top + lines.length })))
        lines.push(...frame.lines)
      }
      return { lines, regions }
    }
    case 'offer': {
      const frame = drawn(node.child, width, state)
      const region = { id: node.id, affordances: node.affordances, overflows: false }
      const placed = { region, top: 0, height: frame.lines.length, left: 0, width }
      const primary = node.affordances[0]
      if (state.focus !== node.id || primary === undefined) return { lines: frame.lines, regions: [placed, ...frame.regions] }
      const row = focusRow(primary.label, width)
      return { lines: [...frame.lines, ...row], regions: [{ ...placed, height: frame.lines.length + row.length }, ...frame.regions] }
    }
    case 'card':
      return card(node, width, state)
    case 'band':
      return band(node, width, state)
    case 'fold': {
      const frame = drawn(node.child, width, state)
      const cut = frame.lines.length - node.rows
      // The line the fold names to fold under, laid out as a text node's line in the fold's tone; a fold of no
      // rows answers on it alone, and its marker rides it — what it holds while closed, that it can be folded open.
      const foldsUnder = node.rows === 0 ? node.title : undefined
      const title = node.title === undefined ? [] : new Text(titleLine(node.title, node.tone), 0, 0).render(width)
      const below = frame.regions.map(placed => ({ ...placed, top: placed.top + title.length }))
      if (cut <= 0) return { lines: [...title, ...frame.lines], regions: below }
      const label = words.show(cut)
      const region = { id: node.id, affordances: [{ kind: 'expand' as const, label }], overflows: false }
      if (state.expanded.has(node.id)) {
        const away = node.rows === 0 ? words.away : words.to(node.rows)
        const open = { id: node.id, affordances: [{ kind: 'expand' as const, label: away }], overflows: false }
        const heading = foldsUnder === undefined ? title : new Text(titleLine([...foldsUnder, ` ${chrome.separator} ${words.less}`], node.tone), 0, 0).render(width)
        const lines = [...heading, ...frame.lines]
        const placed = { region: open, top: 0, height: foldsUnder === undefined ? lines.length : heading.length, left: 0, width }
        if (state.focus !== node.id) return { lines, regions: [placed, ...below] }
        const row = focusRow(away, width)
        return { lines: [...lines, ...row], regions: [{ ...placed, height: foldsUnder === undefined ? lines.length + row.length : heading.length }, ...below] }
      }
      if (foldsUnder !== undefined) {
        // Folded to nothing under its title, the marker rides the title's line, so the fold costs one line; focused,
        // that line is the accent row saying what Enter will do, so focusing it moves nothing.
        const marker = state.focus === node.id
          ? focusRow(label, width)
          : new Text(titleLine([...foldsUnder, ` ${chrome.separator} ${words.holds(cut)}`], node.tone), 0, 0).render(width)
        return { lines: marker, regions: [{ region, top: 0, height: marker.length, left: 0, width }] }
      }
      const shown = frame.lines.slice(0, node.rows)
      // The marker row a focused cut fold draws is the accent row saying what Enter will do, so focusing it moves nothing.
      const marker = new Text(state.focus === node.id ? tones.accent(`${chrome.focus} ${label}`) : `${chrome.cut} ${words.cut(cut)}`, 0, 0).render(width)
      const lines = [...title, ...shown, ...marker]
      const inside = frame.regions
        .filter(placed => placed.top < node.rows)
        .map(placed => ({ ...placed, top: placed.top + title.length, height: Math.min(placed.height, node.rows - placed.top) }))
      return { lines, regions: [{ region, top: 0, height: lines.length, left: 0, width }, ...inside] }
    }
  }
}

/**
 * Lay a card out: what it holds, inside a rounded border drawn in the theme's dim tone.
 * @returns its lines, and what it holds's regions moved inside the border; what it holds alone where the width leaves no column inside.
 */
function card(node: Extract<Node, { readonly kind: 'card' }>, width: number, state: LayoutState): Frame {
  const inner = width - 2 * CARD_SIDE
  if (inner < 1) return drawn(node.child, width, state)
  const frame = drawn(node.child, inner, state)
  const edge = tones.dim
  const border = chrome.border
  // A title is left off whole, never cut, where it would leave no rule beside it: a cut title reads as another one.
  const title = node.title !== undefined && visibleWidth(node.title) <= width - 6 ? node.title : undefined
  const top = title === undefined
    ? edge(`${border.topLeft}${border.horizontal.repeat(width - 2)}${border.topRight}`)
    : `${edge(`${border.topLeft}${border.horizontal} `)}${title}${edge(` ${border.horizontal.repeat(width - 5 - visibleWidth(title))}${border.topRight}`)}`
  const body = frame.lines.map(row => `${edge(border.side)} ${row}${' '.repeat(Math.max(0, inner - visibleWidth(row)))} ${edge(border.side)}`)
  return {
    lines: [top, ...body, edge(`${border.bottomLeft}${border.horizontal.repeat(width - 2)}${border.bottomRight}`)],
    regions: frame.regions.map(placed => ({ ...placed, top: placed.top + 1, left: placed.left + CARD_SIDE })),
  }
}

/**
 * Lay a band out: what it holds, padded a column each side and a line above
 * and below, every line filled with the background it names. pi-tui's `Box`
 * draws the padding and the fill, as `Text` draws a text node's wrapped
 * line; what it holds is laid out here, for its regions are binnacle's.
 * @returns the padded lines, and what it holds's regions moved inside the padding; what it holds alone where the width leaves no column inside it, and nothing at all — not empty padding — when it holds nothing.
 */
function band(node: Extract<Node, { readonly kind: 'band' }>, width: number, state: LayoutState): Frame {
  const inner = width - 2 * BAND_PAD
  if (inner < 1) return drawn(node.child, width, state)
  const frame = drawn(node.child, inner, state)
  const box = new Box(BAND_PAD, BAND_PAD, backgrounds[node.background])
  // What it holds is laid out already, at exactly the width Box asks of it, so its render hands the lines back as they are; nothing is cached, for a band is laid out anew whenever the node it holds is.
  box.addChild({ render: () => [...frame.lines], invalidate: () => {} })
  return {
    lines: box.render(width),
    regions: frame.regions.map(placed => ({ ...placed, top: placed.top + BAND_PAD, left: placed.left + BAND_PAD })),
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
