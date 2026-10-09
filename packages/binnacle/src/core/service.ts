import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type {
  Action,
  Binnacle,
  Gestures,
  Handle,
  Layout,
  Look,
  Model,
  Part,
  PlacedHandle,
  Point,
  Screen,
  ThemeLayer,
  Tokens,
  Tone,
} from '../api.ts'
import type { TerminalColorMode } from '../terminal/colors.ts'
import { Actions } from './actions.ts'
import type { SetAction, SetBinding } from './actions.ts'
import { CHAT } from './chat.ts'
import { actionsOf } from './gestures.ts'
import { drawer } from './looks.ts'
import type { Make } from './looks.ts'
import { checkLayer, layered, painter } from './theme.ts'

/** What the service asks of what draws. */
export interface Drawn {
  redraw(): void
  /** The Part is wrapped again at its next draw. */
  forget(part: Part): void
  /** Every Part is wrapped again at its next draw: the theme or a Look changed. */
  forgetAll(): void
  colorMode(): TerminalColorMode
  /** Scrolls a Place drawn by pages of its box, toward its last line when `pages` is positive. */
  scroll(place: string, pages: number): void
}

/** The Place the Focus was moved to, and whether it has had the Focus since. */
export interface Moved {
  readonly place: string
  had: boolean
}

/** One registration. Each is held apart, so that one object registered twice goes only with the plugin whose registration unloads. */
export interface Held<T> {
  readonly item: T
  /** Registered by a row of the bundle: it ranks beneath every author's. */
  readonly builtIn: boolean
}

/** The part of a Cordis fiber that the loader adds: the row whose plugin it is, or none on a child plugin. */
interface Fiber {
  readonly entry?: { readonly options: { readonly name: string } }
  readonly parent: { readonly fiber: Fiber }
}

// A child plugin has no row of its own: the row is the first of its parents' that has one, as the loader's `locate` finds it.
function builtIn(fiber: Fiber): boolean {
  for (let at = fiber; ; at = at.parent.fiber) {
    const name = at.entry?.options.name
    if (name !== undefined) return name === 'binnacle' || name.startsWith('binnacle/')
    if (at.parent.fiber === at) return false
  }
}

interface Themed {
  readonly tokens: Tokens
  readonly paint: (tone: Tone, text: string) => string
}

export class BinnacleService extends Service implements Binnacle {
  // TypeScript private, not #private: Cordis reaches the service through traced copies.
  private readonly chat: Held<Screen> = { item: CHAT, builtIn: true }
  private readonly screens: Held<Screen>[] = [this.chat]
  private readonly layouts = new Map<string, Held<Layout>[]>()
  private readonly parts = new Map<string, Held<Part>[]>()
  private readonly models = new Map<string, Held<Model<object>>[]>()
  // The Place the Focus was moved to, for each Screen shown; null once the core forgot it.
  private readonly moved = new Map<Held<Screen>, Moved | null>()
  private readonly layers: Held<ThemeLayer>[] = []
  private readonly looks = new Map<string, Held<Make>[]>()
  // One list for every id, oldest first, as the newest set wins among actions of different ids.
  private readonly set: SetAction[] = []
  private readonly bindings: SetBinding[] = []
  readonly actions = new Actions(this.set, this.bindings)
  // Made again from the layers at the next read, after a layer comes or goes. A method runs on a traced copy, where a field set stays on the copy, so the field is an object that is changed.
  private readonly themed: { now?: Themed } = {}
  private readonly drawn: Drawn
  readonly gestures: Gestures = { actionsOf }

  constructor(ctx: Context, drawn: Drawn) {
    super(ctx, 'binnacle')
    this.drawn = drawn
  }

  get tokens(): Tokens {
    return this.themeNow().tokens
  }

  paint(tone: Tone, text: string): string {
    return this.themeNow().paint(tone, text)
  }

  theme(layer: ThemeLayer): Handle {
    checkLayer(layer)
    const restyle = (): void => {
      delete this.themed.now
      this.drawn.forgetAll()
    }
    restyle()
    return this.hold(this.layers, layer, 'binnacle: a theme layer', undefined, restyle)
  }

  look<F extends Look>(name: string, make: (beneath: F) => F): Handle {
    const restyle = (): void => this.drawn.forgetAll()
    restyle()
    return this.hold(listIn(this.looks, name), make as unknown as Make, 'binnacle: a look', undefined, restyle)
  }

  lookOf<F extends Look>(names: readonly string[], fallback: F): F {
    // An instance can be named like its kind, and a name read twice would put each of its Looks twice in the chain.
    const once = [...new Set(names)]
    return drawer(() => once.flatMap((name) => (this.looks.get(name) ?? []).toReversed()), fallback)
  }

