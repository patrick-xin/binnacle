/**
 * The author API: what an author, or a built-in feature, may depend on — the
 * `binnacle` service and the types its registrations take and return.
 *
 * Removing or renaming an export here breaks every author; its commit says so.
 */

import type { AuthorAdapter } from './facts/adapt.ts'
import type { View } from './views/entries.ts'

export type { AuthorAdapter, Fact } from './facts/adapt.ts'
export type { Entry } from './models/transcript.ts'
export type { Node } from './ui/node.ts'
export type { View, Views } from './views/entries.ts'

/** The `binnacle` service, `ctx.binnacle`: each registration is an effect of the plugin that made it, gone when that plugin is disposed. */
export interface Registrations {
  /**
   * Read one kind of session event as a fact of the author's own. The newest
   * adapter of a type reads it; disposing one gives the type back to the one
   * registered before it, or to binnacle.
   * @param type - the dsh event type.
   * @param adapter - names the fact and says what it holds.
   * @returns a disposer, for taking it back before the plugin is disposed.
   */
  facts(type: string, adapter: AuthorAdapter): () => void
  /**
   * Draw a kind of entry: a built-in kind, or an authored fact by its name.
   * The newest view of a key draws, handed what the one beneath it draws —
   * the view registered before it, or binnacle's own — so it can build on
   * that, or leave it the entries it does not claim. Disposing one gives its
   * place back.
   * @param key - the entry kind or fact name.
   * @param view - how it is drawn.
   * @returns a disposer, for taking it back before the plugin is disposed.
   */
  view(key: string, view: View): () => void
  /**
   * Draw again, at the next frame, every entry the views of a key draw. An
   * entry is drawn once and kept, so a view that reads anything besides its
   * entry — a setting, the time — calls this when what it read has changed.
   * @param key - the entry kind or fact name, as it was registered.
   */
  invalidate(key: string): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** What an author registers with the surface: `ctx.binnacle`, typed for anything that imports the author API, as the host provides it. */
    binnacle: Registrations
  }
}
