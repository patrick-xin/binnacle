import type { AffordanceKind, Gesture, Region } from '../contract/index.ts'
import { meaning } from './gestures.ts'
import { act } from './state.ts'
import type { Bounds, UiState } from './state.ts'

export interface Answer {
  readonly state: UiState
  readonly focus?: string
  readonly invoked?: { readonly region: string; readonly affordance: AffordanceKind }
}

export function answer(state: UiState, gesture: Gesture, landing: readonly Region[], bounds: Bounds): Answer | undefined {
  const action = meaning(gesture, landing)
  if (action === undefined) return undefined
  const next = act(state, action, bounds)
  return {
    state: next,
    ...(next.focus !== undefined && next.focus !== state.focus ? { focus: next.focus } : {}),
    ...(action.kind === 'invoke' && action.affordance !== 'expand'
      ? { invoked: { region: action.region, affordance: action.affordance } }
      : {}),
  }
}
