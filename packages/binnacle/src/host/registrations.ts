import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { KeybindingsConfig, KeyId } from '@earendil-works/pi-tui'
import type { AuthorAdapter, PlacedScreen, Placement, Registrations, Slot, ThemeChanges, View, Views } from '../api.ts'
import { binnacleTheme, themed } from '../ui/theme.ts'
import { parseThemeChanges } from '../ui/theme-changes.ts'
import { refusedBindings } from '../ui/keys.ts'
import type { Theme } from '../ui/theme.ts'

/** `drawn` is what a plugin's drawings read, which it asked to draw again. */
export type RegistrationsChanged = 'facts' | 'views' | 'screens' | 'placements' | 'theme' | 'keys' | 'drawn'

export interface GrantedSession {
  send(text: string): void
  /** Resolves whether a command ran. */
  command(line: string): Promise<boolean>
  readonly agent: Agent
}

const slots: readonly string[] = ['transcript', 'above-composer', 'composer', 'below-composer', 'dialog'] satisfies readonly Slot[]

/** Why a placement cannot go in a slot, as what to change; undefined when it may. */
function misplaced(slot: Slot, placement: Placement): string | undefined {
  // An author's code may be untyped, so what the types say is checked here, where it enters.
  if (!slots.includes(slot)) return 'no such slot; the slots are transcript, above-composer, composer, below-composer and dialog'
  const kind: unknown = (placement as { readonly kind?: unknown } | undefined)?.kind
  const drawn = kind === 'lines' && typeof (placement as { readonly draw?: unknown }).draw === 'function'
  const submits = kind === 'composer' && typeof (placement as { readonly submit?: unknown }).submit === 'function'
  if (kind !== 'transcript' && !submits && !drawn) return 'a placement is { kind: \'transcript\' }, { kind: \'composer\', submit } or { kind: \'lines\', draw }, each a function'
  if (placement.kind === 'transcript' && slot !== 'transcript') return 'the transcript goes only in the transcript slot'
  if (placement.kind === 'composer' && slot !== 'composer') return 'the composer goes only in the composer slot'
  if (placement.kind === 'lines' && slot === 'transcript') return 'lines cannot take the transcript\'s place; place a screen there with binnacle.screen'
  return undefined
}

/**
 * The own entries of each source laid one over the next, latest wins, defined as own properties: `Object.assign` sets,
 * so an id only an own property carries — `__proto__`, as JSON.parse makes it — reaches the prototype's setter and is
 * dropped, before it can be refused or layered. Sources are oldest first.
 */
function overlaid(...sources: readonly Readonly<Record<string, KeyId | readonly KeyId[] | undefined>>[]): KeybindingsConfig {
  return Object.fromEntries(sources.flatMap(source => Object.entries(source))) as KeybindingsConfig
}

/**
 * Each registration is an effect bound to the plugin that made it, through the context Cordis traces to the caller,
 * so disposing that plugin takes back what it registered.
 */
export class RegistrationService extends Service implements Registrations {
  // State is in TypeScript-private members, not `#private` ones: Cordis hands each caller a traced copy of the service,
  // which a `#private` field refuses as its receiver.
  private readonly adapterTable = new Map<string, readonly AuthorAdapter[]>()
  private readonly newestAdapters = new Map<string, AuthorAdapter>()
  private readonly viewTable = new Map<string, readonly View[]>()
  private readonly screenTable = new Map<string, readonly PlacedScreen[]>()
  private readonly newestScreens = new Map<string, PlacedScreen>()
  private readonly placementTable = new Map<string, readonly Placement[]>()
  private readonly bindingTable = new Map<string, readonly Readonly<Record<string, KeyId | readonly KeyId[]>>[]>()
  private bound: KeybindingsConfig = {}
  private granted: GrantedSession | undefined
  private readonly themeTable = new Map<string, readonly ThemeChanges[]>()
  private drawnIn: Theme = binnacleTheme
  private readonly listeners = new Set<(changed: RegistrationsChanged) => void>()

  constructor(ctx: Context) {
    super(ctx, 'binnacle')
  }

  /** The newest adapter registered for each dsh event type. */
  get adapters(): ReadonlyMap<string, AuthorAdapter> {
    return this.newestAdapters
  }

