/**
 * The theme pi-tui's components are drawn in: plain, until binnacle has one.
 * @module binnacle/ui/theme
 */

import type { EditorTheme } from '@earendil-works/pi-tui'

/**
 * Leave text as it is.
 * @param text - the text.
 * @returns it, unstyled.
 */
const plain = (text: string): string => text

/** The composer's theme. */
export const editorTheme: EditorTheme = {
  borderColor: plain,
  selectList: { selectedPrefix: plain, selectedText: plain, description: plain, scrollInfo: plain, noMatch: plain },
}
