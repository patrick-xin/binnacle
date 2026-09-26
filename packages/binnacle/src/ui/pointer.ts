/**
 * The pointer: pi-tui's mouse events, as gestures.
 *
 * The one place pi-tui's mouse vocabulary is read; the gesture table knows
 * only gestures.
 */

import type { TuiMouseEvent } from '@earendil-works/pi-tui'
import type { Gesture } from '../contract/index.ts'

/**
 * The gesture a mouse event is.
 * @param event - pi-tui's event.
 * @returns the gesture, or undefined for an event that is none — a press, a release, a click of any button but the primary.
 */
export function gestureOf(event: TuiMouseEvent): Gesture | undefined {
  switch (event.type) {
    case 'click':
      return event.button === 'left' ? { kind: 'click' } : undefined
    case 'wheel':
      return { kind: 'wheel', delta: event.wheelDelta ?? 0 }
    case 'drag':
      return { kind: 'drag' }
    case 'move':
      return { kind: 'hover' }
    case 'press':
    case 'release':
      return undefined
  }
}
