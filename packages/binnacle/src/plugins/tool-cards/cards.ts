import type { Node } from '../../api.ts'
import { genericCard } from './generic.ts'
import type { CardKind, PresentedCall, PresentedResult } from './presentation.ts'
export type Span = Exclude<Extract<Node, { readonly kind: 'text' }>['text'], string>[number]

export interface CardParts {
  /** The call's presented view. */
  readonly call: PresentedCall
  /** The result's presented view, when its presenter gave one; a call still running, or one its turn left, has none. */
  readonly result: PresentedResult | undefined
  /** How the call stands, as the mark its head opens with: `running` while it runs or was left, `done` or `failed` once it returned. */
  readonly mark: Span
  /** The waiting line, to be held beneath the head — `running` and the time since the call, counting up, or the line saying the turn ended without it; none once the call returned. */
  readonly waiting: Node | undefined
  /** Why the call failed, when it gave a person a reason. */
  readonly reason: string | undefined
  /** The result's own text, as it lands in the log; empty while the call has no result. */
  readonly resultText: string
  /** Fold a child beneath the card, under this call's fold id. `rows` is how many show while folded; left out, what the theme gives the tool kind, or three. */
  fold(child: Node, rows?: number): Node
}

export type Shown = Extract<Node, { readonly kind: 'show' }>

/** A row draws inside a show, never a bare stack, so every tool call has the surface's container as its parent, whichever kind. */
export interface CardRow {
  /** Draw the card from its parts, or decline with why: the entry is then left to the card beneath, with why said beneath it. */
  draw(parts: CardParts): Shown | { readonly declined: string }
}

const table: Readonly<Partial<Record<CardKind, CardRow>>> = { generic: genericCard }

/** The kind's own row when the table holds one, generic's until it lands. */
export function rowFor(kind: CardKind): CardRow {
  return table[kind] ?? genericCard
}
