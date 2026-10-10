import type { Part } from '../api.ts'
import { isKeyRelease } from '../terminal/keys.ts'
import type { StdinBuffer } from '../terminal/stdin-buffer.ts'
import type { Pointer } from './actions.ts'

const PASTE_START = '\x1b[200~'
const PASTE_END = '\x1b[201~'

const SGR_MOUSE = /^\x1b\[<(?<button>\d+);(?<x>\d+);(?<y>\d+)(?<press>[Mm])$/
// The SGR report's modifier bits: 4 shift, 8 alt, 16 ctrl.
const MODIFIER_BITS: readonly (readonly [number, string])[] = [
  [4, 'shift'],
  [8, 'alt'],
  [16, 'ctrl'],
]
const MODIFIERS = 4 | 8 | 16
// The button identities the core takes: the left button's press, and the wheel's two directions.
const BASES: Readonly<Record<number, MouseGesture['base']>> = { 0: 'click', 64: 'wheelup', 65: 'wheeldown' }

interface MouseGesture {
  readonly name: string
  readonly base: 'click' | 'wheelup' | 'wheeldown'
  readonly at: Pointer
}

// Only the left button's press is a click, and only the wheel's two directions are gestures: a release, the middle
// and the right button, additional buttons, and motion are nothing, whatever modifiers they carry.
function gestureOf(mouse: { [key: string]: string | undefined }): MouseGesture | undefined {
  if (mouse['press'] !== 'M') return undefined
  const button = Number(mouse['button'])
  const base = BASES[button & ~MODIFIERS]
  if (base === undefined) return undefined
  const modifiers = MODIFIER_BITS.filter(([bit]) => (button & bit) !== 0)
    .map(([, modifier]) => `${modifier}+`)
    .join('')
  // SGR mouse reports count columns and rows from 1.
  return { name: `${modifiers}${base}`, base, at: { x: Number(mouse['x']) - 1, y: Number(mouse['y']) - 1 } }
}

export interface Routes {
  /** A reply of the terminal to what the core asked, which is no key. */
  answered(sequence: string): boolean
  focused(): Part | undefined
  /** The Part took the key, so its lines changed. */
  taken(part: Part): void
  /** A press of the left button, at the cell under the pointer counted from 0, by its gesture's name. True when the Part under it, or an action of its Place, took the click. */
  click(x: number, y: number, gesture: string): boolean
  /** A key to the actions that authors set, at one step of the order: before the Part with the Focus, or after it. True when one took it. */
  actions(data: string, first: boolean): boolean
  /** A notch of the wheel, by its gesture's name, to the actions with no Place, where the core's scroll is. */
  wheel(name: string, at: Pointer): void
}

/**
 * A key goes to the actions marked `first`, then to the Part with the Focus, then to the other actions, the core's own among those with no Place.
 * A click goes to the Part under the pointer, then to its Place's actions. A notch of the wheel goes to the actions with no Place.
 */
export function route(input: StdinBuffer, routes: Routes): void {
  const toFocus = (data: string): boolean => {
    const part = routes.focused()
    if (part?.key?.(data) !== true) return false
    routes.taken(part)
    return true
  }
  input.on('data', (sequence: string) => {
    // No Part asks for a key's release yet, and the editor would type it a second time.
    if (routes.answered(sequence) || isKeyRelease(sequence)) return
    const mouse = SGR_MOUSE.exec(sequence)?.groups
    if (mouse !== undefined) {
      const gesture = gestureOf(mouse)
      if (gesture === undefined) return
      if (gesture.base === 'click') routes.click(gesture.at.x, gesture.at.y, gesture.name)
      else routes.wheel(gesture.name, gesture.at)
      return
    }
    // Raw mode turns off the terminal's own signals, so ctrl+c and ctrl+z arrive as keys, for the core's actions.
    if (routes.actions(sequence, true) || toFocus(sequence)) return
    routes.actions(sequence, false)
  })
  // The buffer takes a bracketed paste out of its markers; the editor reads a paste by them.
  input.on('paste', (content: string) => {
    toFocus(`${PASTE_START}${content}${PASTE_END}`)
  })
}
