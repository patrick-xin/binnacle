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
export function withoutBlankEnd(row: string): string {
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
