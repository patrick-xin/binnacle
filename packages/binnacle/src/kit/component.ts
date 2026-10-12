import type { Handle, PlacedHandle } from '../api.ts'

/** What a component of the Kit gives back: the Handle of its Part, whose `dispose()` also takes away its Model's name and its actions. */
export interface Component {
  readonly handle: PlacedHandle
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
