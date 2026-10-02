import { parseColor, visibleWidth } from '@earendil-works/pi-tui'
import { binnacleTheme, chrome, colours, frames, themed, words } from './theme.ts'
import type { Colour, FoldStart, Style, Theme, ThemeChanges } from './theme.ts'

const parts = ['vars', 'tones', 'backgrounds', 'marks', 'chrome', 'words', 'folds', 'spacing', 'light', 'dark'] as const

function named(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value)
  return typeof value
}

function record(value: unknown, at: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${at} is ${named(value)}, not an object`)
  return value as Record<string, unknown>
}

function text(value: unknown, at: string): string {
  if (typeof value !== 'string') throw new Error(`${at} is ${named(value)}, not a string`)
  // What a theme says is drawn as it is, never made inert as a node's text is, so a control in it is refused.
  if (Array.from(value).some(isControl)) throw new Error(`${at} holds a control character, which would reach the terminal as one`)
  return value
}

function isControl(character: string): boolean {
  const code = character.codePointAt(0) ?? 0
  return code < 0x20 || (code >= 0x7f && code <= 0x9f)
}

function oneOf(value: unknown, at: string, allowed: readonly string[], what: string): string {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new Error(`${at} is ${named(value)}, not ${what}: ${allowed.join(', ')}`)
  return value
}

/** A theme's vars, each following the names it gives, among them or the ones beneath, to a colour. */
function resolved(given: Readonly<Record<string, unknown>>, outer: Vars): Vars {
  const read = new Map<string, Colour>()
  const follow = (name: string, through: readonly string[]): Colour => {
    const done = read.get(name)
    if (done !== undefined) return done
    const value = given[name]
    const aliased = typeof value === 'string' && Object.hasOwn(given, value)
    if (aliased && (value === name || through.includes(value)))
      throw new Error(`vars.${through[0] ?? name} names itself, through ${[...through.slice(1), name].join(', ')}`)
    const found = aliased ? follow(value, [...through, name]) : colour(value, `vars.${name}`, outer)
    read.set(name, found)
    return found
  }
  for (const name of Object.keys(given)) follow(name, [])
  return Object.fromEntries(read)
}

function piece(value: unknown, at: string): string {
  const read = text(value, at)
  if (visibleWidth(read) !== 1) throw new Error(`${at} is ${named(read)}, not one column wide`)
  return read
}

type Vars = Readonly<Record<string, Colour>>

function colour(value: unknown, at: string, vars: Vars = {}): Colour {
  if (typeof value === 'string' && Object.hasOwn(vars, value)) return vars[value] as Colour
  if (typeof value === 'string' && (colours as readonly string[]).includes(value)) return value
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255) return value
  if (typeof value === 'string') {
    try {
      parseColor(value)
      return value
    } catch {
      // Refused below, naming every form a colour may take.
    }
  }
  throw new Error(
    `${at} is ${named(value)}, not a colour: one of the terminal's sixteen (${colours.join(', ')}), a 256-colour index from 0 to 255, #rrggbb, okhsl(h s% l%), oklch(l c h), or a name among the theme's vars`,
  )
}

function style(value: unknown, at: string, vars: Vars): Style {
  const given = record(value, at)
  const read: { color?: Colour; background?: Colour; bold?: boolean; dim?: boolean; italic?: boolean; underline?: boolean } = {}
  for (const [key, field] of Object.entries(given)) {
    if (key === 'color' || key === 'background') read[key] = colour(field, `${at}.${key}`, vars)
    else if (key === 'bold' || key === 'dim' || key === 'italic' || key === 'underline') {
      if (typeof field !== 'boolean') throw new Error(`${at}.${key} is ${named(field)}, not true or false`)
      read[key] = field
    } else throw new Error(`${at}.${key} is no part of a tone's style: color, background, bold, dim, italic, underline`)
  }
  return read
}

function foldStart(value: unknown, at: string): FoldStart {
  const read: { rows?: number; open?: boolean } = {}
  for (const [key, field] of Object.entries(record(value, at))) {
    if (key === 'rows') {
      if (typeof field !== 'number' || !Number.isInteger(field) || field < 0)
        throw new Error(`${at}.rows is ${named(field)}, not a whole number of rows`)
      read.rows = field
    } else if (key === 'open') {
      if (typeof field !== 'boolean') throw new Error(`${at}.open is ${named(field)}, not true or false`)
      read.open = field
    } else throw new Error(`${at}.${key} is no part of how folds start: rows, open`)
  }
  return read
}

