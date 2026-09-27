/**
 * The pointer events a test feeds a pane, as pi-tui's containers deliver
 * them: the event a click on a row becomes, at the width the pane drew it.
 * @module binnacle/test/support/pointer
 */
import type { TuiMouseEvent } from '@earendil-works/pi-tui'

/**
 * A pointer event on a row of a pane, as pi-tui's containers deliver it.
 * @param type - what the pointer did.
 * @param y - the row, in the pane's own lines.
 * @param x - the column.
 * @returns the event.
 */
export const pointer = (type: TuiMouseEvent['type'], y: number, x = 0): TuiMouseEvent => ({
  type, button: type === 'wheel' || type === 'move' ? 'none' : 'left', x, y, screenX: x, screenY: y, width: 40, height: 3,
  shift: false, alt: false, ctrl: false, ...type === 'wheel' ? { wheelDelta: -1 } : {},
})
