/**
 * The contract: the vocabulary every layer shares, and an author writes against.
 *
 * Content offers affordances; a region of the screen carries them; a gesture
 * lands on regions and means an action, or nothing
 * ([ADR 1](../../../../docs/adr/0001-content-offers-affordances-the-surface-owns-gestures.md)).
 * Nothing here draws or reads input; it imports nothing.
 * @module binnacle/contract
 */

/**
 * Every affordance, and its policy. `pointer` says whether a click may invoke
 * it: a grant never, so an approval is always a key pressed on purpose.
 */
export const affordances = {
  expand: { pointer: true },
  choose: { pointer: true },
  open: { pointer: true },
  copy: { pointer: true },
  answer: { pointer: true },
  grant: { pointer: false },
  dismiss: { pointer: true },
} as const satisfies Record<string, { readonly pointer: boolean }>

/** Something a person can do with a piece of content. */
export type AffordanceKind = keyof typeof affordances

/** One affordance a region offers. */
export interface Affordance {
  /** What it does. */
  readonly kind: AffordanceKind
  /** What it does to this content, in words a person reads in help and on focus. */
  readonly label: string
}

/** A part of the screen a gesture can land on. */
export interface Region {
  /** Stable while its content is on screen. */
  readonly id: string
  /** What it offers, primary first; empty when it offers nothing. */
  readonly affordances: readonly Affordance[]
  /** Whether its content is taller than the rows it was given. */
  readonly overflows: boolean
}

/** A binding a key resolves to before it means anything: focus movement, the primary affordance, or one affordance by kind. */
export type KeyBinding = 'focus.next' | 'focus.previous' | 'primary' | AffordanceKind

/** What a person did, before it means anything. */
export type Gesture =
  | { readonly kind: 'click' }
  | { readonly kind: 'wheel', readonly delta: number }
  | { readonly kind: 'drag' }
  | { readonly kind: 'hover' }
  | { readonly kind: 'key', readonly binding: KeyBinding }

/** What a gesture means. */
export type Action =
  | { readonly kind: 'invoke', readonly region: string, readonly affordance: AffordanceKind }
  | { readonly kind: 'scroll', readonly region: string, readonly delta: number }
  | { readonly kind: 'select' }
  | { readonly kind: 'focus', readonly step: 1 | -1 }
