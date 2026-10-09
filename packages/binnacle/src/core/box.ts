import type { Layout, Side } from '../api.ts'
import { sliceByColumn, visibleWidth } from '../terminal/utils.ts'
import type { Edge, Theme } from './theme.ts'
import { toPlainText } from './view.ts'

export type Insets = { readonly [side in Side]: number }

/** What a terminal too small for the layout gives up, in order, before it cuts rows. */
export type Spare = 'nothing' | 'spacing' | 'borders'
const NONE: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left']

// An author's numbers are not checked by a type: a size, a padding or a gap is whole cells, and never fewer than none.
export const cells = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0)

export function bordersOf(node: Layout, spare: Spare): Insets {
  if (spare === 'borders') return NONE
  const sides = node.border === true ? SIDES : node.border === false || node.border === undefined ? [] : node.border
  return { top: +sides.includes('top'), right: +sides.includes('right'), bottom: +sides.includes('bottom'), left: +sides.includes('left') }
}

export function paddingOf(node: Layout, spare: Spare, theme: Theme): Insets {
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

export function insetsOf(node: Layout, spare: Spare, theme: Theme): Insets {
  const borders = bordersOf(node, spare)
  const padding = paddingOf(node, spare, theme)
  return {
    top: borders.top + padding.top,
    right: borders.right + padding.right,
    bottom: borders.bottom + padding.bottom,
    left: borders.left + padding.left,
  }
}

export function edgeRow(
  edge: Edge,
  borders: Insets,
  width: number,
  at: 'top' | 'bottom',
  paint: (glyphs: string) => string,
  title = '',
): string {
  const [start, line, end] = at === 'top' ? [edge.topLeft, edge.top, edge.topRight] : [edge.bottomLeft, edge.bottom, edge.bottomRight]
  const left = borders.left === 1 ? start : ''
  const right = borders.right === 1 ? end : ''
  const between = width - visibleWidth(left) - visibleWidth(right)
  const shownTitle = sliceByColumn(toPlainText(title), 0, Math.max(0, between - 3), true).trimEnd()
  const middle = shownTitle === '' ? '' : `${line} ${shownTitle} `
  const rest = line.repeat(Math.max(0, between - visibleWidth(middle)))
  return shownTitle === '' ? paint(left + rest + right) : `${paint(left + line)} ${shownTitle} ${paint(rest + right)}`
}

export function gapOf(node: Layout, spare: Spare, theme: Theme): number {
  return spare === 'nothing' ? cells(node.gap ?? theme.tokens.gap) : 0
}