  action(id: string, action: Action): Handle {
    return this.hold(this.set, { id, action }, 'binnacle: an action')
  }

  bind(name: string, keys: readonly string[]): Handle {
    return this.hold(this.bindings, { name, keys }, 'binnacle: a binding')
  }

  keysOf(id: string): readonly string[] {
    return this.actions.keysOf(id)
  }

  run(id: string, at?: Point): void {
    this.actions.run(id, at)
  }

  /** A Place takes keys while its Part does, or while an action acts in it. */
  takesKeys(place: string): boolean {
    const part = this.partIn(place)
    return part !== undefined && (part.key !== undefined || this.actions.actsIn(place))
  }

  clickActions(gesture: string, place: string, at: Point | undefined): boolean {
    return this.actions.click(gesture, place, at)
  }

  get layoutOnView(): Layout {
    const screen = this.screenOnView
    return this.layouts.get(screen.name)?.at(-1)?.item ?? screen.layout
  }

  get screenOnView(): Screen {
    return this.shown().item
  }

  focusMovedTo(): Moved | null | undefined {
    return this.moved.get(this.shown())
  }

  /** A person or an author moved the Focus on the Screen on view. */
  moveFocus(place: string): void {
    this.moved.set(this.shown(), { place, had: false })
    this.drawn.redraw()
  }

  focus(place: string): void {
    this.moveFocus(place)
  }

  scroll(place: string, pages: number): void {
    this.drawn.scroll(place, pages)
  }

  /** The Focus moved on the Screen on view is forgotten: its Place had it and stopped taking keys. */
  forgetMovedFocus(): void {
    this.moved.set(this.shown(), null)
  }

  partIn(place: string): Part | undefined {
    return this.parts.get(place)?.at(-1)?.item
  }

  show(screen: Screen): Handle {
    return this.hold(this.screens, screen, 'binnacle: a screen shown', undefined, (entry) => this.moved.delete(entry))
  }

  layout(name: string, layout: Layout): Handle {
    return this.hold(listIn(this.layouts, name), layout, 'binnacle: a layout')
  }

  layoutNamed(name: string): Layout | undefined {
    return this.layouts.get(name)?.at(-1)?.item
  }

  place(name: string, part: Part): PlacedHandle {
    let stops: (() => void)[] = []
    const handle = this.hold(
      listIn(this.parts, name),
      part,
      'binnacle: a part placed',
      () => {
        this.drawn.forget(part)
      },
      () => {
        for (const stop of stops) stop()
      },
    )
    stops = (part.models ?? []).map((model) => model.watch(() => handle.redraw()))
    return { ...handle, focus: () => this.moveFocus(name) }
  }

  model<S extends object>(name: string, model: Model<S>): Handle {
    return this.hold(listIn(this.models, name), model as Model<object>, 'binnacle: a model named')
  }

  modelOf<S extends object>(name: string): Model<S> | undefined {
    return this.models.get(name)?.at(-1)?.item as Model<S> | undefined
  }

  private themeNow(): Themed {
    if (this.themed.now === undefined) {
      const tokens = layered(this.layers.map(({ item }) => item))
      this.themed.now = { tokens, paint: painter(tokens, this.drawn.colorMode()) }
    }
    return this.themed.now
  }

  private shown(): Held<Screen> {
    return this.screens.at(-1) ?? this.chat
  }

  private hold<T>(list: Held<T>[], item: T, label: string, changed?: () => void, off?: (entry: Held<T>) => void): Handle {
    // In a traced copy, `this.ctx` is the calling plugin's context, so its fiber is the plugin that registers.
    const entry: Held<T> = { item, builtIn: builtIn(this.ctx.fiber as unknown as Fiber) }
    const firstAuthor = list.findIndex((held) => !held.builtIn)
    if (entry.builtIn && firstAuthor !== -1) list.splice(firstAuthor, 0, entry)
    else list.push(entry)
    this.drawn.redraw()
    let held = true
    const release = (): void => {
      if (!held) return
      held = false
      list.splice(list.indexOf(entry), 1)
      off?.(entry)
      this.drawn.redraw()
    }
    // What the calling plugin holds goes when it unloads.
    const dispose = this.ctx.effect(() => release, label)
    return {
      redraw: () => {
        if (!held) return
        changed?.()
        this.drawn.redraw()
      },
      dispose: () => {
        void dispose()
      },
    }
  }
}

function listIn<T>(lists: Map<string, T[]>, name: string): T[] {
  const list = lists.get(name) ?? []
  lists.set(name, list)
  return list
}
