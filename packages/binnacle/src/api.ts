/**
 * The author API: what an author, or a built-in feature, may depend on — the
 * `binnacle` service and the types its registrations take and return.
 *
 * Removing or renaming an export here breaks every author; its commit says so.
 */

import type { AuthorAdapter, Fact } from './facts/adapt.ts'
import type { KeyId } from './ui/keys.ts'
import type { AffordanceKind, Node } from './ui/node.ts'
import type { ThemeChanges } from './ui/theme.ts'
import type { View } from './views/entries.ts'

export type { AuthorAdapter, Fact } from './facts/adapt.ts'
export type { Entry } from './models/transcript.ts'
export type { KeyId } from './ui/keys.ts'
export type { Mark } from './ui/theme.ts'
export type { Background, ThemeChanges } from './ui/theme.ts'
export type { AffordanceKind, Node } from './ui/node.ts'
export type { View, Views } from './views/entries.ts'

/** A screen a plugin places in the transcript's place: the key its plugin offers, and how it draws. */
export interface PlacedScreen {
  /** The key that opens it, as pi-tui names keys (`ctrl+shift+t`, `f2`); the binding its plugin offers in the one key table, so a person can rebind it. */
  readonly key: KeyId
  /** What the key does, as a person reads it in help. */
  readonly description: string
  /**
   * How the screen draws, with nodes as a view draws, handed the session's
   * facts read-only; nothing it does reaches the log. It is called again as
   * the facts arrive, the width changes, a person opens something on the
   * screen or the registration changes — not at every frame — so it is a
   * function of the facts and nothing else.
   */
  readonly draw: (facts: readonly Fact[]) => Node
}

/**
 * Where a placement goes on the page, top to bottom: the transcript's place,
 * lines above the composer, the composer, lines below it. The transcript's
 * place grows to fill the alternate screen; the rest take their height.
 */
export type Slot = 'transcript' | 'above-composer' | 'composer' | 'below-composer'

/**
 * What a placement draws: binnacle's transcript, binnacle's composer, or
 * lines of the author's own. The transcript goes only in its own slot, and
 * the composer only in its own; lines go anywhere but the transcript's place,
 * where a drawing is a placed screen.
 */
export type Placement =
  | { readonly kind: 'transcript' }
  | {
    readonly kind: 'composer'
    /**
     * What a line does once the person submits it: handed the line as
     * pi-tui's Editor submits it, trimmed of the whitespace around it, a
     * blank line included. binnacle's composer clears itself either way.
     * The built-in Composer plugin sends a line that is not blank.
     */
    readonly submit: (text: string) => void
  }
  | {
    readonly kind: 'lines'
    /**
     * How the lines draw, with nodes as a view draws, handed the session's
     * facts read-only. It is called again as the facts arrive, the width or
     * the theme changes, or the registrations change — not at every frame —
     * so it is a function of the facts and of what its plugin read at the
     * last of those.
     */
    readonly draw: (facts: readonly Fact[]) => Node
    /**
     * What an offer the lines draw does once a person invokes it: handed the
     * offer's id and the kind invoked. Any kind but `expand`, which opens a
     * fold where the lines draw one, reaches it. Lines in the composer's slot
     * that offer something take the keyboard while they stand; lines
     * elsewhere take no focus, and answer only the pointer.
     */
    readonly invoke?: (region: string, affordance: AffordanceKind) => void
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
   * on a placed screen. The screen answers the transcript's gestures — a
   * click, and Enter on a focused fold — with UI state of its own, and is
   * drawn again as its facts arrive or a person opens something on it, so a
   * frame costs what changed. The newest registration of a name places it;
   * disposing the plugin takes back its screen and its key, closing it if it
   * is open.
   * @param name - the screen's name, its registration's and its binding's.
   * @param screen - the key it offers, and how it draws.
   * @returns a disposer, for taking it back before the plugin is disposed.
   */
  screen(name: string, screen: PlacedScreen): () => void
  /**
   * Place what draws in a slot of the page. The transcript's and the
   * composer's slots draw their newest placement, and disposing it gives
   * back the one before; with none, the slot draws nothing — with no
   * composer, nothing takes typing, and what the host answers itself,
   * quitting included, still answers. The lines slots draw every placement,
   * oldest first, top to bottom. Lines in the composer's slot that offer
   * something take the keyboard while they stand, and an offer a person
   * invokes other than `expand` reaches their `invoke`; lines elsewhere take
   * no focus and answer only the pointer, which a `grant` or a `dismiss`
   * never invokes. A drawing that throws, or returns no node binnacle can
   * lay out, and an `invoke` that throws, draw what went wrong, naming the
   * registration, and never take the surface down.
   * @param slot - where it goes.
   * @param placement - what it draws there.
   * @returns a disposer, for taking it back before the plugin is disposed.
   * @throws when the placement cannot go in the slot — the transcript or the composer outside its own, or lines in the transcript's place — saying what to change.
   */
  place(slot: Slot, placement: Placement): () => void
  /**
   * Change the theme everything is drawn in — a mark's glyph or tone, and the
   * rest of the theme as it joins — without drawing anything again yourself.
   * The changes are data: what they name is laid over the theme beneath, the
   * newest registration over the ones before it, and what they leave out
   * stays as it was. Disposing one gives back what it changed, and every
   * entry is drawn again in the theme that is left.
   * @param changes - what to change.
   * @returns a disposer, for taking it back before the plugin is disposed.
   * @throws when the changes name what binnacle cannot draw — a colour not the terminal's, a mark with no glyph — saying by its path what to change.
   */
  theme(changes: ThemeChanges): () => void
  /**
   * Bind keys as a person asks, over the defaults, by binding id, in the one
   * key table everything reads — the composer, the alternate screen and
   * binnacle's own keys alike. An id is pi-tui's own (`tui.input.submit`),
   * binnacle's (`binnacle.quit`), a placed screen's (`binnacle.screen.<name>`)
   * or an affordance kind's (`binnacle.copy`), which is unbound until bound
   * and invokes that affordance on the focused thing that offers it. What
   * the registrations bind is laid over the defaults, the newest over the
   * ones before it, by id; disposing one gives back what it bound, and what
   * was handed over cannot be changed by changing the object after.
   * @param bindings - each binding id, and the key or keys it answers to, as pi-tui names keys.
   * @returns a disposer, for taking it back before the plugin is disposed.
   * @throws when the bindings are no record of ids to keys, an id is none binnacle has, a key is no string, or two ids come to share one key, saying what to change.
   */
  keys(bindings: Readonly<Record<string, KeyId | readonly KeyId[]>>): () => void
  /**
   * Send a line from the person to the session: a grant, an effect the host
   * performs, not a registration. It steers the agent, reaching a turn
   * already running at its next step, or starting a turn when none runs.
   * @param text - the line to send.
   * @throws when no session is open — before it opens, or after it closes — saying so.
   */
  send(text: string): void
  /**
   * Run a line as one of dsh's commands, `/compact`: a grant, performed on
   * the open session's agent through dsh's own commands. Commands are dsh's;
   * a plugin registers one with `ctx.commands`, never here.
   * @param line - the line, as the person wrote it.
   * @returns whether a command ran, whatever it returned; false when no command has the name, leaving the line to the caller.
   * @throws when no session is open — before it opens, or after it closes — saying so.
   */
  command(line: string): Promise<boolean>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** What an author registers with the surface: `ctx.binnacle`, typed for anything that imports the author API, as the host provides it. */
    binnacle: Registrations
  }
}
