/**
 * The `binnacle` service: the registrations of the author API, kept for the
 * host to adapt and draw with.
 *
 * Each registration is an effect bound to the plugin that made it, through
 * the context Cordis traces to the caller, so disposing that plugin takes
 * back what it registered. Its state is in TypeScript-private members, not
 * `#private` ones: Cordis hands each caller a traced copy of the service,
 * which a `#private` field refuses as its receiver.
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { AuthorAdapter, Registrations, View, Views } from '../api.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** What an author registers with the surface. */
    binnacle: Registrations
  }
}

/** The `binnacle` service, and what the host reads of it: the registrations as they stand, and when they change. */
export class RegistrationService extends Service implements Registrations {
  private readonly adapterTable = new Map<string, readonly AuthorAdapter[]>()
  private readonly newestAdapters = new Map<string, AuthorAdapter>()
  private readonly viewTable = new Map<string, readonly View[]>()
  private readonly listeners = new Set<() => void>()

  /**
   * @param ctx - the context the service is provided in; its fiber's disposal removes it.
   */
  constructor(ctx: Context) {
    super(ctx, 'binnacle')
  }

  /** The adapter that reads each dsh event type: the newest registered for it. */
  get adapters(): ReadonlyMap<string, AuthorAdapter> {
    return this.newestAdapters
  }

  /** Authors' views, by entry kind or authored fact name, each key's oldest first. */
  get views(): Views {
    return this.viewTable
  }

  /** @inheritDoc */
  facts(type: string, adapter: AuthorAdapter): () => void {
    return this.register(this.adapterTable, type, adapter, `binnacle.facts(${type})`)
  }

  /** @inheritDoc */
  view(key: string, view: View): () => void {
    return this.register(this.viewTable, key, view, `binnacle.view(${key})`)
  }

  /**
   * Hear when a registration comes or goes, so the screen is drawn again.
   * @param listener - called on each change.
   * @returns a function that stops listening.
   */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Register one entry as an effect of the calling plugin, above any the key already has.
   * @param into - the table.
   * @param value - what is registered.
   * @param label - the effect's label.
   * @returns the effect's disposer.
   */
  private register<T>(into: Map<string, readonly T[]>, key: string, value: T, label: string): () => void {
    return this.ctx.effect(() => {
      into.set(key, [...into.get(key) ?? [], value])
      this.changed()
      return () => {
        const rest = [...into.get(key) ?? []]
        // Any one of equal values: the same function registered twice leaves the same table whichever goes.
        rest.splice(rest.indexOf(value), 1)
        if (rest.length === 0) into.delete(key)
        else into.set(key, rest)
        this.changed()
      }
    }, label)
  }

  /** Take the newest adapter of each type, and tell every listener something changed. */
  private changed(): void {
    this.newestAdapters.clear()
    for (const [type, stack] of this.adapterTable) {
      const newest = stack.at(-1)
      if (newest !== undefined) this.newestAdapters.set(type, newest)
    }
    for (const listener of this.listeners) listener()
  }
}
