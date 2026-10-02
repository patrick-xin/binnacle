import { backgroundAnsi, foregroundAnsi, parseColor } from '@earendil-works/pi-tui'
import type { EditorTheme, MarkdownTheme, TerminalColorMode, TerminalColors, TuiAltScreenOptions } from '@earendil-works/pi-tui'
import type { AffordanceKind } from '../contract/index.ts'
import { deriveColours } from './derived-colours.ts'
import type { DerivedColour, DerivedColours } from './derived-colours.ts'

/** The theme's colours for content, named by what the content means, in the names pi's themes use. */
export const tones = {
  accent: (text: string): string => `\x1b[36m${text}\x1b[39m`,
  muted: (text: string): string => `\x1b[90m${text}\x1b[39m`,
  dim: (text: string): string => `\x1b[2m${text}\x1b[22m`,
  success: (text: string): string => `\x1b[32m${text}\x1b[39m`,
  warning: (text: string): string => `\x1b[33m${text}\x1b[39m`,
  error: (text: string): string => `\x1b[31m${text}\x1b[39m`,
  border: (text: string): string => `\x1b[2m${text}\x1b[22m`,
  borderAccent: (text: string): string => `\x1b[36m${text}\x1b[39m`,
  borderMuted: (text: string): string => `\x1b[2m${text}\x1b[22m`,
  text: (text: string): string => text,
  userMessageText: (text: string): string => text,
  searchMatchText: (text: string): string => `\x1b[36m${text}\x1b[39m`,
  toolTitle: (text: string): string => text,
  toolOutput: (text: string): string => text,
  thinkingText: (text: string): string => `\x1b[2m${text}\x1b[22m`,
  mdHeading: (text: string): string => `\x1b[1m${text}\x1b[22m`,
  mdLink: (text: string): string => `\x1b[36m${text}\x1b[39m`,
  mdLinkUrl: (text: string): string => `\x1b[2m${text}\x1b[22m`,
  mdCode: (text: string): string => `\x1b[33m${text}\x1b[39m`,
  mdCodeBlock: (text: string): string => text,
  mdCodeBlockBorder: (text: string): string => `\x1b[2m${text}\x1b[22m`,
  mdQuote: (text: string): string => `\x1b[2m${text}\x1b[22m`,
  mdQuoteBorder: (text: string): string => `\x1b[2m${text}\x1b[22m`,
  mdHr: (text: string): string => `\x1b[2m${text}\x1b[22m`,
  mdListBullet: (text: string): string => `\x1b[36m${text}\x1b[39m`,
} as const satisfies Record<string, (text: string) => string>

/** A colour of the theme's, by what the content drawn in it means: binnacle's own, or one an author's theme adds. */
export type Tone = keyof typeof tones | (string & {})

/**
 * The theme's backgrounds: what a band is filled with, named by what the
 * content it holds means, as a tone is named by what content drawn in it
 * means.
 */
export const backgrounds = {
  userMessageBg: (text: string): string => `\x1b[100m${text}\x1b[49m`, // what the person sent, headed in a band
  searchMatchBg: (text: string): string => text, // a search's match, on the fullscreen
} as const satisfies Record<string, (text: string) => string>

/** A background of the theme's, by what the content drawn on it means: binnacle's own, or one an author's theme adds. */
export type Background = keyof typeof backgrounds | (string & {})

/**
 * The theme's marks: the glyphs that stand for what a thing is — how a call
 * stands, what went wrong, what a person sent — each with the tone it is
 * drawn in, so a view names a mark and the theme draws it.
 */
export const marks = {
  running: { glyph: '●', tone: 'muted' }, // a call waiting for its result
  done: { glyph: '●', tone: 'success' }, // a call that returned
  failed: { glyph: '✗', tone: 'error' }, // a call that failed
  problem: { glyph: '✗', tone: 'error' }, // what went wrong, said beneath what it concerns
  prompt: { glyph: '›', tone: 'accent' }, // what the person sent
  steer: { glyph: '↳', tone: 'accent' }, // what the person sent while a turn ran, reaching it at its next step
  thinking: { glyph: '∴', tone: 'muted' }, // reasoning
  context: { glyph: '⋯', tone: 'muted' }, // what something added to the context
  approval: { glyph: '⚑', tone: 'warning' }, // an approval the agent asked a person to decide
  unknown: { glyph: '?', tone: 'muted' }, // a kind binnacle has no view for, an author's fact included
  compaction: { glyph: '≡', tone: 'muted' }, // where the model stopped seeing earlier history: one compaction's marker
  presented: { glyph: '▤', tone: 'accent' }, // files the agent handed the person
  retry: { glyph: '↻', tone: 'muted' },
  workflow: { glyph: '◇', tone: 'accent' }, // a workflow run and the agents it set working // a model request dsh tries again after it failed
} as const satisfies Record<string, { readonly glyph: string; readonly tone: Tone }>

