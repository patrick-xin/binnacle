/**
 * The theme binnacle draws in: content in tones, a glyph as a mark a view
 * names or as one the chrome draws with, a band in a background a view
 * names, a markdown document in the tones and the attributes, and the
 * composer framed in dim with its select list in accent and muted.
 *
 * A tone is drawn in one of the terminal's own sixteen colours, so a person's
 * palette decides what it looks like, as their terminal already does; so is
 * a background, in one of the sixteen the terminal fills with.
 */

import type { EditorTheme, MarkdownTheme } from '@earendil-works/pi-tui'

/** Leave text as it is. */
const plain = (text: string): string => text

/**
 * The theme's colours for content, named by what the content means; the names
 * are pi's (`pi:packages/coding-agent/docs/themes.md`).
 */
export const tones = {
  accent: (text: string): string => `\x1b[36m${text}\x1b[39m`,
  muted: (text: string): string => `\x1b[90m${text}\x1b[39m`,
  dim: (text: string): string => `\x1b[2m${text}\x1b[22m`,
  success: (text: string): string => `\x1b[32m${text}\x1b[39m`,
  warning: (text: string): string => `\x1b[33m${text}\x1b[39m`,
  error: (text: string): string => `\x1b[31m${text}\x1b[39m`,
} as const satisfies Record<string, (text: string) => string>

/** A colour of the theme's, by what the content drawn in it means: binnacle's own, or one an author's theme adds. */
export type Tone = keyof typeof tones | (string & {})

/**
 * The theme's backgrounds: what a band is filled with, named by what the
 * content it holds means, as a tone is named by what content drawn in it
 * means.
 */
export const backgrounds = {
  prompt: (text: string): string => `\x1b[100m${text}\x1b[49m`, // what the person sent, headed in a band
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
  thinking: { glyph: '∴', tone: 'muted' }, // reasoning
  context: { glyph: '⋯', tone: 'muted' }, // what something added to the context
  unknown: { glyph: '?', tone: 'muted' }, // a kind binnacle has no view for, an author's fact included
} as const satisfies Record<string, { readonly glyph: string, readonly tone: Tone }>

/** A mark of the theme's, named by what it stands for: binnacle's own, or one an author's theme adds. */
export type Mark = keyof typeof marks | (string & {})

/** The word for a count of lines. */
const lineWord = (count: number): string => count === 1 ? 'line' : 'lines'

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
} as const

/**
 * The theme's chrome: the glyphs the chrome — the focus row, a cut fold, a
 * card's border, the jump label — draws with, named beside the marks. A view
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
  /** A card's rounded border, in its pieces. */
  border: { topLeft: '╭', horizontal: '─', topRight: '╮', side: '│', bottomLeft: '╰', bottomRight: '╯' },
  /** What the jump label names, to come down to the end. */
  jump: '↓',
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

/**
 * The theme a markdown document is drawn in, following the terminal theme's
 * mapping: a heading is bold, a link and a list bullet accent, inline code
 * warning, and a quotation, its border, a rule and a code block's border dim.
 * Nothing is highlighted, so a fenced block's lines are the terminal's own.
 */
export const markdownTheme: MarkdownTheme = markdownIn(tones)

/**
 * The markdown theme in a theme's tones, so a document follows a tone an author recolours.
 * @param toned - the tones.
 * @returns the markdown theme.
 */
function markdownIn(toned: Theme['tones']): MarkdownTheme {
  return {
    heading: attributes.bold,
    link: toned.accent,
    linkUrl: toned.dim,
    code: toned.warning,
    codeBlock: plain,
    codeBlockBorder: toned.dim,
    quote: toned.dim,
    quoteBorder: toned.dim,
    hr: toned.dim,
    listBullet: toned.accent,
    bold: attributes.bold,
    italic: attributes.italic,
    underline: attributes.underline,
    strikethrough: attributes.strikethrough,
  }
}

/**
 * The composer's theme: its border is the dim chrome nobody reads, and in its
 * select list the chosen row is accent while what supports a choice — the
 * description, the scroll state, a row that matches nothing — is muted.
 */
export const editorTheme: EditorTheme = {
  borderColor: tones.dim,
  selectList: { selectedPrefix: tones.accent, selectedText: tones.accent, description: tones.muted, scrollInfo: tones.muted, noMatch: tones.muted },
}

