import type { Anchor, Layout, Size } from '../api.ts'
import { cells } from './box.ts'

/** A node of the Layout, with each `{ layout: name }` replaced by the Layout set by that name, and its size known. */
export type Tree = { readonly node: Layout; readonly size: Size } & (
  | { readonly kind: 'place'; readonly place: string }
  | { readonly kind: 'row' | 'column' | 'first' | 'layout'; readonly children: readonly Tree[] }
  | { readonly kind: 'over'; readonly over: Tree; readonly float: Tree; readonly at: Anchor | undefined }
)

/** `named`: the node is in a Layout set by name, where a node with no size takes what its lines need. `names`: the named Layouts it is in, as one that draws itself draws nothing the second time. */
export function grow(node: Layout, named: boolean, names: readonly string[], layoutOf: (name: string) => Layout | undefined): Tree {
  const given = node.size ?? (named ? 'content' : 'fill')
  const size: Size = typeof given === 'object' ? { fixed: cells(given.fixed) } : given
  const all = (children: readonly Layout[]) => children.map((child) => grow(child, named, names, layoutOf))
  if (node.place !== undefined) return { node, size, kind: 'place', place: node.place }
  if (node.row !== undefined) return { node, size, kind: 'row', children: all(node.row) }
  if (node.first !== undefined) return { node, size, kind: 'first', children: all(node.first) }
  if (node.over !== undefined)
    return {
      node,
      size,
      kind: 'over',
      over: grow(node.over, named, names, layoutOf),
      float: grow(node.float, named, names, layoutOf),
      at: node.at,
    }
  if (node.layout !== undefined) {
    const layout = names.includes(node.layout) ? undefined : layoutOf(node.layout)
    const children = layout === undefined ? [] : [grow(layout, true, [...names, node.layout], layoutOf)]
    return { node, size, kind: 'layout', children }
  }
  return { node, size, kind: 'column', children: all(node.column ?? []) }
}

const MOST_FLOAT_WIDTH = 80
const FLOAT_MARGIN = 4

export function floatWidthOf(at: Anchor | undefined, width: number): number {
  return Math.min(width, cells(at?.width ?? Math.min(MOST_FLOAT_WIDTH, width - FLOAT_MARGIN)))
}

/** The width that a float of that natural width needs to cover, so that `floatWidthOf` gives it back. */
export function coverWidthOf(at: Anchor | undefined, natural: number): number {
  return at?.width === undefined ? Math.min(MOST_FLOAT_WIDTH, natural) + FLOAT_MARGIN : cells(at.width)
}

/** Where a float's box starts, in the cells of what it covers. */
export function floatAt(at: Anchor | undefined, width: number, height: number, floatWidth: number, floatHeight: number) {
  const side = at?.side ?? 'center'
  const y = side === 'top' ? 0 : side === 'bottom' ? height - floatHeight : Math.floor((height - floatHeight) / 2)
  return { x: Math.floor((width - floatWidth) / 2), y }
}
