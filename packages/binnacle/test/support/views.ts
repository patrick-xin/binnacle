/**
 * The views more than one test builds: an author's view drawn the same way
 * wherever a test feeds it.
 * @module binnacle/test/support/views
 */
import type { View } from '../../src/api.ts'

/**
 * An author's view that names one fold, alike, in every entry it draws: each prompt's text, folded to its first line. The view whose regions only the entry it draws can tell apart.
 */
export const foldedAlike: View = (entry) => ({
  kind: 'fold',
  id: 'mine',
  rows: 1,
  child: { kind: 'text', text: entry.kind === 'prompt' ? entry.fact.blocks.map(block => block.kind === 'unread' ? '' : block.text).join('\n') : '' },
})
