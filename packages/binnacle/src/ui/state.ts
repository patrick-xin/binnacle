/**
 * UI state: what a person has changed about how the session is shown.
 *
 * Never a copy of the session: that is the log's. Only what they opened and
 * where they scrolled.
 * @module binnacle/ui/state
 */

import type { Action } from '../contract/index.ts'

/** What a person has changed about the screen. */
export interface UiState {
  /** The ids of the regions they expanded. */
  readonly expanded: ReadonlySet<string>
  /** How many rows above the end of the transcript the screen's bottom sits; 0 follows the end. */
  readonly scroll: number
  /** The region the keys act on; absent until a person moves focus. */
  readonly focus?: string
}

/** What bounds an action on the screen as it is drawn now. */
export interface Bounds {
  /** How far the screen can scroll from the end. */
  readonly scrollLimit: number
  /** The regions that offer something, in screen order. */
  readonly focusable: readonly string[]
}

/** The screen before a person has changed anything: everything folded, following the end. */
export const initial: UiState = { expanded: new Set(), scroll: 0 }

/**
 * What an action does to the screen.
 * @param state - the screen as it is.
 * @param action - what a gesture meant.
 * @param bounds - what bounds it on the screen as drawn now.
 * @returns the screen after it; `state` itself when the action is not the screen's to answer, such as `select` or `copy`.
 */
export function act(state: UiState, action: Action, bounds: Bounds): UiState {
  switch (action.kind) {
    case 'invoke': {
      if (action.affordance !== 'expand') return state
      const expanded = new Set(state.expanded)
      if (!expanded.delete(action.region)) expanded.add(action.region)
      return { ...state, expanded }
    }
    case 'scroll':
      return { ...state, scroll: Math.min(Math.max(state.scroll - action.delta, 0), bounds.scrollLimit) }
    case 'focus': {
      const count = bounds.focusable.length
      if (count === 0) return state
      const at = state.focus === undefined ? -1 : bounds.focusable.indexOf(state.focus)
      const next = at === -1 ? (action.step === 1 ? 0 : count - 1) : (at + action.step + count) % count
      const focus = bounds.focusable[next]
      return focus === undefined ? state : { ...state, focus }
    }
    case 'select':
      return state
  }
}
