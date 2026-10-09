import type { Layout, Side, Size } from '../api.ts'
import { sliceByColumn, truncateToWidth, visibleWidth } from '../terminal/utils.ts'
import { edgeNamed } from './theme.ts'
import type { Edge, Theme } from './theme.ts'
import { toPlainText } from './view.ts'

export interface Places {
  rows(place: string, width: number): readonly string[]
  scrolledUp(place: string): number
  /** In the Place's rows; only the Place with the Focus has one. */
  cursor(place: string, width: number): Position | undefined
}

export interface Position {
  readonly row: number
  readonly column: number
}

/** A Place as it was laid out: its box's cells, which the wheel hits, and the Part's rows inside, which a click hits. */
export interface Placed {
  readonly place: string
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
  readonly maxScroll: number
  readonly content: { readonly top: number; readonly left: number; readonly width: number; readonly height: number }
  /** The Part's row shown at the top of its box, however the Place is scrolled. */
  readonly shownFrom: number
}

export interface Arranged {
  readonly rows: string[]
  readonly placed: Placed[]
  /** On the terminal, where the cursor of the Part with the Focus is drawn. */
  readonly cursor: Position | undefined
}

type Insets = { readonly [side in Side]: number }

/** What a terminal too small for the layout gives up, in order, before it cuts rows. */
type Spare = 'nothing' | 'spacing' | 'borders'
const SPARES: readonly Spare[] = ['nothing', 'spacing', 'borders']
const NONE: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left']

const RESET_STYLE = '\x1b[0m'
const blank = (width: number): string => ' '.repeat(Math.max(0, width))
const fit = (row: string, width: number): string => truncateToWidth(row, width, '', true)
// An author's numbers are not checked by a type: a size, a padding or a gap is whole cells, and never fewer than none.
const cells = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0)

function sizeOf(node: Layout): Size {
  const size = node.size ?? 'fill'
  return typeof size === 'object' ? { fixed: cells(size.fixed) } : size
}

function childrenOf(node: Layout): readonly Layout[] {
  if ('row' in node) return node.row
  if ('column' in node) return node.column
  return []
}

function bordersOf(node: Layout, spare: Spare): Insets {
  if (spare === 'borders') return NONE
  const sides = node.border === true ? SIDES : node.border === false || node.border === undefined ? [] : node.border
  return { top: +sides.includes('top'), right: +sides.includes('right'), bottom: +sides.includes('bottom'), left: +sides.includes('left') }
}

function paddingOf(node: Layout, spare: Spare, theme: Theme): Insets {
  if (spare !== 'nothing') return NONE
  const padding = node.padding ?? theme.tokens.padding
  if (typeof padding === 'number') {
    const all = cells(padding)
    return { top: all, right: all, bottom: all, left: all }
  }
  return {
    top: cells(padding.top ?? 0),
    right: cells(padding.right ?? 0),
    bottom: cells(padding.bottom ?? 0),
    left: cells(padding.left ?? 0),
  }
}

function insetsOf(node: Layout, spare: Spare, theme: Theme): Insets {
  const borders = bordersOf(node, spare)
  const padding = paddingOf(node, spare, theme)
  return {
    top: borders.top + padding.top,
    right: borders.right + padding.right,
    bottom: borders.bottom + padding.bottom,
    left: borders.left + padding.left,
  }
}

function edgeRow(edge: Edge, borders: Insets, width: number, at: 'top' | 'bottom', paint: (glyphs: string) => string, title = ''): string {
  const [start, line, end] = at === 'top' ? [edge.topLeft, edge.top, edge.topRight] : [edge.bottomLeft, edge.bottom, edge.bottomRight]
  const left = borders.left === 1 ? start : ''
  const right = borders.right === 1 ? end : ''
  const between = width - visibleWidth(left) - visibleWidth(right)
  const shownTitle = sliceByColumn(toPlainText(title), 0, Math.max(0, between - 3), true).trimEnd()
  const middle = shownTitle === '' ? '' : `${line} ${shownTitle} `
  const rest = line.repeat(Math.max(0, between - visibleWidth(middle)))
  return shownTitle === '' ? paint(left + rest + right) : `${paint(left + line)} ${shownTitle} ${paint(rest + right)}`
}

function gapOf(node: Layout, spare: Spare, theme: Theme): number {
  return spare === 'nothing' ? cells(node.gap ?? theme.tokens.gap) : 0
}

function gapsOf(node: Layout, spare: Spare, theme: Theme): number {
  return Math.max(0, childrenOf(node).length - 1) * gapOf(node, spare, theme)
}

class Arrangement {
  readonly placed: Placed[] = []
  overflowed = false
  cursor: Position | undefined
  readonly #shownFrom = new Map<string, number>()
  readonly #places: Places
  readonly #spare: Spare
  readonly #theme: Theme

  constructor(places: Places, spare: Spare, theme: Theme) {
    this.#places = places
    this.#spare = spare
    this.#theme = theme
  }