/** A mark of the theme's, named by what it stands for: binnacle's own, or one an author's theme adds. */
export type Mark = keyof typeof marks | (string & {})

const lineWord = (count: number): string => (count === 1 ? 'line' : 'lines')

/**
 * The theme's words: what a fold says of itself, named by what the words
 * mean. The chrome draws them as it draws its glyphs, so a person's theme
 * can say them otherwise, as it can reglyph a mark or recolour a tone.
 */
export const words = {
  /** What a fold that shows no rows says it holds, on the line it folds under. */
  holds: (count: number): string => `${count} ${lineWord(count)}`,
  /** What a fold that shows rows says it cut, on the row beneath them. */
  cut: (count: number): string => `${count} more ${lineWord(count)}`,
  /** What an open fold of no rows says on the line it folds under: that it can be folded. */
  less: 'show less',
  /** What opening a fold is called, where a focused fold says what Enter will do. */
  show: (count: number): string => `show ${count} more ${lineWord(count)}`,
  /** What folding a fold of no rows back is called. */
  away: 'fold it away',
  /** What folding a fold of rows back is called. */
  to: (count: number): string => `fold to ${count} ${lineWord(count)}`,
  /** What the keys that invoke what has focus in an ask do, as its bottom edge names them. */
  select: 'select',
  /** What the keys that move focus on in an ask do, as its bottom edge names them. */
  next: 'next',
  /** What each kind of offer does, said where an offer names no label of its own. */
  'offer.expand': 'expand',
  'offer.choose': 'choose',
  'offer.open': 'open',
  'offer.copy': 'copy',
  'offer.answer': 'answer',
  'offer.grant': 'allow',
  'offer.dismiss': 'dismiss',
} as const satisfies { readonly [kind in AffordanceKind as `offer.${kind}`]: string } & Readonly<
  Record<string, string | ((count: number) => string)>
>

/** The words that say no count: each is said as it is, where the rest are templates of a count. */
const plainWords = [
  'less',
  'away',
  'select',
  'next',
  'offer.expand',
  'offer.choose',
  'offer.open',
  'offer.copy',
  'offer.answer',
  'offer.grant',
  'offer.dismiss',
] as const

type PlainWord = (typeof plainWords)[number]

/**
 * The theme's chrome: the glyphs the chrome — the focus row, a cut fold, a
 * border an ask is framed in, the jump label — draws with, named beside the marks. A view
 * names none of it; the ui and the host do, so what they draw is the theme's
 * as a mark is.
 */
export const chrome = {
  /** What a focused region's row, and a focused cut fold's marker, opens with. */
  focus: '▸',
  /** What an unfocused cut fold's marker opens with, saying lines were cut. */
  cut: '…',
  /** What a fold that shows no rows separates the line it folds under from what that line says it holds. */
  separator: '·',
  /** The rounded border an ask is framed in, in its pieces. */
  border: { topLeft: '╭', horizontal: '─', topRight: '╮', side: '│', bottomLeft: '╰', bottomRight: '╯' },
  /** What the jump label names, to come down to the end. */
  jump: '↓',
  /** What runs down beside what a show holds, marking it as what the surface shows and did not write. */
  gutter: '│',
} as const

/**
 * The theme's attributes, each closed by the parameter that ends it alone, so
 * one attribute laid inside another leaves the other standing.
 */
const attributes = {
  bold: (text: string): string => `\x1b[1m${text}\x1b[22m`,
  italic: (text: string): string => `\x1b[3m${text}\x1b[23m`,
  underline: (text: string): string => `\x1b[4m${text}\x1b[24m`,
  strikethrough: (text: string): string => `\x1b[9m${text}\x1b[29m`,
} as const satisfies Record<string, (text: string) => string>

