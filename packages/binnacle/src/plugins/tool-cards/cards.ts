/**
 * The table of cards: which kind of card draws how, generic its one row.
 *
 * A kind with no row of its own draws through generic's until its own
 * lands. A later card is a new file beside this one, holding its row, plus
 * one row here naming it — touching nothing else.
 */

import type { Node } from '../../api.ts'
import { genericCard } from './generic.ts'
import type { CardKind, PresentedCall, PresentedResult } from './presentation.ts'

/**
 * How one kind of card draws: what its call view shows beneath the head
 * while the call runs, and what its result view folds beneath the head once
 * the call returns — or undefined, to fold the result's own text.
 */
export interface CardRow {
  /** What a pending call's view shows beneath its head, beyond the head itself. */
  pending(view: PresentedCall): readonly Node[]
  /** What a completed call's result view folds beneath its head; undefined to fold the result's own text. */
  folded(view: PresentedResult): Node | undefined
}

/** Every row the cards hold, by the card kind it draws; generic's is the one today. */
const table: Readonly<Partial<Record<CardKind, CardRow>>> = { generic: genericCard }

/**
 * The row that draws a card kind: its own when the table holds one, generic's until it lands.
 * @param kind - the card kind a presenter declared.
 * @returns its row.
 */
export function rowFor(kind: CardKind): CardRow {
  return table[kind] ?? genericCard
}
