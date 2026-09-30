import type { Node, Span } from '../ui/node.ts'

/** A call as its tool presented it, read as data. */
export interface PresentedCall {
  /** Which card the tool declared for the call. */
  readonly card: 'generic' | 'terminal' | 'diff'
  /** What this call does, as the tool titled it: drawn as the card's head, its first line beside the mark and each later line indented two columns beneath it. */
  readonly title: string
  /** A shallow copy of the object the presenter returned, frozen read-only and unread beyond the fields above: a row reads its kind's own fields here, parsing them where it draws, as data from code binnacle does not own. */
  readonly returned: Readonly<Record<string, unknown>>
}

/** A result as its tool presented it, read as data. */
export interface PresentedResult {
  /** Which card the tool declared for the completed call. */
  readonly card: 'generic' | 'terminal' | 'diff' | 'read' | 'search' | 'web'
  /** The title the completed call reads as, when the tool presented one; the call's own title when it did not. Drawn as the head, as a call title is. */
  readonly title?: string
  /** The content the completed call folds beneath it, when the tool presented some; the result's own text when it did not. */
  readonly content?: readonly unknown[]
  /** A shallow copy of the object the presenter returned, frozen read-only and unread beyond the fields above: a row reads its kind's own fields here, parsing them where it draws, as data from code binnacle does not own. */
  readonly returned: Readonly<Record<string, unknown>>
}

/** Every card kind dsh's presentation vocabulary names, on a call or on a result. */
export type CardKind = PresentedCall['card'] | PresentedResult['card']

/** What a card row draws from: one tool call, as its tool presented it and as it stands. */
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
  /** How long the call took, in milliseconds: its result's log time less its call's; none while it has no result. */
  readonly took: number | undefined
  /** Fold a child beneath the card as the call's `output` part, under this call's fold id. `rows` is how many show while folded; left out, what the theme gives the tool kind, or three. */
  fold(child: Node, rows?: number): Node
}

/** The show a card is drawn as, so every tool call has the surface's container as its parent, whichever kind. */
export type Shown = Extract<Node, { readonly kind: 'show' }>

/** How one kind of card is drawn from its parts. */
export interface CardRow {
  /** Draw the card, or decline with why: the row beneath then draws it, with why said beneath it. */
  draw(parts: CardParts): Shown | { readonly declined: string }
}
