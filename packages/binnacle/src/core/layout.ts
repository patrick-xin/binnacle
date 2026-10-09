import type { Layout } from '../api.ts'
import { sliceByColumn, sliceWithWidth, truncateToWidth, visibleWidth } from '../terminal/utils.ts'
import { bordersOf, edgeRow, gapOf, insetsOf, paddingOf } from './box.ts'
import type { Spare } from './box.ts'
import { withoutBlankEnd } from './row-end.ts'
import { coverWidthOf, fixedOf, floatAt, floatWidthOf, grow } from './tree.ts'
import type { Tree } from './tree.ts'
import { edgeNamed } from './theme.ts'
import type { Theme } from './theme.ts'

export interface Places {
  rows(place: string, width: number): readonly string[]
  scrolledUp(place: string): number
  /** In the Place's rows; only the Place with the Focus has one. */
  cursor(place: string, width: number): Position | undefined
  /** An author paged the Place, and its cursor has not moved since: the Place shows the paged rows, not the cursor's. */
  paged(place: string, width: number): boolean
  /** The newest Layout set by that name. */
  layout(name: string): Layout | undefined
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

/** Cells that a click or the wheel lands on: a Place drawn, or none, where the mouse does nothing or a float's box covers. */
export interface Hit {
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
  readonly placed: Placed | undefined
}

export interface Arranged {
  readonly rows: string[]
  /** In the order of the layout. */
  readonly placed: Placed[]
  /** The topmost first: what floats comes before what it covers. */
  readonly hits: Hit[]
  /** On the terminal, where the cursor of the Part with the Focus is drawn. */
  readonly cursor: Position | undefined
}

const SPARES: readonly Spare[] = ['nothing', 'spacing', 'borders']

const RESET_STYLE = '\x1b[0m'
const blank = (width: number): string => ' '.repeat(Math.max(0, width))
const fit = (row: string, width: number): string => truncateToWidth(row, width, '', true)

class Arrangement {
  readonly placed: Placed[] = []
  hits: Hit[] = []
  overflowed = false
  cursor: Position | undefined
  readonly #shownFrom = new Map<string, number>()
  readonly #places: Places
  readonly #spare: Spare
  readonly #theme: Theme
  readonly #named = new Map<string, Tree | undefined>()
  // The names whose lines are being asked for: an `unless` that names a Layout it is in has no lines there.
  readonly #asking = new Set<string>()
  #mouse = true

  constructor(places: Places, spare: Spare, theme: Theme) {
    this.#places = places
    this.#spare = spare
    this.#theme = theme
  }

