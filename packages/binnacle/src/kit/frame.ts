import type { Binnacle, Tone } from '../api.ts'
import { edgeNamed } from '../core/theme.ts'
import { truncateToWidth, visibleWidth } from '../terminal/utils.ts'
import { wrap } from './wrap.ts'

// A line's style can stay open at its end, where it would colour the padding and the edge. wrap opens it again on the next line.
const RESET_STYLE = '\x1b[0m'

export interface FrameOptions {
  /** Drawn in the top edge, cut with the `more` glyph where it does not fit. */
  readonly title?: string
  /** The Tone of the edge: `border` by default. */
  readonly tone?: Tone
}

/** A line that `frame` takes: a string, or an object with its `text`, whose other fields `frame` keeps. */
export type Framed = string | { readonly text: string; readonly from?: number }

/**
 * The lines in a box of the theme's edge, `width` wide, each line wrapped inside it. Narrower than 4 cells, the lines without the box.
 * Each row an object wraps to keeps its other fields. Its `from` is moved past the left edge on its first row, and is the first cell inside the edge on each row after it.
 */
export function frame<L extends Framed>(
  binnacle: Binnacle,
  lines: readonly L[],
  width: number,
  options: FrameOptions = {},
): (string | L)[] {
  const cells = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0
  if (cells < 4) return lines.flatMap((line) => rowsOf(line, cells, 0, (row) => row))
  const edge = edgeNamed(undefined, binnacle.tokens)
  const paint = (glyphs: string) => binnacle.paint(options.tone ?? 'border', glyphs)
  const inner = cells - visibleWidth(edge.left) - visibleWidth(edge.right)
  const between = cells - visibleWidth(edge.topLeft) - visibleWidth(edge.topRight)
  const title = truncateToWidth(options.title ?? '', between - 3, binnacle.tokens.glyphs.more)
  const top =
    title === ''
      ? paint(edge.topLeft + edge.top.repeat(between) + edge.topRight)
      : `${paint(edge.topLeft + edge.top)} ${title} ${paint(edge.top.repeat(Math.max(0, between - 3 - visibleWidth(title))) + edge.topRight)}`
  const bottomBetween = cells - visibleWidth(edge.bottomLeft) - visibleWidth(edge.bottomRight)
  const bottom = paint(edge.bottomLeft + edge.bottom.repeat(bottomBetween) + edge.bottomRight)
  const boxed = (row: string): string =>
    paint(edge.left) + row + RESET_STYLE + ' '.repeat(Math.max(0, inner - visibleWidth(row))) + paint(edge.right)
  return [top, ...lines.flatMap((line) => rowsOf(line, inner, visibleWidth(edge.left), boxed)), bottom]
}

function rowsOf<L extends Framed>(line: L, width: number, left: number, drawn: (row: string) => string): (string | L)[] {
  if (typeof line === 'string') return wrap(line, width).map(drawn)
  const acting: Exclude<Framed, string> = line
  return wrap(acting.text, width).map(
    (row, nth) => ({ ...acting, text: drawn(row), from: left + (nth === 0 ? (acting.from ?? 0) : 0) }) as L,
  )
}

/** The Title's rule: the `rule` glyph across the width, in the `accent` Tone, with the text in it. */
export function rule(binnacle: Binnacle, text: string, width: number): string {
  const { rule: glyph } = binnacle.tokens.glyphs
  const head = text === '' ? '' : `${glyph}${glyph} ${text} `
  const glyphWidth = Math.max(1, visibleWidth(glyph))
  return binnacle.paint('accent', head + glyph.repeat(Math.max(0, Math.floor((width - visibleWidth(head)) / glyphWidth))))
}
