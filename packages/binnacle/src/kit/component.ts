import type { Binnacle, Handle, PlacedHandle } from '../api.ts'

/** What a component of the Kit gives back: the Handle of its Part, whose `dispose()` also takes away its Model's name and its actions. */
export interface Component {
  readonly handle: PlacedHandle
}

/** The core's own, which an author's `Binnacle` need not have. */
interface Shown {
  /** How many of the Part's lines the Place shows now, a wrapped line counted once; none while it is not drawn. */
  linesShown?(place: string): number | undefined
}

export function linesShown(binnacle: Binnacle, place: string): number | undefined {
  return (binnacle as Binnacle & Shown).linesShown?.(place)
}

export function together(placed: PlacedHandle, others: readonly Handle[]): PlacedHandle {
  return {
    redraw: () => placed.redraw(),
    focus: () => placed.focus(),
    dispose: () => {
      for (const handle of others) handle.dispose()
      placed.dispose()
    },
  }
}