  height(tree: Tree, width: number): number {
    if (this.#vanishes(tree, width)) return 0
    const insets = insetsOf(tree.node, this.#spare, this.#theme)
    return insets.top + insets.bottom + this.#innerHeight(tree, width - insets.left - insets.right)
  }

  width(tree: Tree, available: number): number {
    if (this.#vanishes(tree, available)) return 0
    const insets = insetsOf(tree.node, this.#spare, this.#theme)
    return insets.left + insets.right + this.#innerWidth(tree, available - insets.left - insets.right)
  }

  draw(tree: Tree, top: number, left: number, width: number, height: number): string[] {
    if (this.#vanishes(tree, width)) return Array.from({ length: height }, () => blank(width))
    const mouse = this.#mouse
    if (tree.node.mouse === false) this.#mouse = false
    try {
      return this.#drawBox(tree, top, left, width, height)
    } finally {
      this.#mouse = mouse
    }
  }

  #drawBox(tree: Tree, top: number, left: number, width: number, height: number): string[] {
    const { node } = tree
    const insets = insetsOf(node, this.#spare, this.#theme)
    const borders = bordersOf(node, this.#spare)
    const padding = paddingOf(node, this.#spare, this.#theme)
    if (insets.top + insets.bottom > height || insets.left + insets.right > width) this.overflowed = true
    const innerWidth = Math.max(0, width - insets.left - insets.right)
    const innerHeight = Math.max(0, height - insets.top - insets.bottom)
    const inner = this.#drawInner(tree, innerWidth, innerHeight, top + insets.top, left + insets.left)
    if (tree.kind === 'place') {
      const placed: Placed = {
        place: tree.place,
        top,
        left,
        width,
        height,
        maxScroll: this.#maxScroll(tree.place, innerWidth, innerHeight),
        content: { top: top + insets.top, left: left + insets.left, width: innerWidth, height: innerHeight },
        shownFrom: this.#shownFrom.get(tree.place) ?? 0,
      }
      this.placed.push(placed)
      this.hits.push({ top, left, width, height, placed: this.#mouse ? placed : undefined })
    }
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

  /** Whether a Place in it has a line to draw. */
  #hasLines(tree: Tree, width: number): boolean {
    if (this.#hidden(tree, width)) return false
    if (tree.kind === 'place') return this.#places.rows(tree.place, width).length > 0
    if (tree.kind === 'over') return this.#hasLines(tree.over, width) || this.#hasLines(tree.float, width)
    return tree.children.some((child) => this.#hasLines(child, width))
  }

  #hidden(tree: Tree, width: number): boolean {
    const name = tree.node.unless
    if (name === undefined || this.#asking.has(name)) return false
    this.#asking.add(name)
    try {
      if (!this.#named.has(name)) {
        const layout = this.#places.layout(name)
        this.#named.set(name, layout === undefined ? undefined : grow(layout, true, [name], (named) => this.#places.layout(named)))
      }
      const named = this.#named.get(name)
      return named === undefined ? this.#places.rows(name, width).length > 0 : this.#hasLines(named, width)
    } finally {
      this.#asking.delete(name)
    }
  }

  /** A node hidden by `unless`, or a named Layout or a `first` with no line to draw, takes no cells, its box included. */
  #vanishes(tree: Tree, width: number): boolean {
    if (this.#hidden(tree, width)) return true
    return (tree.kind === 'layout' || tree.kind === 'first') && !this.#hasLines(tree, width)
  }

  /** The children that take cells. */
  #shown(tree: Tree, width: number): readonly Tree[] {
    if (tree.kind === 'place' || tree.kind === 'over') return []
    if (tree.kind === 'first') {
      const first = tree.children.find((child) => this.#hasLines(child, width))
      return first === undefined ? [] : [first]
    }
    return tree.children.filter((child) => !this.#vanishes(child, width))
  }

  #gaps(tree: Tree, width: number): number {
    return Math.max(0, this.#shown(tree, width).length - 1) * gapOf(tree.node, this.#spare, this.#theme)
  }

  #innerHeight(tree: Tree, width: number): number {
    if (tree.kind === 'place') return this.#places.rows(tree.place, width).length
    if (tree.kind === 'over')
      return Math.max(
        this.height(tree.over, width),
        this.#hasLines(tree.float, width) ? this.height(tree.float, floatWidthOf(tree.at, width)) : 0,
      )
    const shown = this.#shown(tree, width)
    if (tree.kind === 'row') {
      const widths = this.#widths(tree, width)
      return Math.max(0, ...shown.map((child, index) => this.height(child, widths[index] ?? 0)))
    }
    return shown.reduce((sum, child) => sum + (fixedOf(child) ?? this.height(child, width)), this.#gaps(tree, width))
  }

  #innerWidth(tree: Tree, available: number): number {
    if (tree.kind === 'place') return Math.max(0, ...this.#places.rows(tree.place, available).map(visibleWidth))
    if (tree.kind === 'over')
      return Math.max(
        this.width(tree.over, available),
        this.#hasLines(tree.float, available) ? coverWidthOf(tree.at, this.width(tree.float, available)) : 0,
      )
    const shown = this.#shown(tree, available)
    if (tree.kind === 'row')
      return shown.reduce((sum, child) => sum + (fixedOf(child) ?? this.width(child, available)), this.#gaps(tree, available))
    return Math.max(0, ...shown.map((child) => this.width(child, available)))
  }

  #drawInner(tree: Tree, width: number, height: number, top: number, left: number): string[] {
    if (tree.kind === 'place') return this.#place(tree.place, top, left, width, height)
    if (tree.kind === 'over') return this.#over(tree, top, left, width, height)
    if (tree.kind === 'row') return this.#row(tree, top, left, width, height)
    return this.#column(tree, top, left, width, height)
  }

  #over(tree: Tree & { readonly kind: 'over' }, top: number, left: number, width: number, height: number): string[] {
    const hitsFrom = this.hits.length
    const rows = this.draw(tree.over, top, left, width, height)
    if (!this.#hasLines(tree.float, width)) return rows
    const floatWidth = floatWidthOf(tree.at, width)
    const floatHeight = Math.min(height, this.height(tree.float, floatWidth))
    const { x, y } = floatAt(tree.at, width, height, floatWidth, floatHeight)
    const cursor = this.cursor
    this.cursor = undefined
    const beneath = this.hits.splice(hitsFrom)
    const outside = this.hits
    this.hits = []
    const floated = this.draw(tree.float, top + y, left + x, floatWidth, floatHeight)
    // The float's box covers what is beneath it, its border, padding and gaps included.
    this.hits = [
      ...outside,
      ...this.hits,
      { top: top + y, left: left + x, width: floatWidth, height: floatHeight, placed: undefined },
      ...beneath,
    ]
    const covered = (at: Position) =>
      at.row >= top + y && at.row < top + y + floatHeight && at.column >= left + x && at.column < left + x + floatWidth
    // A cursor that the float covers is not drawn on top of it.
    this.cursor ??= cursor !== undefined && covered(cursor) ? undefined : cursor
    for (const [index, row] of floated.entries()) {
      const under = rows[y + index] ?? ''
      const head = sliceWithWidth(under, 0, x, true)
      const tail = sliceByColumn(under, x + floatWidth, Math.max(0, width - x - floatWidth), true)
      rows[y + index] = head.text + blank(x - head.width) + RESET_STYLE + fit(row, floatWidth) + RESET_STYLE + tail
    }
    return rows
  }

  #column(tree: Tree, top: number, left: number, width: number, height: number): string[] {
    const gap = gapOf(tree.node, this.#spare, this.#theme)
    const children = this.#shown(tree, width)
    const heights = this.#share(children, height - this.#gaps(tree, width), (child) => this.height(child, width))
    let y = top
    const rows = children.flatMap((child, index) => {
      const drawn = [
        ...(index === 0 ? [] : Array.from({ length: gap }, () => blank(width))),
        ...this.draw(child, y + (index === 0 ? 0 : gap), left, width, heights[index] ?? 0),
      ]
      y += drawn.length
      return drawn
    })
    return [...rows, ...Array.from({ length: height - rows.length }, () => blank(width))]
  }

  #row(tree: Tree, top: number, left: number, width: number, height: number): string[] {
    const gap = blank(gapOf(tree.node, this.#spare, this.#theme))
    const widths = this.#widths(tree, width)
    let x = left
    const blocks = this.#shown(tree, width).map((child, index) => {
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
    if (cursor !== undefined && !this.#places.paged(place, width)) end = Math.min(Math.max(end, cursor.row + 1), cursor.row + height)
    const start = Math.max(0, end - height)
    this.#shownFrom.set(place, start)
    if (cursor !== undefined && cursor.row >= start && cursor.row < end && cursor.column < width)
      this.cursor = { row: top + cursor.row - start, column: left + cursor.column }
    const shown = all.slice(start, end).map((row) => fit(row.includes('\x1b') ? row + RESET_STYLE : row, width))
    return [...shown, ...Array.from({ length: height - shown.length }, () => blank(width))]
  }

  #widths(tree: Tree, width: number): number[] {
    return this.#share(this.#shown(tree, width), width - this.#gaps(tree, width), (child) => this.width(child, width))
  }

  #share(children: readonly Tree[], available: number, natural: (child: Tree) => number): number[] {
    if (available < 0) this.overflowed = true
    let left = Math.max(0, available)
    const sizes = children.map(({ size }, index) => {
      if (size === 'fill') return 0
      const wanted = size === 'content' ? natural(children[index]!) : size.fixed
      const given = Math.min(wanted, left)
      if (given < wanted) this.overflowed = true
      left -= given
      return given
    })
    const fills = children.filter(({ size }) => size === 'fill').length
    let nth = 0
    return children.map(({ size }, index) => {
      if (size !== 'fill') return sizes[index] ?? 0
      const share = Math.floor(left / fills) + (nth < left % fills ? 1 : 0)
      nth++
      return share
    })
  }
}

function attempt(tree: Tree, width: number, height: number, places: Places, spare: Spare, theme: Theme) {
  const arrangement = new Arrangement(places, spare, theme)
  const rows = arrangement.draw(tree, 0, 0, width, height)
  return { rows, placed: arrangement.placed, hits: arrangement.hits, cursor: arrangement.cursor, overflowed: arrangement.overflowed }
}

export function arrange(layout: Layout, width: number, height: number, places: Places, theme: Theme): Arranged {
  const tree = grow(layout, false, [], (name) => places.layout(name))
  let arranged = attempt(tree, width, height, places, 'nothing', theme)
  for (const spare of SPARES.slice(1)) {
    if (!arranged.overflowed) break
    arranged = attempt(tree, width, height, places, spare, theme)
  }
  return { rows: arranged.rows.map(withoutBlankEnd), placed: arranged.placed, hits: arranged.hits, cursor: arranged.cursor }
}
