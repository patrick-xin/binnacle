import { visibleWidth, wrapTextWithAnsi } from '../terminal/utils.ts'

export interface WrapPrefixes {
  /** Before the first line. */
  readonly first?: string
  /** Before each line after the first: by default, as many spaces as `first` is wide. */
  readonly rest?: string
}

/** The text's lines, wrapped at `width` with the prefixes added, as the core wraps a Part's lines: a style that spans a wrap is carried to the next line. */
export function wrap(text: string, width: number, prefixes: WrapPrefixes = {}): string[] {
  const first = prefixes.first ?? ''
  const rest = prefixes.rest ?? ' '.repeat(visibleWidth(first))
  // One width for every line, so that the text wraps once: the wider prefix sets it.
  const room = Math.max(1, width - Math.max(visibleWidth(first), visibleWidth(rest)))
  return wrapTextWithAnsi(text, room).map((line, at) => (at === 0 ? first : rest) + line)
}
