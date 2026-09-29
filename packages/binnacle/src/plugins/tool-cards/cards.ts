import type { Node } from '../../api.ts'
import { genericCard } from './generic.ts'
import type { CardKind, PresentedCall, PresentedResult } from './presentation.ts'
/** A run of a text line, as the author API's `Node` draws one: its text in a tone of its own, or one of the theme's marks. */
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
  /** How the call stands, as the mark its head opens with: `running` while it runs or was left, `done` or `failed` once it returned. */
  readonly mark: Span
  /** The waiting line — `running` and the time since the call, counting up, or the line saying the turn ended without it; none once the call returned. */
  readonly waiting: Node | undefined
  /** Why the call failed, when it gave a person a reason. */
  readonly reason: string | undefined
  /** The result's own text, as it lands in the log; empty while the call has no result. */
  readonly resultText: string
  /**
   * Fold a child beneath the card, under this call's fold id.
   * @param child - what the fold holds.
   * @param rows - how many rows it shows while folded, when the row names its own; left out, what the theme gives the tool kind, or three.
   * @returns the fold.
   */
  fold(child: Node, rows?: number): Node
}

/**
 * How one kind of card draws: its kind's whole card — the head its own, lines
 * above and under it, and the fold it chooses — or a decline, when it cannot
 * read what its kind's view holds.
 */
export interface CardRow {
  /** Draw the card from its parts, or decline with why: the entry is then left to the card beneath, with why said beneath it. */
  draw(parts: CardParts): Node | { readonly declined: string }
}

/**
 * Every row the cards hold, by the card kind it draws; generic's is the one today.
 * A later card is a new file beside this one, holding its row, plus one row
 * here naming it — touching nothing else.
 */
const table: Readonly<Partial<Record<CardKind, CardRow>>> = { generic: genericCard }

/**
 * The row that draws a card kind: its own when the table holds one, generic's until it lands.
 * @param kind - the card kind a presenter declared.
 * @returns its row.
 */
export function rowFor(kind: CardKind): CardRow {
  return table[kind] ?? genericCard
}
