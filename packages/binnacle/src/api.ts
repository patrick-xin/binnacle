/**
 * The author API: what an author, or a built-in feature, may depend on — the
 * `binnacle` service and the types its registrations take and return.
 *
 * Removing or renaming an export here breaks every author; its commit says so.
 */

import type { AuthorAdapter, Fact } from './facts/adapt.ts'
import type { KeyId } from './ui/keys.ts'
import type { Node } from './ui/node.ts'
import type { View } from './views/entries.ts'

export type { AuthorAdapter, Fact } from './facts/adapt.ts'
export type { Entry } from './models/transcript.ts'
export type { KeyId } from './ui/keys.ts'
export type { Mark } from './ui/theme.ts'
export type { Background } from './ui/theme.ts'
export type { Node } from './ui/node.ts'
export type { View, Views } from './views/entries.ts'

/** A screen a plugin places in the transcript's place: the key its plugin offers, and how it draws. */
export interface PlacedScreen {
  /** The key that opens it, as pi-tui names keys (`ctrl+shift+t`, `f2`); the binding its plugin offers in the one key table, so a person can rebind it. */
  readonly key: KeyId
  /** What the key does, as a person reads it in help. */
  readonly description: string
  /** How the screen draws, with nodes as a view draws, handed the session's facts read-only; nothing it does reaches the log. */
  readonly draw: (facts: readonly Fact[]) => Node
}

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
   * Draw a kind of entry: a built-in kind, a quiet kind by its dsh event
   * type, or an authored fact by its name. The newest view of a key draws,
   * handed what the one beneath it draws — the view registered before it, or
   * binnacle's own — so it can build on that, or leave it the entries it does
   * not claim. Disposing one gives its place back.
   * @param key - the entry kind, a quiet kind's dsh event type, or the fact name.
   * @param view - how it is drawn.
   * @returns a disposer, for taking it back before the plugin is disposed.
   */
  view(key: string, view: View): () => void
  /**
   * Draw again, at the next frame, every entry the views of a key draw. An
   * entry is drawn once and kept, so a view that reads anything besides its
   * entry — a setting, the time — calls this when what it read has changed.
   * @param key - the entry kind, quiet kind's dsh event type, or fact name, as it was registered.
   */
  invalidate(key: string): void
  /**
   * Place a screen in the transcript's place: drawn with nodes as a view
   * draws, in the alternate screen's scroll view, handed the session's facts
   * read-only — and from the main screen, opened by switching to the
   * alternate screen. Its plugin offers the key that opens it, a binding in
   * the one key table; the same key, or Esc, returns to the transcript as it
   * was, and what the host answers itself, quitting included, still answers
   * on a placed screen. The newest registration of a name places it;
   * disposing the plugin takes back its screen and its key, closing it if it
   * is open.
   * @param name - the screen's name, its registration's and its binding's.
   * @param screen - the key it offers, and how it draws.
   * @returns a disposer, for taking it back before the plugin is disposed.
   */
  screen(name: string, screen: PlacedScreen): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** What an author registers with the surface: `ctx.binnacle`, typed for anything that imports the author API, as the host provides it. */
    binnacle: Registrations
  }
}
