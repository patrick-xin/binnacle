import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { KeybindingsConfig, KeyId } from '@earendil-works/pi-tui'
import type {
  AuthorAdapter,
  CardKind,
  CardRow,
  PlacedScreen,
  Placement,
  Registrations,
  Part,
  PartView,
  Slot,
  ThemeChanges,
  View,
  Views,
} from '../api.ts'
import { binnacleTheme, themed } from '../ui/theme.ts'
import { parseThemeChanges } from '../ui/theme-changes.ts'
import { refusedBindings } from '../ui/keys.ts'
import { watchThemeFile, type Clock } from './theme-file.ts'
import type { TerminalLook, Theme } from '../ui/theme.ts'

export type RegistrationsChanged = 'facts' | 'views' | 'screens' | 'placements' | 'theme' | 'keys' | 'drawn'

export interface GrantedSession {
  send(text: string): void
  command(line: string): Promise<boolean>
  readonly agent: Agent
}

const slots: readonly string[] = ['transcript', 'above-composer', 'composer', 'below-composer', 'dialog'] satisfies readonly Slot[]

function misplaced(slot: Slot, placement: Placement): string | undefined {
  // An author's code may be untyped, so what the types say is checked here, where it enters.
  if (!slots.includes(slot)) return 'no such slot; the slots are transcript, above-composer, composer, below-composer and dialog'
  const kind: unknown = (placement as { readonly kind?: unknown } | undefined)?.kind
  const drawn = kind === 'lines' && typeof (placement as { readonly draw?: unknown }).draw === 'function'
  const submits = kind === 'composer' && typeof (placement as { readonly submit?: unknown }).submit === 'function'
  if (kind !== 'transcript' && !submits && !drawn)
    return "a placement is { kind: 'transcript' }, { kind: 'composer', submit } or { kind: 'lines', draw }, each a function"
  if (placement.kind === 'transcript' && slot !== 'transcript') return 'the transcript goes only in the transcript slot'
  if (placement.kind === 'composer' && slot !== 'composer') return 'the composer goes only in the composer slot'
  if (placement.kind === 'lines' && slot === 'transcript')
    return "lines cannot take the transcript's place; place a screen there with binnacle.screen"
  return undefined
}

// Using own properties prevents `__proto__` from reaching the prototype's setter.
function overlaid(...sources: readonly Readonly<Record<string, KeyId | readonly KeyId[] | undefined>>[]): KeybindingsConfig {
  return Object.fromEntries(sources.flatMap((source) => Object.entries(source))) as KeybindingsConfig
}

export class RegistrationService extends Service implements Registrations {
  // Uses TypeScript private, not #private, so Cordis traced copies can access state.
  private readonly adapterTable = new Map<string, readonly AuthorAdapter[]>()
  private readonly newestAdapters = new Map<string, AuthorAdapter>()
  private readonly viewTable = new Map<string, readonly View[]>()
  private readonly cardTable = new Map<string, readonly CardRow[]>()
  private readonly screenTable = new Map<string, readonly PlacedScreen[]>()
  private readonly newestScreens = new Map<string, PlacedScreen>()
  private readonly placementTable = new Map<string, readonly Placement[]>()
  private readonly bindingTable = new Map<string, readonly Readonly<Record<string, KeyId | readonly KeyId[]>>[]>()
  private bound: KeybindingsConfig = {}
  private granted: GrantedSession | undefined
  private readonly clock: Clock
  private readonly standing: string[] = []
  private noticeSink: ((text: string) => void) | undefined
  private readonly themeTable = new Map<string, readonly ThemeChanges[]>()
  private drawnIn: Theme = binnacleTheme
  private look: TerminalLook = { mode: 'truecolor' }
  private readonly listeners = new Set<(changed: RegistrationsChanged) => void>()

  constructor(ctx: Context, clock: Clock) {
    super(ctx, 'binnacle')
    this.clock = clock
  }

  get adapters(): ReadonlyMap<string, AuthorAdapter> {
    return this.newestAdapters
  }

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
  view<K extends Part['kind']>(key: K, view: PartView<K>): () => void
  view(key: string, view: View): () => void
  view(key: string, view: View | PartView<'thinking'> | PartView<'output'>): () => void {
    return this.register(this.viewTable, key, view as View, `binnacle.view(${key})`, 'views')
  }

  /** @inheritDoc */
  card(kind: CardKind, row: CardRow): () => void {
    return this.register(this.cardTable, kind, row, `binnacle.card(${kind})`, 'cards')
  }

  /** @inheritDoc */
  cards(kind: CardKind): readonly CardRow[] {
    return this.cardTable.get(kind) ?? []
  }

  get currentTheme(): Theme {
    return this.drawnIn
  }

  /** The host's: what the terminal binnacle draws on is, so the theme is drawn for it, every registration's variant included. */
  drawOn(look: TerminalLook): void {
    this.look = look
    this.drawnIn = themed(binnacleTheme, this.themeTable.get('theme') ?? [], look)
    for (const listener of this.listeners) listener('theme')
  }

  /**
   * @inheritDoc
   * @throws when the changes name what binnacle cannot draw, saying what to change.
   */
  theme(changes: ThemeChanges): () => void {
    return this.register(this.themeTable, 'theme', parseThemeChanges(changes, this.drawnIn), 'binnacle.theme', 'theme')
  }