function known<T>(value: unknown, at: string, allowed: readonly string[], read: (field: unknown, at: string) => T): Record<string, T> {
  const out: Record<string, T> = {}
  for (const [key, field] of Object.entries(record(value, at))) {
    if (!allowed.includes(key))
      throw new Error(`${at}.${key} is no ${at === 'chrome.border' ? 'piece of a border' : `part of ${at}`}: ${allowed.join(', ')}`)
    out[key] = read(field, `${at}.${key}`)
  }
  return out
}

export function parseThemeChanges(value: unknown, theme: Theme): ThemeChanges {
  try {
    return parsed(record(value, 'the theme'), theme, {}, true)
  } catch (error) {
    throw new Error(`binnacle.theme: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}

function parsed(
  given: Readonly<Record<string, unknown>> & { readonly tones?: object },
  theme: Theme,
  outer: Vars,
  varied: boolean,
): ThemeChanges {
  const read: Record<string, unknown> = {}
  const vars: Vars = given.vars === undefined ? outer : { ...outer, ...resolved(record(given.vars, 'vars'), outer) }
  for (const [part, field] of Object.entries(given)) {
    switch (part) {
      case 'vars':
        break
      case 'light':
      case 'dark':
        if (!varied) throw new Error(`${part} is no part of a variant, which holds no variant of its own`)
        break
      case 'tones':
        read.tones = Object.fromEntries(
          Object.entries(record(field, 'tones')).map(([name, tone]) => [name, style(tone, `tones.${name}`, vars)]),
        )
        break
      case 'backgrounds':
        read.backgrounds = Object.fromEntries(
          Object.entries(record(field, 'backgrounds')).map(([name, fill]) => [name, colour(fill, `backgrounds.${name}`, vars)]),
        )
        break
      case 'marks':
        read.marks = Object.fromEntries(
          Object.entries(record(field, 'marks')).map(([name, mark]) => {
            const at = `marks.${name}`
            const { glyph, tone, ...rest } = record(mark, at)
            const extra = Object.keys(rest)[0]
            if (extra !== undefined) throw new Error(`${at}.${extra} is no part of a mark: glyph, tone`)
            if (theme.marks[name] === undefined && (glyph === undefined || tone === undefined))
              throw new Error(`${at} is a mark the theme has none of, so it needs a glyph and a tone`)
            const toned = tone === undefined ? undefined : text(tone, `${at}.tone`)
            if (toned !== undefined && theme.tones[toned] === undefined && !Object.hasOwn(given.tones ?? {}, toned))
              throw new Error(`${at}.tone is ${named(toned)}, a tone the theme does not give`)
            return [
              name,
              { ...(glyph === undefined ? {} : { glyph: text(glyph, `${at}.glyph`) }), ...(toned === undefined ? {} : { tone: toned }) },
            ]
          }),
        )
        break
      case 'chrome': {
        const { border, frame, ...rest } = record(field, 'chrome')
        // The gutter is measured one column wide, as a border's pieces are.
        const glyphs = known(
          rest,
          'chrome',
          Object.keys(chrome).filter((key) => key !== 'border'),
          (glyph, at) => (at === 'chrome.gutter' ? piece(glyph, at) : text(glyph, at)),
        )
        const framed = frame === undefined ? glyphs : { ...glyphs, frame: oneOf(frame, 'chrome.frame', Object.keys(frames), 'a frame') }
        read.chrome =
          border === undefined ? framed : { ...framed, border: known(border, 'chrome.border', Object.keys(chrome.border), piece) }
        break
      }
      case 'words':
        read.words = known(field, 'words', Object.keys(words), text)
        break
      case 'spacing':
        read.spacing = known(field, 'spacing', Object.keys(binnacleTheme.spacing), (room, at) => {
          if (typeof room !== 'number' || !Number.isInteger(room) || room < 0)
            throw new Error(`${at} is ${named(room)}, not a whole number of columns or rows`)
          return room
        })
        break
      case 'folds':
        read.folds = Object.fromEntries(
          Object.entries(record(field, 'folds')).map(([key, start]) => [key, foldStart(start, `folds.${key}`)]),
        )
        break
      default:
        throw new Error(`${part} is no part of a theme: ${parts.join(', ')}`)
    }
  }
  // A variant is laid over the rest of its theme, so it is read against the theme with the rest laid over it.
  const beneath = themed(theme, [read as ThemeChanges])
  for (const part of ['light', 'dark'] as const) {
    if (given[part] === undefined) continue
    try {
      read[part] = parsed(record(given[part], part), beneath, vars, false)
    } catch (error) {
      throw new Error(`${part}.${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
  }
  return read as ThemeChanges
}
