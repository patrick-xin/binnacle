import type { Look } from '../api.ts'

/** A Look as an author sets it: handed the Look beneath it, it returns the Look. */
export type Make = (beneath: Look) => Look

/** One Look set, held apart, so that one `make` set twice keeps two places in its chain. */
export interface Entry {
  readonly item: Make
}

/** The Look on top of the chain. Each `beneath` reads the chain again when it draws, so that it is never captured. */
export function drawer<F extends Look>(chain: () => readonly Entry[], fallback: F): F {
  const made = (entry: Entry): F => entry.item(beneathOf(entry)) as F
  const beneathOf = (entry: Entry): F =>
    ((...args: never[]) => {
      const now = chain()
      const index = now.indexOf(entry)
      const next = index === -1 ? undefined : now[index + 1]
      return (next === undefined ? fallback : made(next))(...args)
    }) as F
  const top = chain()[0]
  return top === undefined ? fallback : made(top)
}