export const markdownTheme: MarkdownTheme = markdownIn(tones)

function markdownIn(toned: Theme['tones']): MarkdownTheme {
  return {
    heading: toned.mdHeading,
    link: toned.mdLink,
    linkUrl: toned.mdLinkUrl,
    code: toned.mdCode,
    codeBlock: toned.mdCodeBlock,
    codeBlockBorder: toned.mdCodeBlockBorder,
    quote: toned.mdQuote,
    quoteBorder: toned.mdQuoteBorder,
    hr: toned.mdHr,
    listBullet: toned.mdListBullet,
    bold: attributes.bold,
    italic: attributes.italic,
    underline: attributes.underline,
    strikethrough: attributes.strikethrough,
  }
}

/** The composer's theme, read from the current theme each time it draws, so a registration coming or going restyles it. */
export function editorThemeOf(current: () => Theme): EditorTheme {
  const tone =
    (name: keyof typeof tones) =>
    (text: string): string =>
      current().tones[name](text)
  return {
    borderColor: tone('borderMuted'),
    selectList: {
      selectedPrefix: tone('accent'),
      selectedText: tone('accent'),
      description: tone('muted'),
      scrollInfo: tone('muted'),
      noMatch: tone('muted'),
    },
  }
}

/** How the fullscreen draws a search's matches, read from the current theme each time it draws. */
export function searchStylesOf(current: () => Theme): Required<Pick<TuiAltScreenOptions, 'searchMatchStyle' | 'searchCurrentMatchStyle'>> {
  return {
    searchMatchStyle: (text) => current().backgrounds.searchMatchBg(current().tones.searchMatchText(text)),
    searchCurrentMatchStyle: (text) => attributes.bold(current().backgrounds.searchMatchBg(current().tones.searchMatchText(text))),
  }
}

/** A theme: each part of binnacle's own, or as registrations changed it. */
export interface Theme {
  readonly tones: { readonly [name in keyof typeof tones]: (text: string) => string } & {
    readonly [name: string]: ((text: string) => string) | undefined
  }
  readonly backgrounds: { readonly [name in keyof typeof backgrounds]: (text: string) => string } & {
    readonly [name: string]: ((text: string) => string) | undefined
  }
  readonly marks: { readonly [name in keyof typeof marks]: { readonly glyph: string; readonly tone: Tone } } & {
    readonly [name: string]: { readonly glyph: string; readonly tone: Tone } | undefined
  }
  readonly chrome: { readonly [part in Exclude<keyof typeof chrome, 'border'>]: string } & {
    readonly border: { readonly [piece in keyof typeof chrome.border]: string }
  }
  readonly words: { readonly [word in Exclude<keyof typeof words, PlainWord>]: (count: number) => string } & {
    readonly [word in PlainWord]: string
  }
  readonly markdown: MarkdownTheme
  readonly folds: { readonly [key: string]: FoldStart | undefined }
}

/** How a kind of entry's folds start, when a fold does not say. */
export interface FoldStart {
  /** How many rows each shows while folded. */
  readonly rows?: number
  /** Whether each starts open, until a person folds it. */
  readonly open?: boolean
}

/** binnacle's own theme, which registrations change. */
export const binnacleTheme: Theme = {
  tones,
  backgrounds,
  marks,
  chrome,
  words,
  markdown: markdownTheme,
  folds: {
    answer: { rows: 0 },
    streaming: { rows: 0 },
    context: { rows: 0 },
    unknown: { rows: 0 },
    authored: { rows: 0 },
    compaction: { rows: 0 },
    retry: { rows: 0 },
    tool: { rows: 3 },
    result: { rows: 3 },
  },
}

/**
 * What an author's theme registration changes: data alone, each part naming only what it changes, so what it leaves out is as the theme beneath it has it.
 */
export interface ThemeChanges extends ThemeVariant {
  /** What changes on a light terminal, laid over the rest; its vars may name the rest's. */
  readonly light?: ThemeVariant
  /** What changes on a dark terminal, laid over the rest; its vars may name the rest's. */
  readonly dark?: ThemeVariant
}

