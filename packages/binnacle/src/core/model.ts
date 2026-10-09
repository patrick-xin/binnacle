import type { Model } from '../api.ts'

export function createModel<S extends object>(state: S): Model<S> {
  const watchers = new Set<() => void>()
  let queued = false
  return {
    state,
    watch: (changed) => {
      watchers.add(changed)
      return () => {
        watchers.delete(changed)
      }
    },
    set: (change) => {
      change(state)
      if (queued) return
      queued = true
      // A watcher that changes the model in its own call is told again after it, never inside it.
      queueMicrotask(() => {
        queued = false
        // A snapshot, so that a watcher that stops and watches again is told once.
        const told = [...watchers]
        for (const changed of told) changed()
      })
    },
  }
}
