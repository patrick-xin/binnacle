/**
 * The theme binnacle draws in: the composer plain, and content in tones.
 *
 * A tone is drawn in one of the terminal's own sixteen colours, so a person's
 * palette decides what it looks like, as their terminal already does.
 */

import type { EditorTheme } from '@earendil-works/pi-tui'

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

/** The composer's theme. */
export const editorTheme: EditorTheme = {
  borderColor: plain,
  selectList: { selectedPrefix: plain, selectedText: plain, description: plain, scrollInfo: plain, noMatch: plain },
}