  /** By entry kind or authored fact name, each key's oldest first. */
  get views(): Views {
    return this.viewTable
  }

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

  /** Binnacle's theme, with each theme registration laid over it, oldest first. */
  get currentTheme(): Theme {
    return this.drawnIn
  }

  /**
   * @inheritDoc
   * @throws when the changes name what binnacle cannot draw, saying what to change.
   */
  theme(changes: ThemeChanges): () => void {
    return this.register(this.themeTable, 'theme', parseThemeChanges(changes, this.drawnIn), 'binnacle.theme', 'theme')
  }

  /** @inheritDoc */
  screen(name: string, screen: PlacedScreen): () => void {
    return this.register(this.screenTable, name, screen, `binnacle.screen(${name})`, 'screens')
  }

  /** @inheritDoc */
  keys(bindings: Readonly<Record<string, KeyId | readonly KeyId[]>>): () => void {
    // An author's code may be untyped, so what the types say is checked here, where it enters.
    if (typeof bindings !== 'object' || bindings === null || Array.isArray(bindings)) throw new Error(`binnacle.keys: bindings is ${String(bindings)}; bind a record from binding ids to keys, such as { 'binnacle.quit': 'ctrl+q' }`)
    // An author's code may change the object after handing it over, so what is registered is what stood at entry: the
    // record copied, and each array in it. Each registration its own object also lets its disposal find its own layer.
    const given = Object.fromEntries(Object.entries(bindings).map(([id, keys]) => [id, Array.isArray(keys) ? [...keys] : keys]))
    // What the registrations would bind together with this one, checked before it joins them.
    const refused = refusedBindings(overlaid(this.bound, given))
    if (refused !== undefined) throw new Error(`binnacle.keys: ${refused}`)
    return this.register(this.bindingTable, 'keys', given, 'binnacle.keys', 'keys')
  }

  /** Each id's newest binding. */
  get bindings(): KeybindingsConfig {
    return this.bound
  }

  /** @inheritDoc */
  send(text: string): void {
    const session = this.granted
    if (session === undefined) throw new Error('binnacle.send: no session is open; a line can be sent once the session opens, and until it closes')
    session.send(text)
  }

  /** @inheritDoc */
  agent(): Agent {
    const session = this.granted
    if (session === undefined) throw new Error('binnacle.agent: no session is open; the agent on screen can be read once the session opens, and until it closes')
    return session.agent
  }

  async command(line: string): Promise<boolean> {
    const session = this.granted
    if (session === undefined) throw new Error('binnacle.command: no session is open; a command can be run once the session opens, and until it closes')
    return await session.command(line)
  }

  /** Open the grants onto a session; the returned function closes them, as the session closes. */
  open(session: GrantedSession): () => void {
    this.granted = session
    return () => { if (this.granted === session) this.granted = undefined }
  }

  /** @inheritDoc */
  place(slot: Slot, placement: Placement): () => void {
    const refused = misplaced(slot, placement)
    if (refused !== undefined) throw new Error(`binnacle.place(${slot}): ${refused}`)
    return this.register(this.placementTable, slot, placement, `binnacle.place(${slot})`, 'placements')
  }

  /** Oldest first; the transcript's and the composer's slots draw the last. */
  placed(slot: Slot): readonly Placement[] {
    return this.placementTable.get(slot) ?? []
  }

  /**
   * @inheritDoc
   * The key's views are put back as a new stack, which is how a drawing knows it is stale.
   */
  redraw(): void {
    this.changed('drawn')
  }

  invalidate(key: string): void {
    const stack = this.viewTable.get(key)
    if (stack === undefined) return
    this.viewTable.set(key, [...stack])
    this.changed('views')
  }

  /** Listeners hear when a registration comes or goes, or a key is invalidated, with the table that changed. */
  onChange(listener: (changed: RegistrationsChanged) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** The entry goes above any the key already has; `table` is which table `into` is, for the listeners. */
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
    // Each id bound by the newest registration that binds it, as one config for pi-tui's manager.
    if (table === 'keys') this.bound = overlaid(...this.bindingTable.get('keys') ?? [])
    if (table === 'theme') this.drawnIn = themed(binnacleTheme, this.themeTable.get('theme') ?? [])
    for (const listener of this.listeners) listener(table)
  }
}
