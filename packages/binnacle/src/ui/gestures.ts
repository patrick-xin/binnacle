import { affordances } from '../contract/index.ts'
import type { Action, Gesture, Region } from '../contract/index.ts'

/**
 * What a gesture means where it lands.
 * @param gesture - what the person did.
 * @param under - the regions it lands on: for a pointer, those under it, innermost first; for a key, the focused region, then the regions the pane that answers it reaches beyond focus, in the order it hands them.
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
      if (gesture.binding === 'focus.out') return { kind: 'unfocus' }
      // The primary key is the focused region's alone; a key bound to a kind invokes the first region it lands on
      // that offers the kind, so a decision's reject answers its key while its allow has focus.
      const binding = gesture.binding
      const region = binding === 'primary' ? under[0] : under.find(candidate => candidate.affordances.some(offer => offer.kind === binding))
      const offered = binding === 'primary' ? region?.affordances[0] : region?.affordances.find(offer => offer.kind === binding)
      return region === undefined || offered === undefined ? undefined : { kind: 'invoke', region: region.id, affordance: offered.kind }
    }
  }
}
