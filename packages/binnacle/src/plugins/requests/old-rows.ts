// What the rows binnacle-approvals and binnacle-questions share while they draw from the model, until the default view replaces them.
// It is not exported from the package: an author's view draws every kind.
import type { Request, Requests } from '../../api.ts'

/** How the model fails each Request closed that stands: an approval is unavailable, and a question is dismissed. */
export const failsClosed = new WeakMap<Request, () => void>()

/** The Requests that stand, in the order they came, the one on view first. */
export const standingOf = new WeakMap<Requests, () => readonly Request[]>()

const drawn = new WeakMap<Requests, Set<Request['kind']>>()

const atOnce = new WeakMap<Requests, Set<() => void>>()

/**
 * The model tells the old rows of each change at once, not in a microtask as its watchers.
 * So a Request is drawn as it comes, as it was before the model, and a key in the same tick reaches it.
 */
export function changedAtOnce(requests: Requests): void {
  for (const changed of Array.from(atOnce.get(requests) ?? [])) changed()
}

/**
 * Attaches an old row as a view that draws only its kind, and tells `show` the Request of its kind on view, or `undefined`.
 * A Request on view of a kind that no old row draws fails closed, as it did when its row was turned off.
 * It returns what detaches the row, and fails closed each Request of its kind that stands, as the row did when it unloaded.
 */
export function drawKind<K extends Request['kind']>(
  requests: Requests,
  kind: K,
  show: (request: Extract<Request, { kind: K }> | undefined) => void,
): () => void {
  const kinds = drawn.get(requests) ?? new Set()
  drawn.set(requests, kinds)
  kinds.add(kind)
  const detach = requests.attach()
  let shown: Request | undefined
  const update = (): void => {
    const first = requests.shown
    // Failing it closed changes the model, so the next Request is seen at the next change.
    if (first !== undefined && !kinds.has(first.kind)) return failsClosed.get(first)?.()
    const mine = first?.kind === kind ? (first as Extract<Request, { kind: K }>) : undefined
    if (mine === shown) return
    shown = mine
    try {
      show(mine)
    } catch (error) {
      // A row that unloads cannot draw: Cordis refuses its effects before the row has detached.
      if ((error as { code?: unknown }).code !== 'INACTIVE_EFFECT') throw error
    }
  }
  const told = atOnce.get(requests) ?? new Set()
  atOnce.set(requests, told)
  told.add(update)
  update()
  return () => {
    told.delete(update)
    kinds.delete(kind)
    detach()
    const mine = (standingOf.get(requests)?.() ?? []).filter((request) => request.kind === kind)
    for (const request of mine) failsClosed.get(request)?.()
  }
}
