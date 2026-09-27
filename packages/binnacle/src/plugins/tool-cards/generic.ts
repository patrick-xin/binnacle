/**
 * The generic card: a titled call, and a completed call that folds the
 * content its tool presented — or the result's own text when it presented
 * none. Every kind with no row of its own draws through this one.
 */

import type { CardRow } from './cards.ts'
import { textOfPresented } from './presentation.ts'

/** The generic card's row. */
export const genericCard: CardRow = {
  pending: () => [],
  folded: view => view.content === undefined ? undefined : { kind: 'text', text: textOfPresented(view.content) },
}
