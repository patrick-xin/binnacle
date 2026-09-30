import type { TuiMouseEvent } from '@earendil-works/pi-tui'
import type { Gesture } from '../contract/index.ts'

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
