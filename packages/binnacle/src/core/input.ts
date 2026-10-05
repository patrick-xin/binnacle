import type { Part } from '../api.ts'
import { isKeyRelease } from '../terminal/keys.ts'
import type { StdinBuffer } from '../terminal/stdin-buffer.ts'
import { coreActionOf } from './keys.ts'
import type { CoreAction } from './keys.ts'

const PASTE_START = '\x1b[200~'
const PASTE_END = '\x1b[201~'

const SGR_MOUSE = /^\x1b\[<(?<button>\d+);(?<x>\d+);(?<y>\d+)[Mm]$/
const WHEEL_NOTCHES: Readonly<Record<string, number>> = { 64: 1, 65: -1 }

export interface Routes {
  /** A reply of the terminal to what the core asked, which is no key. */
  answered(sequence: string): boolean
  focused(): Part | undefined
  /** The Part took the key, so its lines changed. */
  taken(part: Part): void
  wheel(notches: number, x: number, y: number): void
  act(action: CoreAction): void
}

/** A key goes to the Part with the Focus first, then to the Key Table; the wheel goes to the Place under it. */
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
      const notches = WHEEL_NOTCHES[mouse['button'] ?? ''] ?? 0
      // SGR mouse reports count columns and rows from 1.
      if (notches !== 0) routes.wheel(notches, Number(mouse['x']) - 1, Number(mouse['y']) - 1)
      return
    }
    if (toFocus(sequence)) return
    // Raw mode turns off the terminal's own signals, so ctrl+c and ctrl+z arrive as keys.
    const action = coreActionOf(sequence)
    if (action !== undefined) routes.act(action)
  })
  // The buffer takes a bracketed paste out of its markers; the editor reads a paste by them.
  input.on('paste', (content: string) => {
    toFocus(`${PASTE_START}${content}${PASTE_END}`)
  })
}
