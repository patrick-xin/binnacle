/**
 * The gesture table: the one place a gesture is given a meaning.
 *
 * A pointer gesture lands on the regions under the pointer, innermost first;
 * a key lands on the focused region.
 */

import { affordances } from '../contract/index.ts'
import type { Action, Gesture, Region } from '../contract/index.ts'

/**
 * What a gesture means where it lands.
 * @param gesture - what the person did.
 * @param under - the regions it lands on, innermost first.
 * @returns the action, or undefined when the gesture means nothing there.
 */
export function meaning(gesture: Gesture, under: readonly Region[]): Action | undefined {
  switch (gesture.kind) {
    case 'click': {
      const region = under.find(candidate => candidate.affordances.length > 0)
      const primary = region?.affordances[0]
      if (region === undefined || primary === undefined || !affordances[primary.kind].pointer) return undefined
      return { kind: 'invoke', region: region.id, affordance: primary.kind }
    }
    case 'wheel': {
      const region = under.find(candidate => candidate.overflows)
      return region === undefined ? undefined : { kind: 'scroll', region: region.id, delta: gesture.delta }
    }
    case 'drag':
      return { kind: 'select' }
    case 'hover':
      return undefined
    case 'key': {
      if (gesture.binding === 'focus.next') return { kind: 'focus', step: 1 }
      if (gesture.binding === 'focus.previous') return { kind: 'focus', step: -1 }
      const focused = under[0]
      const offered = gesture.binding === 'primary'
        ? focused?.affordances[0]
        : focused?.affordances.find(candidate => candidate.kind === gesture.binding)
      return focused === undefined || offered === undefined ? undefined : { kind: 'invoke', region: focused.id, affordance: offered.kind }
    }
  }
}