/** What a theme registration changes on one appearance of the terminal, or on either. */
export interface ThemeVariant {
  /** Colours named once, so a tone, its background or a background may give one by its name; a name here is read before one of the sixteen's, and may name another var, before or after it. */
  readonly vars?: { readonly [name: string]: Colour }
  /** Tones, by name — binnacle's, or new ones a view may then name: the colour and attributes each is drawn in, replacing how the theme beneath drew it. */
  readonly tones?: { readonly [name: string]: Style }
  /** Backgrounds, by name — binnacle's, or new ones a band or an ask may then be filled with: a colour, in any form a colour may take. */
  readonly backgrounds?: { readonly [name: string]: Colour }
  /** The chrome's glyphs, each named part replacing the one beneath; a border's pieces one at a time. The gutter and a border's pieces are each one column wide. */
  readonly chrome?: {
    readonly focus?: string
    readonly cut?: string
    readonly separator?: string
    readonly jump?: string
    readonly gutter?: string
    readonly border?: { readonly [piece in keyof typeof chrome.border]?: string }
  }
  /**
   * What a fold says of itself, each a template: `{n}` is the count of lines, and `{lines}` the word for that many (`line` or `lines`). `less` and `away` count nothing.
   */
  readonly words?: { readonly [word in keyof typeof words]?: string }
  /** How each kind of entry's folds start, by the key its views are registered under — an entry kind, a quiet kind's dsh type, an authored fact's name — falling back to its kind when no start is given for its key, when a fold does not say. */
  readonly folds?: { readonly [key: string]: FoldStart }
  /** Marks, by name: a glyph, a tone, or both. */
  readonly marks?: { readonly [name: string]: { readonly glyph?: string; readonly tone?: Tone } }
}

/** The terminal's sixteen colours, by the names a theme registration gives them, in the order their codes run. */
export const colours = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'bright-black',
  'bright-red',
  'bright-green',
  'bright-yellow',
  'bright-blue',
  'bright-magenta',
  'bright-cyan',
  'bright-white',
] as const

/** One of the terminal's sixteen colours, so a person's palette decides what it looks like. */
export type Sixteen = (typeof colours)[number]

/**
 * A colour: one of the terminal's sixteen by name, which the person's palette
 * decides; a 256-colour index, 0 to 255; or an exact colour, as `#rrggbb`,
 * `#rgb`, `okhsl(h s% l%)` or `oklch(l c h)`.
 */
export type Colour = Sixteen | number | (string & {})

/** How a tone draws, as data: a colour of the terminal's, and attributes, each drawn inside the colour. */
export interface Style {
  /** The colour; the terminal's own foreground when absent. */
  readonly color?: Colour
  /** The colour behind it; the terminal's own background when absent. */
  readonly background?: Colour
  /** Drawn bold. */
  readonly bold?: boolean
  /** Drawn dim. */
  readonly dim?: boolean
  /** Drawn in italics. */
  readonly italic?: boolean
  /** Drawn underlined. */
  readonly underline?: boolean
}

function styled(style: Style, mode: TerminalColorMode): (text: string) => string {
  const wraps: ((text: string) => string)[] = []
  if (style.bold === true) wraps.push(attributes.bold)
  if (style.dim === true) wraps.push((text) => `\x1b[2m${text}\x1b[22m`)
  if (style.italic === true) wraps.push(attributes.italic)
  if (style.underline === true) wraps.push(attributes.underline)
  const colour = style.color
  if (colour !== undefined) {
    const opening = foreground(colour, mode)
    wraps.push((text) => `${opening}${text}\x1b[39m`)
  }
  if (style.background !== undefined) wraps.push(filling(style.background, mode))
  return (text) => wraps.reduce((inner, wrap) => wrap(inner), text)
}

/** The opening of a colour: the sixteen keep their own codes, which a terminal of sixteen colours draws in its palette. */
function foreground(colour: Colour, mode: TerminalColorMode): string {
  const index = (colours as readonly unknown[]).indexOf(colour)
  if (index >= 0) return `\x1b[${index < 8 ? 30 + index : 90 + index - 8}m`
  return foregroundAnsi(parseColor(colour as string | number), mode)
}

function counting(template: string): (count: number) => string {
  return (count) => template.replaceAll('{n}', String(count)).replaceAll('{lines}', lineWord(count))
}

