/**
 * Every affordance, and its policy. `pointer` says whether a click may invoke
 * it: a grant and a dismiss never, so an approval is always answered by a key
 * pressed on purpose — allowed or refused.
 */
export const affordances = {
  expand: { pointer: true },
  choose: { pointer: true },
  open: { pointer: true },
  copy: { pointer: true },
  answer: { pointer: true },
  grant: { pointer: false },
  dismiss: { pointer: false },
} as const satisfies Record<string, { readonly pointer: boolean }>

/** Something a person can do with a piece of content. */
export type AffordanceKind = keyof typeof affordances

/** One affordance a region offers. */
export interface Affordance {
  /** What it does. */
  readonly kind: AffordanceKind
  /** What it does to this content, in words a person reads in help and on focus; when absent, the theme's words for its kind say it, so a label is written only where it means something more. */
  readonly label?: string
}

export interface Region {
  readonly id: string
  readonly affordances: readonly Affordance[]
  readonly overflows: boolean
}

export type KeyBinding = 'focus.next' | 'focus.previous' | 'focus.out' | 'primary' | AffordanceKind

export type Gesture =
  | { readonly kind: 'click' }
  | { readonly kind: 'wheel', readonly delta: number }
  | { readonly kind: 'drag' }
  | { readonly kind: 'hover' }
  | { readonly kind: 'key', readonly binding: KeyBinding }

export type Action =
  | { readonly kind: 'invoke', readonly region: string, readonly affordance: AffordanceKind }
  | { readonly kind: 'scroll', readonly region: string, readonly delta: number }
  | { readonly kind: 'select' }
  | { readonly kind: 'focus', readonly step: 1 | -1 }
  | { readonly kind: 'unfocus' }

export function describe(value: unknown): string {
  try {
    return value instanceof Error ? String(value.message) : String(value)
  } catch {
    return 'a value binnacle cannot show'
  }
}
