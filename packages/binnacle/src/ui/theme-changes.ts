import { visibleWidth } from '@earendil-works/pi-tui'
import { chrome, colours, words } from './theme.ts'
import type { Colour, FoldStart, Style, Theme, ThemeChanges } from './theme.ts'

/** The parts a theme registration may name. */
const parts = ['tones', 'backgrounds', 'marks', 'chrome', 'words', 'folds'] as const

/**
 * A value as an error names it: a string quoted, anything else as JSON or its type.
 */
function named(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value)
  return typeof value
}

/**
 * A record of an author's, or an error naming where it should have been one.
 */
function record(value: unknown, at: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${at} is ${named(value)}, not an object`)
  return value as Record<string, unknown>
}

/**
 * A string of an author's, or an error naming where it should have been one.
 */
function text(value: unknown, at: string): string {
  if (typeof value !== 'string') throw new Error(`${at} is ${named(value)}, not a string`)
  // What a theme says is drawn as it is, never made inert as a node's text is, so a control in it is refused here (ADR 14).
  if (Array.from(value).some(isControl)) throw new Error(`${at} holds a control character, which would reach the terminal as one`)
  return value
}

/**
 * Whether a character is a control: C0, DEL, or C1, any of which a terminal may act on.
 */
function isControl(character: string): boolean {
  const code = character.codePointAt(0) ?? 0
  return code < 0x20 || (code >= 0x7f && code <= 0x9f)
}

/**
 * A border's piece: a string, drawn one column wide, as an ask's border is measured.
 */
function piece(value: unknown, at: string): string {
  const read = text(value, at)
  if (visibleWidth(read) !== 1) throw new Error(`${at} is ${named(read)}, not one column wide`)
  return read
}

/**
 * One of the terminal's sixteen colours, or an error listing them.
 */
function colour(value: unknown, at: string): Colour {
  if (typeof value !== 'string' || !(colours as readonly string[]).includes(value)) throw new Error(`${at} is ${named(value)}, not one of the terminal's sixteen colours: ${colours.join(', ')}`)
  return value as Colour
}

/**
 * A tone's style: its colour, and each attribute a boolean.
 */
function style(value: unknown, at: string): Style {
  const given = record(value, at)
  const read: { color?: Colour, bold?: boolean, dim?: boolean, italic?: boolean, underline?: boolean } = {}
  for (const [key, field] of Object.entries(given)) {
    if (key === 'color') read.color = colour(field, `${at}.color`)
    else if (key === 'bold' || key === 'dim' || key === 'italic' || key === 'underline') {
      if (typeof field !== 'boolean') throw new Error(`${at}.${key} is ${named(field)}, not true or false`)
      read[key] = field
    } else throw new Error(`${at}.${key} is no part of a tone's style: color, bold, dim, italic, underline`)
  }
  return read
}

/**
 * How a kind's folds start: rows a whole number, none or more, and open true or false.
 */
function foldStart(value: unknown, at: string): FoldStart {
  const read: { rows?: number, open?: boolean } = {}
  for (const [key, field] of Object.entries(record(value, at))) {
    if (key === 'rows') {
      if (typeof field !== 'number' || !Number.isInteger(field) || field < 0) throw new Error(`${at}.rows is ${named(field)}, not a whole number of rows`)
      read.rows = field
    } else if (key === 'open') {
      if (typeof field !== 'boolean') throw new Error(`${at}.open is ${named(field)}, not true or false`)
      read.open = field
    } else throw new Error(`${at}.${key} is no part of how folds start: rows, open`)
  }
  return read
}

/**
 * Only the names a part allows, each read by its reader.
 */
function known<T>(value: unknown, at: string, allowed: readonly string[], read: (field: unknown, at: string) => T): Record<string, T> {
  const out: Record<string, T> = {}
  for (const [key, field] of Object.entries(record(value, at))) {
    if (!allowed.includes(key)) throw new Error(`${at}.${key} is no ${at === 'chrome.border' ? 'piece of a border' : `part of ${at}`}: ${allowed.join(', ')}`)
    out[key] = read(field, `${at}.${key}`)
  }
  return out
}

/**
 * Read a theme registration's changes from code binnacle does not own:
 * checked here, where they enter, and copied, so a theme that names what
 * binnacle cannot draw is refused at its registration, and nothing of it
 * runs later.
 * @param value - what the author registered.
 * @param theme - the theme it is laid over, as the registrations leave it now: a mark it has may be changed in part, and a tone it gives, or the changes add, may be named.
 * @returns the changes, as data of binnacle's own.
 * @throws an error beginning `binnacle.theme:` and naming, by its path, what binnacle cannot draw and what it accepts there.
 */
export function parseThemeChanges(value: unknown, theme: Theme): ThemeChanges {
  try {
    const given = record(value, 'the theme') as Readonly<Record<string, unknown>> & { readonly tones?: object }
    const read: Record<string, unknown> = {}
    for (const [part, field] of Object.entries(given)) {
      switch (part) {
        case 'tones':
          read.tones = Object.fromEntries(Object.entries(record(field, 'tones')).map(([name, tone]) => [name, style(tone, `tones.${name}`)]))
          break
        case 'backgrounds':
          read.backgrounds = Object.fromEntries(Object.entries(record(field, 'backgrounds')).map(([name, fill]) => [name, colour(fill, `backgrounds.${name}`)]))
          break
        case 'marks':
          read.marks = Object.fromEntries(Object.entries(record(field, 'marks')).map(([name, mark]) => {
            const at = `marks.${name}`
            const { glyph, tone, ...rest } = record(mark, at)
            const extra = Object.keys(rest)[0]
            if (extra !== undefined) throw new Error(`${at}.${extra} is no part of a mark: glyph, tone`)
            if (theme.marks[name] === undefined && (glyph === undefined || tone === undefined)) throw new Error(`${at} is a mark the theme has none of, so it needs a glyph and a tone`)
            const toned = tone === undefined ? undefined : text(tone, `${at}.tone`)
            if (toned !== undefined && theme.tones[toned] === undefined && !Object.hasOwn(given.tones ?? {}, toned)) throw new Error(`${at}.tone is ${named(toned)}, a tone the theme does not give`)
            return [name, { ...glyph === undefined ? {} : { glyph: text(glyph, `${at}.glyph`) }, ...toned === undefined ? {} : { tone: toned } }]
          }))
          break
        case 'chrome': {
          const { border, ...rest } = record(field, 'chrome')
          // The gutter is measured one column wide, as a border's pieces are.
          const glyphs = known(rest, 'chrome', Object.keys(chrome).filter(key => key !== 'border'), (glyph, at) => at === 'chrome.gutter' ? piece(glyph, at) : text(glyph, at))
          read.chrome = border === undefined ? glyphs : { ...glyphs, border: known(border, 'chrome.border', Object.keys(chrome.border), piece) }
          break
        }
        case 'words':
          read.words = known(field, 'words', Object.keys(words), text)
          break
        case 'folds':
          read.folds = Object.fromEntries(Object.entries(record(field, 'folds')).map(([key, start]) => [key, foldStart(start, `folds.${key}`)]))
          break
        default:
          throw new Error(`${part} is no part of a theme: ${parts.join(', ')}`)
      }
    }
    return read as ThemeChanges
  } catch (error) {
    throw new Error(`binnacle.theme: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}
