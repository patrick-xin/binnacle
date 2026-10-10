import type { Model, Watchable } from '../api.ts'

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

/**
 * A Model that stands for `newest()`, found at each read, set and watch.
 * `moves` is where its watchers listen; its owner runs each of them after a Model comes or goes.
 */
export function foundModel<S extends object>(
  newest: () => Model<S> | undefined,
  moves: (() => void)[],
): Watchable & { readonly state: S | undefined; set(change: (state: S) => void): void } {
  return {
    get state() {
      return newest()?.state
    },
    set: (change) => newest()?.set(change),
    watch: (changed) => {
      let stopped = false
      let pending = false
      const told = (): void => {
        if (!pending) changed()
      }
      let watched = newest()
      let stopWatched = watched?.watch(told)
      const moved = (): void => {
        if (newest() === watched) return
        stopWatched?.()
        watched = newest()
        stopWatched = watched?.watch(told)
        if (pending) return
        pending = true
        // Two microtasks, so that a Model changed as it is named tells its watchers first, and they are told once, after both.
        queueMicrotask(() =>
          queueMicrotask(() => {
            pending = false
            if (!stopped) changed()
          }),
        )
      }
      moves.push(moved)
      return () => {
        if (stopped) return
        stopped = true
        stopWatched?.()
        moves.splice(moves.indexOf(moved), 1)
      }
    },
  }
}