  height(node: Layout, width: number): number {
    const insets = insetsOf(node, this.#spare, this.#theme)
    return insets.top + insets.bottom + this.#innerHeight(node, width - insets.left - insets.right)
  }

  width(node: Layout, available: number): number {
    const insets = insetsOf(node, this.#spare, this.#theme)
    return insets.left + insets.right + this.#innerWidth(node, available - insets.left - insets.right)
  }

  draw(node: Layout, top: number, left: number, width: number, height: number): string[] {
    const insets = insetsOf(node, this.#spare, this.#theme)
    const borders = bordersOf(node, this.#spare)
    const padding = paddingOf(node, this.#spare, this.#theme)
    if (insets.top + insets.bottom > height || insets.left + insets.right > width) this.overflowed = true
    const innerWidth = Math.max(0, width - insets.left - insets.right)
    const innerHeight = Math.max(0, height - insets.top - insets.bottom)
    const inner = this.#drawInner(node, innerWidth, innerHeight, top + insets.top, left + insets.left)
    if ('place' in node)
      this.placed.push({
        place: node.place,
        top,
        left,
        width,
        height,
        maxScroll: this.#maxScroll(node.place, innerWidth, innerHeight),
        content: { top: top + insets.top, left: left + insets.left, width: innerWidth, height: innerHeight },
        shownFrom: this.#shownFrom.get(node.place) ?? 0,
      })
    const paddedWidth = Math.max(0, width - borders.left - borders.right)
    const padded = [
      ...Array.from({ length: padding.top }, () => blank(paddedWidth)),
      ...inner.map((row) => fit(blank(padding.left) + row, paddedWidth)),
      ...Array.from({ length: padding.bottom }, () => blank(paddedWidth)),
    ]
    const edge = edgeNamed(node.edge, this.#theme.tokens)
    const paint = (glyphs: string): string => this.#theme.paint('border', glyphs)
    const [leftSide, rightSide] = [borders.left === 1 ? paint(edge.left) : '', borders.right === 1 ? paint(edge.right) : '']
    const framed = [
      ...(borders.top === 1 ? [edgeRow(edge, borders, width, 'top', paint, node.title)] : []),
      ...padded.map((row) => leftSide + row + rightSide),
      ...(borders.bottom === 1 ? [edgeRow(edge, borders, width, 'bottom', paint)] : []),
    ]
    return framed.slice(0, height)
  }

  #innerHeight(node: Layout, width: number): number {
    if ('place' in node) return this.#places.rows(node.place, width).length
    if ('column' in node) return node.column.reduce((sum, child) => sum + this.height(child, width), gapsOf(node, this.#spare, this.#theme))
    const widths = this.#widths(node, width)
    return Math.max(0, ...node.row.map((child, index) => this.height(child, widths[index] ?? 0)))
  }

  #innerWidth(node: Layout, available: number): number {
    if ('place' in node) return Math.max(0, ...this.#places.rows(node.place, available).map(visibleWidth))
    if ('row' in node) return node.row.reduce((sum, child) => sum + this.width(child, available), gapsOf(node, this.#spare, this.#theme))
    return Math.max(0, ...childrenOf(node).map((child) => this.width(child, available)))
  }

  #drawInner(node: Layout, width: number, height: number, top: number, left: number): string[] {
    if ('place' in node) return this.#place(node.place, top, left, width, height)
    if ('row' in node) return this.#row(node, top, left, width, height)
    return this.#column(node, top, left, width, height)
  }

  #column(node: Layout, top: number, left: number, width: number, height: number): string[] {
    const gap = gapOf(node, this.#spare, this.#theme)
    const heights = this.#share(childrenOf(node), height - gapsOf(node, this.#spare, this.#theme), (child) => this.height(child, width))
    let y = top
    const rows = childrenOf(node).flatMap((child, index) => {
      const drawn = [
        ...(index === 0 ? [] : Array.from({ length: gap }, () => blank(width))),
        ...this.draw(child, y + (index === 0 ? 0 : gap), left, width, heights[index] ?? 0),
      ]
      y += drawn.length
      return drawn
    })
    return [...rows, ...Array.from({ length: height - rows.length }, () => blank(width))]
  }

  #row(node: Layout, top: number, left: number, width: number, height: number): string[] {
    const gap = blank(gapOf(node, this.#spare, this.#theme))
    const widths = this.#widths(node, width)
    let x = left
    const blocks = childrenOf(node).map((child, index) => {
      const block = this.draw(child, top, x, widths[index] ?? 0, height)
      x += (widths[index] ?? 0) + gap.length
      return block
    })
    return Array.from({ length: height }, (_, y) => blocks.map((block, index) => fit(block[y] ?? '', widths[index] ?? 0)).join(gap))
  }

  #maxScroll(place: string, width: number, height: number): number {
    return Math.max(0, this.#places.rows(place, width).length - height)
  }

  #place(place: string, top: number, left: number, width: number, height: number): string[] {
    const all = this.#places.rows(place, width)
    const cursor = this.#places.cursor(place, width)
    let end = all.length - Math.min(this.#places.scrolledUp(place), this.#maxScroll(place, width, height))
    // The Part with the Focus shows the row of its cursor, however it was scrolled.
    if (cursor !== undefined) end = Math.min(Math.max(end, cursor.row + 1), cursor.row + height)
    const start = Math.max(0, end - height)
    this.#shownFrom.set(place, start)
    if (cursor !== undefined && height > 0 && cursor.column < width)
      this.cursor = { row: top + cursor.row - start, column: left + cursor.column }
    const shown = all.slice(start, end).map((row) => fit(row.includes('\x1b') ? row + RESET_STYLE : row, width))
    return [...shown, ...Array.from({ length: height - shown.length }, () => blank(width))]
  }

  #widths(node: Layout, width: number): number[] {
    return this.#share(childrenOf(node), width - gapsOf(node, this.#spare, this.#theme), (child) => this.width(child, width))
  }

  #share(children: readonly Layout[], available: number, natural: (child: Layout) => number): number[] {
    if (available < 0) this.overflowed = true
    let left = Math.max(0, available)
    const sizes = children.map((child) => {
      const size = sizeOf(child)
      if (size === 'fill') return 0
      const wanted = size === 'content' ? natural(child) : size.fixed
      const given = Math.min(wanted, left)
      if (given < wanted) this.overflowed = true
      left -= given
      return given
    })
    const fills = children.filter((child) => sizeOf(child) === 'fill').length
    let nth = 0
    return children.map((child, index) => {
      if (sizeOf(child) !== 'fill') return sizes[index] ?? 0
      const share = Math.floor(left / fills) + (nth < left % fills ? 1 : 0)
      nth++
      return share
    })
  }
}

const TRAILING_BLANKS = / +$/
const TRAILING_RESET = /\x1b\[0?m$/
const STYLES = /\x1b\[([\d;:]*)m/g

// What each SGR code turns on, by the code that turns it off; bold and dim are both turned off by 22.
const TURNED_OFF_BY: { readonly [code: number]: number } = {
  1: 22,
  2: 22,
  3: 23,
  4: 24,
  5: 25,
  7: 27,
  8: 28,
  9: 29,
  38: 39,
  48: 49,
  58: 59,
}
const offCodeOf = (code: number): number =>
  (code >= 30 && code <= 37) || (code >= 90 && code <= 97)
    ? 39
    : (code >= 40 && code <= 47) || (code >= 100 && code <= 107)
      ? 49
      : (TURNED_OFF_BY[code] ?? -code)

// A border closes only what it opened, so a row can end in a style that is closed: the styles are followed to their end.
function styledAtEnd(text: string): boolean {
  const on = new Set<number>()
  for (const [, parameters = ''] of text.matchAll(STYLES)) {
    const fields = parameters.split(';')
    for (let at = 0; at < fields.length; at++) {
      // In the colon form, a colour's numbers are subparameters of its own code.
      const [head = '', ...subparameters] = (fields[at] ?? '').split(':')
      const code = Number(head)
      if (code === 0) on.clear()
      else if (Object.values(TURNED_OFF_BY).includes(code) || code === 39 || code === 49) on.delete(code)
      else on.add(offCodeOf(code))
      // In the semicolon form, a colour by index or by RGB carries its numbers as the parameters after it.
      if ((code === 38 || code === 48 || code === 58) && subparameters.length === 0) {
        const space = fields[at + 1]
        at += space === '5' ? 2 : space === '2' ? 4 : 0
      }
    }
  }
  return on.size > 0
}

// The display resets the style and clears each row to its end, so the blanks at a row's end in the default style are not
// written. A blank after a colour or a style is kept: it is drawn.
function withoutBlankEnd(row: string): string {
  let end = row.length
  for (;;) {
    const head = row.slice(0, end)
    const reset = TRAILING_RESET.exec(head)
    if (reset !== null) {
      end = reset.index
      continue
    }
    const blanks = TRAILING_BLANKS.exec(head)
    if (blanks === null || styledAtEnd(head.slice(0, blanks.index))) return head
    end = blanks.index
  }
}

function attempt(layout: Layout, width: number, height: number, places: Places, spare: Spare, theme: Theme) {
  const arrangement = new Arrangement(places, spare, theme)
  const rows = arrangement.draw(layout, 0, 0, width, height)
  return { rows, placed: arrangement.placed, cursor: arrangement.cursor, overflowed: arrangement.overflowed }
}

export function arrange(layout: Layout, width: number, height: number, places: Places, theme: Theme): Arranged {
  let arranged = attempt(layout, width, height, places, 'nothing', theme)
  for (const spare of SPARES.slice(1)) {
    if (!arranged.overflowed) break
    arranged = attempt(layout, width, height, places, spare, theme)
  }
  return { rows: arranged.rows.map(withoutBlankEnd), placed: arranged.placed, cursor: arranged.cursor }
}
