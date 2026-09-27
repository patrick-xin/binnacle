/**
 * The theme binnacle draws in: content in tones, a markdown document in
 * the tones and the attributes, and the composer framed in dim with its
 * select list in accent and muted.
 *
 * A tone is drawn in one of the terminal's own sixteen colours, so a person's
 * palette decides what it looks like, as their terminal already does.
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

/** A colour of the theme's, by what the content drawn in it means. */
export type Tone = keyof typeof tones

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
export const markdownTheme: MarkdownTheme = {
  heading: attributes.bold,
  link: tones.accent,
  linkUrl: tones.dim,
  code: tones.warning,
  codeBlock: plain,
  codeBlockBorder: tones.dim,
  quote: tones.dim,
  quoteBorder: tones.dim,
  hr: tones.dim,
  listBullet: tones.accent,
  bold: attributes.bold,
  italic: attributes.italic,
  underline: attributes.underline,
  strikethrough: attributes.strikethrough,
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