  /** @inheritDoc */
  themeFile(name: string, listener: (data: unknown) => void): () => void {
    if (name === '' || name.includes('/') || name.includes('\\') || name.includes('..'))
      throw new Error(
        `binnacle.themeFile: ${JSON.stringify(name)} is not a plain file name; name a file in the profile's themes directory, as x for themes/x.json`,
      )
    return this.ctx.effect(
      () => watchThemeFile(this.ctx, name, listener, this.clock, (text) => this.raise(text)),
      `binnacle.themeFile(${name})`,
    )
  }

  /** @inheritDoc */
  screen(name: string, screen: PlacedScreen): () => void {
    return this.register(this.screenTable, name, screen, `binnacle.screen(${name})`, 'screens')
  }

  /** @inheritDoc */
  keys(bindings: Readonly<Record<string, KeyId | readonly KeyId[]>>): () => void {
    // Types checked at entry since author code may be untyped.
    if (typeof bindings !== 'object' || bindings === null || Array.isArray(bindings))
      throw new Error(
        `binnacle.keys: bindings is ${String(bindings)}; bind a record from binding ids to keys, such as { 'binnacle.quit': 'ctrl+q' }`,
      )
    // Copy to prevent changes after handing over; each registration its own object.
    const given = Object.fromEntries(Object.entries(bindings).map(([id, keys]) => [id, Array.isArray(keys) ? [...keys] : keys]))
    const refused = refusedBindings(overlaid(this.bound, given))
    if (refused !== undefined) throw new Error(`binnacle.keys: ${refused}`)
    return this.register(this.bindingTable, 'keys', given, 'binnacle.keys', 'keys')
  }

  get bindings(): KeybindingsConfig {
    return this.bound
  }

  /** @inheritDoc */
  send(text: string): void {
    const session = this.granted
    if (session === undefined)
      throw new Error('binnacle.send: no session is open; a line can be sent once the session opens, and until it closes')
    session.send(text)
  }

  /** @inheritDoc */
  agent(): Agent {
    const session = this.granted
    if (session === undefined)
      throw new Error('binnacle.agent: no session is open; the agent on screen can be read once the session opens, and until it closes')
    return session.agent
  }

  async command(line: string): Promise<boolean> {
    const session = this.granted
    if (session === undefined)
      throw new Error('binnacle.command: no session is open; a command can be run once the session opens, and until it closes')
    return await session.command(line)
  }

  open(session: GrantedSession): () => void {
    this.granted = session
    return () => {
      if (this.granted === session) this.granted = undefined
    }
  }

  /** The host's: a notice for the person, raised wherever it comes from, shown at once when the surface stands and held until it does. */
  raise(text: string): void {
    const sink = this.noticeSink
    if (sink === undefined) this.standing.push(text)
    else sink(text)
  }

  /** Connect where notices go once the surface stands, showing each one already standing. */
  notices(sink: (text: string) => void): () => void {
    this.noticeSink = sink
    const standing = [...this.standing]
    this.standing.length = 0
    for (const text of standing) sink(text)
    return () => {
      if (this.noticeSink === sink) this.noticeSink = undefined
    }
  }

  /** @inheritDoc */
  place(slot: Slot, placement: Placement): () => void {
    const refused = misplaced(slot, placement)
    if (refused !== undefined) throw new Error(`binnacle.place(${slot}): ${refused}`)
    return this.register(this.placementTable, slot, placement, `binnacle.place(${slot})`, 'placements')
  }

  placed(slot: Slot): readonly Placement[] {
    return this.placementTable.get(slot) ?? []
  }

  /** @inheritDoc */
  redraw(): void {
    this.changed('drawn')
  }

  invalidate(key: string): void {
    const stack = this.viewTable.get(key)
    if (stack === undefined) return
    this.viewTable.set(key, [...stack])
    this.changed('views')
  }

  onChange(listener: (changed: RegistrationsChanged) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private register<T>(
    into: Map<string, readonly T[]>,
    key: string,
    value: T,
    label: string,
    table: RegistrationsChanged | 'cards',
  ): () => void {
    return this.ctx.effect(() => {
      into.set(key, [...(into.get(key) ?? []), value])
      this.changed(table)
      return () => {
        const rest = [...(into.get(key) ?? [])]
        // Find by reference, so duplicate registrations only remove the first.
        rest.splice(rest.indexOf(value), 1)
        if (rest.length === 0) into.delete(key)
        else into.set(key, rest)
        this.changed(table)
      }
    }, label)
  }

  private changed(changing: RegistrationsChanged | 'cards'): void {
    let table: RegistrationsChanged
    if (changing === 'cards') {
      // A row draws inside the tool view, so the tool entries are drawn again as a new stack of it.
      const tool = this.viewTable.get('tool')
      if (tool !== undefined) this.viewTable.set('tool', [...tool])
      table = 'views'
    } else table = changing
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
    if (table === 'keys') this.bound = overlaid(...(this.bindingTable.get('keys') ?? []))
    if (table === 'theme') this.drawnIn = themed(binnacleTheme, this.themeTable.get('theme') ?? [], this.look)
    for (const listener of this.listeners) listener(table)
  }
}
