import type { Action } from '../contract/index.ts'

/**
 * What a person has changed about the screen. Never a copy of the session:
 * that is the log's. Only what they opened and what has focus; where they
 * scrolled and what they selected are pi-tui's.
 */
export interface UiState {
  /** The ids of the folds they toggled from how they start — open where they start folded, folded where they start open — each scoped to the entry that drew it. */
  readonly toggled: ReadonlySet<string>
  /** The region the keys act on; absent until a person moves focus. */
  readonly focus?: string
}

/** What bounds an action on the screen as it is drawn now. */
export interface Bounds {
  /** The regions that offer something, in screen order. */
  readonly focusable: readonly string[]
}

/** The screen before a person has changed anything: everything folded, nothing focused. */
export const initial: UiState = { toggled: new Set() }

/**
 * What an action does to the screen.
 * @param state - the screen as it is.
 * @param action - what a gesture meant.
 * @param bounds - what bounds it on the screen as drawn now.
 * @returns the screen after it; `state` itself when the action is not the screen's to answer: `select` and scrolling are pi-tui's, `copy` and the rest the host's.
 */
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
