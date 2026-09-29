import type { AffordanceKind, Gesture, Region } from '../contract/index.ts'
import { meaning } from './gestures.ts'
import { act } from './state.ts'
import type { Bounds, UiState } from './state.ts'

/** What answering a gesture did to the screen. */
export interface Answer {
  /** The screen after it; the state itself when the gesture changed nothing. */
  readonly state: UiState
  /** The region focus moved to, when it moved. */
  readonly focus?: string
  /** An offer the gesture invoked that UI state does not answer — any but `expand` — for whoever drew it to act on. */
  readonly invoked?: { readonly region: string, readonly affordance: AffordanceKind }
}

/**
 * Answer a gesture that has landed, through the gesture table.
 * @param state - the screen as it is.
 * @param gesture - what the person did.
 * @param landing - the regions it lands on, innermost first: those under the pointer, or for a key the focused one, then those beyond it the pane reaches.
 * @param bounds - what bounds an action on the screen as it is drawn.
 * @returns what the gesture did; `undefined` when the gesture means nothing where it landed, which no pane answers.
 */
export function answer(state: UiState, gesture: Gesture, landing: readonly Region[], bounds: Bounds): Answer | undefined {
  const action = meaning(gesture, landing)
  if (action === undefined) return undefined
  const next = act(state, action, bounds)
  return {
    state: next,
    ...next.focus !== undefined && next.focus !== state.focus ? { focus: next.focus } : {},
    ...action.kind === 'invoke' && action.affordance !== 'expand' ? { invoked: { region: action.region, affordance: action.affordance } } : {},
  }
}