/** A theme, as drawing reads it: each part of binnacle's own, or as registrations changed it. */
export interface Theme {
  /** Each tone, drawing text in its colour. */
  readonly tones: { readonly [name in keyof typeof tones]: (text: string) => string } & { readonly [name: string]: ((text: string) => string) | undefined }
  /** Each background, filling a band's lines. */
  readonly backgrounds: { readonly [name in keyof typeof backgrounds]: (text: string) => string } & { readonly [name: string]: ((text: string) => string) | undefined }
  /** Each mark: its glyph, and the tone it is drawn in. */
  readonly marks: { readonly [name in keyof typeof marks]: { readonly glyph: string, readonly tone: Tone } } & { readonly [name: string]: { readonly glyph: string, readonly tone: Tone } | undefined }
  /** The chrome's glyphs. */
  readonly chrome: typeof chrome
  /** What a fold says of itself. */
  readonly words: typeof words
  /** The styles a markdown document is drawn in. */
  readonly markdown: MarkdownTheme
}

/** binnacle's own theme, which registrations change. */
export const binnacleTheme: Theme = { tones, backgrounds, marks, chrome, words, markdown: markdownTheme }

/**
 * What an author's theme registration changes: data alone, each part naming only what it changes, so what it leaves out is as the theme beneath it has it.
 */
export interface ThemeChanges {
  /** Tones, by name — binnacle's, or new ones a view may then name: the colour and attributes each is drawn in, replacing how the theme beneath drew it. */
  readonly tones?: { readonly [name: string]: Style }
  /** Marks, by name: a glyph, a tone, or both. */
  readonly marks?: { readonly [name: string]: { readonly glyph?: string, readonly tone?: Tone } }
}

/** The terminal's sixteen colours, by the names a theme registration gives them, in the order their codes run. */
export const colours = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'bright-black', 'bright-red', 'bright-green', 'bright-yellow', 'bright-blue', 'bright-magenta', 'bright-cyan', 'bright-white'] as const

/** One of the terminal's sixteen colours, so a person's palette decides what it looks like. */
export type Colour = typeof colours[number]

/** How a tone draws, as data: a colour of the terminal's, and attributes, each drawn inside the colour. */
export interface Style {
  /** The colour; the terminal's own foreground when absent. */
  readonly color?: Colour
  /** Drawn bold. */
  readonly bold?: boolean
  /** Drawn dim. */
  readonly dim?: boolean
  /** Drawn in italics. */
  readonly italic?: boolean
  /** Drawn underlined. */
  readonly underline?: boolean
}

/**
 * What a style draws with: each attribute closed by the parameter that ends it alone, inside the colour, closed by the default foreground.
 * @param style - the style.
 * @returns text drawn in it.
 */
function styled(style: Style): (text: string) => string {
  const wraps: ((text: string) => string)[] = []
  if (style.bold === true) wraps.push(attributes.bold)
  if (style.dim === true) wraps.push(text => `\x1b[2m${text}\x1b[22m`)
  if (style.italic === true) wraps.push(attributes.italic)
  if (style.underline === true) wraps.push(attributes.underline)
  const colour = style.color
  if (colour !== undefined) {
    const index = colours.indexOf(colour)
    const code = index < 8 ? 30 + index : 90 + index - 8
    wraps.push(text => `\x1b[${code}m${text}\x1b[39m`)
  }
  return text => wraps.reduce((inner, wrap) => wrap(inner), text)
}

/**
 * A theme with changes laid over it, oldest first, each over what the ones before it left.
 * @param base - the theme beneath them.
 * @param changes - each registration's changes, oldest first.
 * @returns a new theme, even when nothing changed, so what was kept against the old one is stale.
 */
export function themed(base: Theme, changes: readonly ThemeChanges[]): Theme {
  const marked: Record<string, { readonly glyph: string, readonly tone: Tone } | undefined> = { ...base.marks }
  for (const change of changes) {
    for (const [name, mark] of Object.entries(change.marks ?? {})) {
      const beneath = marked[name]
      if (beneath !== undefined && mark !== undefined) marked[name] = { glyph: mark.glyph ?? beneath.glyph, tone: mark.tone ?? beneath.tone }
    }
  }
  const toned: Record<string, ((text: string) => string) | undefined> = { ...base.tones }
  for (const change of changes) {
    for (const [name, style] of Object.entries(change.tones ?? {})) if (style !== undefined) toned[name] = styled(style)
  }
  const tonesNow = toned as Theme['tones']
  return { ...base, tones: tonesNow, marks: marked as Theme['marks'], markdown: markdownIn(tonesNow) }
}
