/**
 * The theme pi-tui's components are drawn in: plain text, unstyled.
 */

import type { EditorTheme } from '@earendil-works/pi-tui'

/** Leave text as it is. */
const plain = (text: string): string => text

/** The composer's theme. */
export const editorTheme: EditorTheme = {
  borderColor: plain,
  selectList: { selectedPrefix: plain, selectedText: plain, description: plain, scrollInfo: plain, noMatch: plain },
}
