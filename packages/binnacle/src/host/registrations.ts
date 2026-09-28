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
import type { AuthorAdapter, PlacedScreen, Registrations, ThemeChanges, View, Views } from '../api.ts'
import { binnacleTheme, themed } from '../ui/theme.ts'
import { parseThemeChanges } from '../ui/theme-changes.ts'
import type { Theme } from '../ui/theme.ts'

/** What changed in the registrations, for a listener: the adapters, the views, the placed screens, or the theme. */
export type RegistrationsChanged = 'facts' | 'views' | 'screens' | 'theme'

/** The `binnacle` service, and what the host reads of it: the registrations as they stand, and when they change. */
export class RegistrationService extends Service implements Registrations {
  private readonly adapterTable = new Map<string, readonly AuthorAdapter[]>()
  private readonly newestAdapters = new Map<string, AuthorAdapter>()
  private readonly viewTable = new Map<string, readonly View[]>()
  private readonly screenTable = new Map<string, readonly PlacedScreen[]>()
  private readonly newestScreens = new Map<string, PlacedScreen>()
  private readonly themeTable = new Map<string, readonly ThemeChanges[]>()
  private drawnIn: Theme = binnacleTheme
  private readonly listeners = new Set<(changed: RegistrationsChanged) => void>()

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

  /** The screens plugins placed, by name: the newest registration of each. */
  get screens(): ReadonlyMap<string, PlacedScreen> {
    return this.newestScreens
  }

  /** @inheritDoc */
  facts(type: string, adapter: AuthorAdapter): () => void {
    return this.register(this.adapterTable, type, adapter, `binnacle.facts(${type})`, 'facts')
  }

  /** @inheritDoc */
  view(key: string, view: View): () => void {
    return this.register(this.viewTable, key, view, `binnacle.view(${key})`, 'views')
  }

  /** The theme drawn in: binnacle's, with each theme registration laid over it, oldest first. */
  get currentTheme(): Theme {
    return this.drawnIn
  }

  /**
   * @inheritDoc
   * @throws when the changes name what binnacle cannot draw, saying what to change.
   */
  theme(changes: ThemeChanges): () => void {
    return this.register(this.themeTable, 'theme', parseThemeChanges(changes), 'binnacle.theme', 'theme')
  }

  /** @inheritDoc */
  screen(name: string, screen: PlacedScreen): () => void {
    return this.register(this.screenTable, name, screen, `binnacle.screen(${name})`, 'screens')
  }

  /**
   * @inheritDoc
   * The key's views are put back as a new stack, which is how a drawing knows it is stale.
   */
  invalidate(key: string): void {
    const stack = this.viewTable.get(key)
    if (stack === undefined) return
    this.viewTable.set(key, [...stack])
    this.changed('views')
  }

  /**
   * Hear when a registration comes or goes, or a key is invalidated, so the screen is drawn again.
   * @param listener - called on each change, with the table it changed: the adapters, which change the facts; the views; or the placed screens.
   * @returns a function that stops listening.
   */
  onChange(listener: (changed: RegistrationsChanged) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Register one entry as an effect of the calling plugin, above any the key already has.
   * @param into - the table.
   * @param value - what is registered.
   * @param label - the effect's label.
   * @param table - which table `into` is, for the listeners.
   * @returns the effect's disposer.
   */
  private register<T>(into: Map<string, readonly T[]>, key: string, value: T, label: string, table: RegistrationsChanged): () => void {
    return this.ctx.effect(() => {
      into.set(key, [...into.get(key) ?? [], value])
      this.changed(table)
      return () => {
        const rest = [...into.get(key) ?? []]
        // Any one of equal values: the same function registered twice leaves the same table whichever goes.
        rest.splice(rest.indexOf(value), 1)
        if (rest.length === 0) into.delete(key)
        else into.set(key, rest)
        this.changed(table)
      }
    }, label)
  }

  /** Take the newest adapter of each type, the newest screen of each name and the theme the registrations leave, and tell every listener which table changed. */
  private changed(table: RegistrationsChanged): void {
    this.newestAdapters.clear()
    for (const [type, stack] of this.adapterTable) {
      const newest = stack.at(-1)
      if (newest !== undefined) this.newestAdapters.set(type, newest)
    }
    this.newestScreens.clear()
    for (const [name, stack] of this.screenTable) {
      const newest = stack.at(-1)
      if (newest !== undefined) this.newestScreens.set(name, newest)
    }
    // A new theme object each change, so what was kept against the old one is known stale.
    if (table === 'theme') this.drawnIn = themed(binnacleTheme, this.themeTable.get('theme') ?? [])
    for (const listener of this.listeners) listener(table)
  }
}
