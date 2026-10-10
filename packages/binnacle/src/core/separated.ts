import type { Glyph } from '../api.ts'
import { truncateToWidth, visibleWidth } from '../terminal/utils.ts'
import { clipped } from './arranged.ts'
import type { Cells, Hit, Placed } from './arranged.ts'

/** A child of a separated row, drawn as one line, with what a click lands on in it. */
export interface Drawn {
  readonly line: string
  readonly hits: readonly Hit[]
  readonly placed: readonly Placed[]
}

/** A child that draws a line, and the cell of the row where it starts. */
export interface Segment extends Drawn {
  readonly at: number
}

/** Each child that draws a line that is not empty, drawn where it starts: after the line before it and a divider. */
export function segmentsOf<T>(children: readonly T[], divider: string, draw: (child: T, at: number) => Drawn): Segment[] {
  const segments: Segment[] = []
  let end = 0
  for (const child of children) {
    const at = segments.length === 0 ? 0 : end + visibleWidth(divider)
    const drawn = draw(child, at)
    const cells = visibleWidth(drawn.line)
    if (cells === 0) continue
    segments.push({ ...drawn, at })
    end = at + cells
  }
  return segments
}

export const joined = (segments: readonly Segment[], divider: string): string => segments.map(({ line }) => line).join(divider)

/** A Place's first line as a segment: a click on it lands on the Place, on its first line, as the Part was drawn at the row's whole width. */
export function placeSegment(place: string, line: string, at: Cells, mouse: boolean): Drawn {
  const { top, left } = at
  const width = visibleWidth(line)
  const placed: Placed = { place, top, left, width, height: 1, maxScroll: 0, content: { ...at, height: 1 }, shownFrom: 0 }
  return { line, hits: [{ top, left, width, height: 1, placed: mouse ? placed : undefined }], placed: [placed] }
}

/** A nested child as a segment: what a click lands on is kept only on its own line, so that it takes no click on a divider or a later segment. */
export function nestedSegment(line: string, hits: readonly Hit[], placed: readonly Placed[], top: number, left: number): Drawn {
  const own = { top, left, width: visibleWidth(line), height: 1 }
  return {
    line,
    hits: hits.flatMap((hit) => clipped(hit, own) ?? []),
    placed: placed.filter((each) => clipped({ ...each, placed: each }, own) !== undefined),
  }
}

/** The joined line, cut at the width with `more`, or empty where `more` does not fit; a click past the cut lands on nothing. */
export function cut(
  segments: readonly Segment[],
  glyphs: { readonly [glyph in Glyph]: string },
  top: number,
  left: number,
  width: number,
): Drawn {
  const line = joined(segments, glyphs.divider)
  const whole = visibleWidth(line) <= width
  const fits = whole || visibleWidth(glyphs.more) <= width
  const kept = { top, left, width: whole ? width : fits ? width - visibleWidth(glyphs.more) : 0, height: 1 }
  return {
    line: whole ? line : fits ? truncateToWidth(line, width, glyphs.more) : '',
    hits: segments.flatMap((segment) => segment.hits.flatMap((hit) => clipped(hit, kept) ?? [])),
    placed: segments.flatMap((segment) => segment.placed.filter((placed) => clipped({ ...placed, placed }, kept) !== undefined)),
  }
}
