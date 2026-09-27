/**
 * A gesture answered: the one place a gesture that has landed becomes a
 * change of UI state, shared by the panes that hold the state a person
 * changes — the transcript's and a placed screen's.
 *
 * A pane hands it the gesture, the regions it lands on — those under the
 * pointer, or the focused one for a key — and what bounds an action on the
 * screen as it is drawn; it says what the gesture did.
 */

import type { Gesture, Region } from '../contract/index.ts'
import { meaning } from './gestures.ts'
import { act } from './state.ts'
import type { Bounds, UiState } from './state.ts'

/** What answering a gesture did to the screen. */
export interface Answer {
  /** The screen after it; the state itself when the gesture changed nothing. */
  readonly state: UiState
  /** The region focus moved to, when it moved. */
  readonly focus?: string
}

/**
 * Answer a gesture that has landed, through the gesture table.
 * @param state - the screen as it is.
 * @param gesture - what the person did.
 * @param landing - the regions it lands on, innermost first: those under the pointer, or the focused one for a key.
 * @param bounds - what bounds an action on the screen as it is drawn.
 * @returns what the gesture did; `undefined` when the gesture means nothing where it landed, which no pane answers.
 */
export function answer(state: UiState, gesture: Gesture, landing: readonly Region[], bounds: Bounds): Answer | undefined {
  const action = meaning(gesture, landing)
  if (action === undefined) return undefined
  const next = act(state, action, bounds)
  return { state: next, ...next.focus !== undefined && next.focus !== state.focus ? { focus: next.focus } : {} }
}
