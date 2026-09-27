/**
 * The table of cards: which kind of card draws how, generic its one row.
 *
 * A kind with no row of its own draws through generic's until its own
 * lands. A later card is a new file beside this one, holding its row, plus
 * one row here naming it — touching nothing else. A row draws its kind's
 * whole card, from the parts the view prepares.
 */

import type { Node } from '../../api.ts'
import { genericCard } from './generic.ts'
import type { CardKind, PresentedCall, PresentedResult } from './presentation.ts'
/** A run of a text line, as the author API's `Node` draws one: its text, in a tone of its own. */
export type Span = Exclude<Extract<Node, { readonly kind: 'text' }>['text'], string>[number]

/**
 * The parts of a tool card, prepared by the view for the row that draws it:
 * everything a card needs of the call, whatever its kind.
 */
export interface CardParts {
  /** The call's presented view. */
  readonly call: PresentedCall
  /** The result's presented view, when its presenter gave one; a call still running, or one its turn left, has none. */
  readonly result: PresentedResult | undefined
  /** The glyph, its tone already saying how the call stands: muted while it runs or was left, success or error once it returned. */
  readonly glyph: Span
  /** The waiting line — `running…`, or the line saying the turn ended without it; none once the call returned. */
  readonly waiting: Node | undefined
  /** Why the call failed, when it gave a person a reason. */
  readonly reason: string | undefined
  /** The result's own text, as it lands in the log; empty while the call has no result. */
  readonly resultText: string
  /**
   * Fold a child beneath the card, under this call's fold id.
   * @param child - what the fold holds.
   * @param rows - how many rows it shows while folded; three by default.
   * @returns the fold.
   */
  fold(child: Node, rows?: number): Node
}

/**
 * How one kind of card draws: its kind's whole card — the head its own, lines
 * above and under it, and the fold it chooses.
 */
export interface CardRow {
  /** Draw the card from its parts. */
  draw(parts: CardParts): Node
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
