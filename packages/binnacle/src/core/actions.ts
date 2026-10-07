import type { CoreAction } from './gestures.ts'

// pi's window for the second ctrl+c that quits.
const QUIT_WITHIN_MS = 500

/** The cell under the pointer, counted from 0, where a mouse gesture happened. */
export interface Pointer {
  readonly x: number
  readonly y: number
}

export interface Acts {
  now(): number
  quit(): void
  suspend(): void
  interrupt(): void
  focusNext(): void
  scroll(notches: number, at: Pointer | undefined): void
}

/** The core's own actions, in one place, so a second ctrl+c is told from the first. */
export function coreActions(acts: Acts): (action: CoreAction, at?: Pointer) => void {
  let clearedAt = Number.NEGATIVE_INFINITY
  return (action, at) => {
    if (action === 'binnacle.suspend') return acts.suspend()
    if (action === 'binnacle.interrupt') return acts.interrupt()
    if (action === 'binnacle.focus.next') return acts.focusNext()
    if (action === 'binnacle.scroll.up') return acts.scroll(1, at)
    if (action === 'binnacle.scroll.down') return acts.scroll(-1, at)
    const now = acts.now()
    if (now - clearedAt < QUIT_WITHIN_MS) acts.quit()
    clearedAt = now
  }
}
