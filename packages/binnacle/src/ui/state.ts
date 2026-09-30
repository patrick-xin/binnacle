import type { Action } from '../contract/index.ts'

export interface UiState {
  readonly toggled: ReadonlySet<string>
  readonly focus?: string
}

export interface Bounds {
  readonly focusable: readonly string[]
}

export const initial: UiState = { toggled: new Set() }

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
