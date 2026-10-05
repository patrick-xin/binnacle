import type { Layout, Side, Size } from '../api.ts'
import { sliceByColumn, truncateToWidth, visibleWidth } from '../terminal/utils.ts'
import { edgeNamed, theme } from './theme.ts'
import type { Edge } from './theme.ts'
import { toPlainText } from './view.ts'

export interface Places {
  rows(place: string, width: number): readonly string[]
  scrolledUp(place: string): number
}

/** A Place as it was laid out: its box's cells, which the wheel hits. */
export interface Placed {
  readonly place: string
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
  readonly maxScroll: number
}

export interface Arranged {
  readonly rows: string[]
  readonly placed: Placed[]
}

type Insets = { readonly [side in Side]: number }

/** What a terminal too small for the layout gives up, in order, before it cuts rows. */
type Spare = 'nothing' | 'spacing' | 'borders'
const SPARES: readonly Spare[] = ['nothing', 'spacing', 'borders']
const NONE: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left']

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

function paddingOf(node: Layout, spare: Spare): Insets {
  if (spare !== 'nothing') return NONE
  const padding = node.padding ?? theme.padding
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

function insetsOf(node: Layout, spare: Spare): Insets {
  const borders = bordersOf(node, spare)
  const padding = paddingOf(node, spare)
  return {
    top: borders.top + padding.top,
    right: borders.right + padding.right,
    bottom: borders.bottom + padding.bottom,
    left: borders.left + padding.left,
  }
}

function edgeRow(edge: Edge, borders: Insets, width: number, at: 'top' | 'bottom', title = ''): string {
  const [start, line, end] = at === 'top' ? [edge.topLeft, edge.top, edge.topRight] : [edge.bottomLeft, edge.bottom, edge.bottomRight]
  const left = borders.left === 1 ? start : ''
  const right = borders.right === 1 ? end : ''
  const between = width - visibleWidth(left) - visibleWidth(right)
  const shownTitle = sliceByColumn(toPlainText(title), 0, Math.max(0, between - 3), true).trimEnd()
  const middle = shownTitle === '' ? '' : `${line} ${shownTitle} `
  return left + middle + line.repeat(Math.max(0, between - visibleWidth(middle))) + right
}

function gapOf(node: Layout, spare: Spare): number {
  return spare === 'nothing' ? cells(node.gap ?? theme.gap) : 0
}

function gapsOf(node: Layout, spare: Spare): number {
  return Math.max(0, childrenOf(node).length - 1) * gapOf(node, spare)
}

class Arrangement {
  readonly placed: Placed[] = []
  overflowed = false
  readonly #places: Places
  readonly #spare: Spare

  constructor(places: Places, spare: Spare) {
    this.#places = places
    this.#spare = spare
  }

  height(node: Layout, width: number): number {
    const insets = insetsOf(node, this.#spare)
    return insets.top + insets.bottom + this.#innerHeight(node, width - insets.left - insets.right)
  }

  width(node: Layout, available: number): number {
    const insets = insetsOf(node, this.#spare)
    return insets.left + insets.right + this.#innerWidth(node, available - insets.left - insets.right)
  }

  draw(node: Layout, top: number, left: number, width: number, height: number): string[] {
    const insets = insetsOf(node, this.#spare)
    const borders = bordersOf(node, this.#spare)
    const padding = paddingOf(node, this.#spare)
    if (insets.top + insets.bottom > height || insets.left + insets.right > width) this.overflowed = true
    const innerWidth = Math.max(0, width - insets.left - insets.right)
    const innerHeight = Math.max(0, height - insets.top - insets.bottom)
    const inner = this.#drawInner(node, innerWidth, innerHeight, top + insets.top, left + insets.left)
    if ('place' in node)
      this.placed.push({ place: node.place, top, left, width, height, maxScroll: this.#maxScroll(node.place, innerWidth, innerHeight) })
    const paddedWidth = Math.max(0, width - borders.left - borders.right)
    const padded = [
      ...Array.from({ length: padding.top }, () => blank(paddedWidth)),
      ...inner.map((row) => fit(blank(padding.left) + row, paddedWidth)),
      ...Array.from({ length: padding.bottom }, () => blank(paddedWidth)),
    ]
    const edge = edgeNamed(node.edge)
    const framed = [
      ...(borders.top === 1 ? [edgeRow(edge, borders, width, 'top', node.title)] : []),
      ...padded.map((row) => (borders.left === 1 ? edge.left : '') + row + (borders.right === 1 ? edge.right : '')),
      ...(borders.bottom === 1 ? [edgeRow(edge, borders, width, 'bottom')] : []),
    ]
    return framed.slice(0, height)
  }

  #innerHeight(node: Layout, width: number): number {
    if ('place' in node) return this.#places.rows(node.place, width).length
    if ('column' in node) return node.column.reduce((sum, child) => sum + this.height(child, width), gapsOf(node, this.#spare))
    const widths = this.#widths(node, width)
    return Math.max(0, ...node.row.map((child, index) => this.height(child, widths[index] ?? 0)))
  }

  #innerWidth(node: Layout, available: number): number {
    if ('place' in node) return Math.max(0, ...this.#places.rows(node.place, available).map(visibleWidth))
    if ('row' in node) return node.row.reduce((sum, child) => sum + this.width(child, available), gapsOf(node, this.#spare))
    return Math.max(0, ...childrenOf(node).map((child) => this.width(child, available)))
  }

  #drawInner(node: Layout, width: number, height: number, top: number, left: number): string[] {
    if ('place' in node) return this.#place(node.place, width, height)
    if ('row' in node) return this.#row(node, top, left, width, height)
    return this.#column(node, top, left, width, height)
  }

  #column(node: Layout, top: number, left: number, width: number, height: number): string[] {
    const gap = gapOf(node, this.#spare)
    const heights = this.#share(childrenOf(node), height - gapsOf(node, this.#spare), (child) => this.height(child, width))
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
    const gap = blank(gapOf(node, this.#spare))
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

  #place(place: string, width: number, height: number): string[] {
    const all = this.#places.rows(place, width)
    const end = all.length - Math.min(this.#places.scrolledUp(place), this.#maxScroll(place, width, height))
    const shown = all.slice(Math.max(0, end - height), end).map((row) => fit(row, width))
    return [...shown, ...Array.from({ length: height - shown.length }, () => blank(width))]
  }

  #widths(node: Layout, width: number): number[] {
    return this.#share(childrenOf(node), width - gapsOf(node, this.#spare), (child) => this.width(child, width))
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

function attempt(layout: Layout, width: number, height: number, places: Places, spare: Spare) {
  const arrangement = new Arrangement(places, spare)
  const rows = arrangement.draw(layout, 0, 0, width, height)
  return { rows, placed: arrangement.placed, overflowed: arrangement.overflowed }
}

export function arrange(layout: Layout, width: number, height: number, places: Places): Arranged {
  let arranged = attempt(layout, width, height, places, 'nothing')
  for (const spare of SPARES.slice(1)) {
    if (!arranged.overflowed) break
    arranged = attempt(layout, width, height, places, spare)
  }
  // The display clears each row to its end, so the blanks that pad a row out to the width are not written.
  return { rows: arranged.rows.map((row) => row.trimEnd()), placed: arranged.placed }
}