function filling(colour: Colour, mode: TerminalColorMode): (text: string) => string {
  const index = (colours as readonly unknown[]).indexOf(colour)
  const opening =
    index >= 0 ? `\x1b[${index < 8 ? 40 + index : 100 + index - 8}m` : backgroundAnsi(parseColor(colour as string | number), mode)
  return (text) => `${opening}${text}\x1b[49m`
}

/** What binnacle knows of the terminal it draws on. */
export interface TerminalLook {
  /** Whether the terminal is light or dark; unknown until it says, or binnacle reads it. */
  readonly appearance?: 'light' | 'dark'
  /** How many colours an exact colour may be drawn in. */
  readonly mode: TerminalColorMode
  /** What the terminal reported of its colours; binnacle's own tones and backgrounds are derived from it where it reported its background. */
  readonly reported?: TerminalColors
}

/** binnacle's own tones and backgrounds in the colours derived for a terminal, each keeping its attributes. */
function derivedChanges(derived: DerivedColours): ThemeChanges {
  const colour = (token: string): Colour | undefined => {
    const given = (derived.colours as Readonly<Record<string, DerivedColour | undefined>>)[token]
    return given?.kind === 'hex' ? given.hex : given?.kind === 'index' ? given.index : undefined
  }
  const tonesNow: Record<string, Style> = {}
  for (const token of Object.keys(tones)) {
    const given = colour(token)
    tonesNow[token] = { ...(given === undefined ? {} : { color: given }), ...(token === 'mdHeading' ? { bold: true } : {}) }
  }
  const filled: Record<string, Colour> = {}
  for (const token of Object.keys(backgrounds)) {
    const given = colour(token)
    if (given !== undefined) filled[token] = given
  }
  return { tones: tonesNow, backgrounds: filled }
}

/**
 * A theme with changes laid over it, oldest first, each over what the ones before it left, and each change's
 * variant for the terminal's appearance over that change.
 */
export function themed(base: Theme, registered: readonly ThemeChanges[], look: TerminalLook = { mode: 'truecolor' }): Theme {
  const variant = look.appearance
  const derived = look.reported?.background === undefined ? [] : [derivedChanges(deriveColours(look.reported, look.appearance))]
  const changes: readonly ThemeVariant[] = [...derived, ...registered].flatMap((change) => {
    const varied = variant === undefined ? undefined : change[variant]
    return varied === undefined ? [change] : [change, varied]
  })
  const marked: Record<string, { readonly glyph: string; readonly tone: Tone } | undefined> = { ...base.marks }
  for (const change of changes) {
    for (const [name, mark] of Object.entries(change.marks ?? {})) {
      const beneath = marked[name]
      const glyph = mark.glyph ?? beneath?.glyph
      const tone = mark.tone ?? beneath?.tone
      if (glyph !== undefined && tone !== undefined) marked[name] = { glyph, tone }
    }
  }
  const toned: Record<string, ((text: string) => string) | undefined> = { ...base.tones }
  for (const change of changes) {
    for (const [name, style] of Object.entries(change.tones ?? {})) if (style !== undefined) toned[name] = styled(style, look.mode)
  }
  const filled: Record<string, ((text: string) => string) | undefined> = { ...base.backgrounds }
  for (const change of changes) {
    for (const [name, colour] of Object.entries(change.backgrounds ?? {})) filled[name] = filling(colour, look.mode)
  }
  let glyphs: Theme['chrome'] = base.chrome
  let said: Theme['words'] = base.words
  for (const change of changes) {
    const { border, ...rest } = change.chrome ?? {}
    glyphs = { ...glyphs, ...rest, border: { ...glyphs.border, ...border } }
    for (const [word, template] of Object.entries(change.words ?? {})) {
      if (template === undefined) continue
      said = (plainWords as readonly string[]).includes(word) ? { ...said, [word]: template } : { ...said, [word]: counting(template) }
    }
  }
  let starts: Theme['folds'] = base.folds
  for (const change of changes) {
    for (const [key, start] of Object.entries(change.folds ?? {})) starts = { ...starts, [key]: { ...starts[key], ...start } }
  }
  const tonesNow = toned as Theme['tones']
  return {
    ...base,
    folds: starts,
    chrome: glyphs,
    words: said,
    tones: tonesNow,
    backgrounds: filled as Theme['backgrounds'],
    marks: marked as Theme['marks'],
    markdown: markdownIn(tonesNow),
  }
}
