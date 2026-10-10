import type { Layout, Screen } from '../api.ts'

const deepFrozen = <T extends object>(value: T): T => {
  for (const inner of Object.values(value)) if (typeof inner === 'object' && inner !== null) deepFrozen(inner)
  return Object.freeze(value)
}

/** Frozen, as an author builds on it: a change to it in place would change the Chat under every plugin. */
export const CHAT_LAYOUT: Layout & { readonly column: readonly Layout[] } = deepFrozen({
  column: [
    { place: 'transcript', size: 'fill' },
    { layout: 'status', size: 'content' },
    // A Request that stands is drawn in the composer's stead, by the Layout that the Requests' view sets.
    { layout: 'request', size: 'content' },
    { layout: 'composer', size: 'content', unless: 'request' },
  ],
})

export const CHAT: Screen = { name: 'chat', focus: 'composer.input', layout: CHAT_LAYOUT }
