/**
 * The author API: what an author, or a built-in feature, may depend on — the
 * `binnacle` service and the types its registrations take and return.
 *
 * Removing or renaming an export here breaks every author; its commit says so
 * ([ADR 5](../../../docs/adr/0005-a-built-in-feature-is-a-plugin-that-holds-only-what-an-author-holds.md)).
 */

import type { AuthorAdapter } from './facts/adapt.ts'
import type { View } from './views/entries.ts'

export type { AuthorAdapter, Fact } from './facts/adapt.ts'
export type { Entry } from './models/transcript.ts'
export type { Node } from './ui/node.ts'
export type { View } from './views/entries.ts'

/** The `binnacle` service, `ctx.binnacle`: each registration is an effect of the plugin that made it, gone when that plugin is disposed. */
export interface Registrations {
  /**
   * Read one kind of session event as a fact of the author's own.
   * @param type - the dsh event type.
   * @param adapter - names the fact and says what it holds.
   * @returns a disposer, for taking it back before the plugin is disposed.
   * @throws when another plugin already reads that type.
   */
  facts(type: string, adapter: AuthorAdapter): () => void
  /**
   * Draw a kind of entry: a built-in kind, replacing its view, or an authored fact by its name.
   * @param key - the entry kind or fact name.
   * @param view - how it is drawn.
   * @returns a disposer, for taking it back before the plugin is disposed.
   * @throws when another plugin already draws that key.
   */
  view(key: string, view: View): () => void
}
