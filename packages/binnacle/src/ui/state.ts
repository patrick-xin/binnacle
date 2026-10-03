import type { Action } from '../contract/index.ts'
import type { AskDrawn } from './layout.ts'

/** Where one ask's prose page and offers' window stand, held by the pane that drew it. */
export interface AskState {
  /** The top row of the ask's prose page. */
  readonly page: number
  /** The index of the first offer the ask's window shows. */
  readonly window: number
}

export interface UiState {
  readonly toggled: ReadonlySet<string>
  readonly focus?: string
  /** Where each ask's prose page and window stand, keyed by the ask's order in the drawing; an ask with no entry starts at its first page and window. */
  readonly asks?: readonly (AskState | undefined)[]
}

/** What a gesture may act on: everything focusable, the windowed away included, and what each ask last drew. */
export interface Bounds {
  readonly focusable: readonly string[]
  readonly asks: readonly AskDrawn[]
}

export const initial: UiState = { toggled: new Set() }

/** The asks with one ask's page and window set, keyed by its order in the drawing. */
function withAsk(asks: readonly (AskState | undefined)[] | undefined, at: number, ask: AskState): readonly (AskState | undefined)[] {
  const next: (AskState | undefined)[] = [...(asks ?? [])]
  while (next.length < at) next.push(undefined)
  next[at] = ask
  return next
}

export function act(state: UiState, action: Action, bounds: Bounds): UiState {
  switch (action.kind) {
    case 'invoke': {
      if (action.affordance !== 'expand') return state
      const toggled = new Set(state.toggled)
      if (!toggled.delete(action.region)) toggled.add(action.region)
      return { ...state, toggled }
    }
    case 'focus': {
      const count = bounds.focusable.length
      if (count === 0) return state
      const at = state.focus === undefined ? -1 : bounds.focusable.indexOf(state.focus)
      const next = at === -1 ? (action.step === 1 ? 0 : count - 1) : (at + action.step + count) % count
      const focus = bounds.focusable[next]
      return focus === undefined ? state : { ...state, focus }
    }
    case 'page': {
      const paged = bounds.asks.filter((ask) => ask.pages > 1)
      const ask = paged.find((each) => state.focus !== undefined && each.offers.includes(state.focus)) ?? paged[0]
      if (ask === undefined) return state
      const step = Math.max(1, ask.pageRows - 1)
      const page = Math.min(Math.max(0, ask.page + action.step * step), (ask.pages - 1) * step)
      if (page === ask.page) return state
      return { ...state, asks: withAsk(state.asks, bounds.asks.indexOf(ask), { page, window: ask.window }) }
    }
    case 'jump': {
      const windowed = bounds.asks.filter((ask) => ask.shown < ask.offers.length)
      const ask = windowed.find((each) => state.focus !== undefined && each.offers.includes(state.focus)) ?? windowed[0]
      if (ask === undefined) return state
      const count = bounds.focusable.length
      if (count === 0) return state
      const at = state.focus === undefined ? -1 : bounds.focusable.indexOf(state.focus)
      const next = Math.min(Math.max(0, (at === -1 ? 0 : at) + action.step * ask.shown), count - 1)
      const focus = bounds.focusable[next]
      return focus === undefined || focus === state.focus ? state : { ...state, focus }
    }
    case 'scroll':
    case 'select':
      return state
    case 'unfocus': {
      if (state.focus === undefined) return state
      const { focus: _dropped, ...screen } = state
      return screen
    }
  }
}
