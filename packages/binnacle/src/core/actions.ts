import type { CoreAction } from './keys.ts'

// pi's window for the second ctrl+c that quits.
const QUIT_WITHIN_MS = 500

export interface Acts {
  now(): number
  quit(): void
  suspend(): void
  interrupt(): void
}

/** What the core does for each action of its own that a key reaches it with. */
export function coreActions(acts: Acts): (action: CoreAction) => void {
  // A Part with a draft takes the clear itself, so here the draft is empty.
  let clearedAt = Number.NEGATIVE_INFINITY
  return (action) => {
    if (action === 'binnacle.suspend') return acts.suspend()
    if (action === 'binnacle.interrupt') return acts.interrupt()
    const now = acts.now()
    if (now - clearedAt < QUIT_WITHIN_MS) acts.quit()
    clearedAt = now
  }
}
