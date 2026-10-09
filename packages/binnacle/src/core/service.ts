import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { Binnacle, Gestures, Handle, Layout, Model, Part, Screen } from '../api.ts'
import { CHAT } from './chat.ts'
import { actionsOf } from './gestures.ts'

export class BinnacleService extends Service implements Binnacle {
  // TypeScript private, not #private: Cordis reaches the service through traced copies.
  private readonly screens: Screen[] = [CHAT]
  private readonly layouts = new Map<string, Layout[]>()
  private readonly parts = new Map<string, Part[]>()
  // Each naming is held apart, as one Model can be named more than once.
  private readonly models = new Map<string, { readonly model: Model<object> }[]>()
  // The Place a person moved the Focus to, for each Screen shown; null once the core forgot it.
  private readonly moved = new Map<Screen, string | null>()
  private readonly redraw: () => void
  private readonly forget: (part: Part) => void
  readonly gestures: Gestures = { actionsOf }

  constructor(ctx: Context, redraw: () => void, forget: (part: Part) => void) {
    super(ctx, 'binnacle')
    this.redraw = redraw
    this.forget = forget
  }

  get layoutOnView(): Layout {
    const screen = this.screenOnView
    return this.layouts.get(screen.name)?.at(-1) ?? screen.layout
  }

  get screenOnView(): Screen {
    return this.screens.at(-1) ?? CHAT
  }

  focusMovedTo(): string | null | undefined {
    return this.moved.get(this.screenOnView)
  }

  /** A person moved the Focus on the Screen on view. */
  moveFocus(place: string): void {
    this.moved.set(this.screenOnView, place)
    this.redraw()
  }

  /** The Focus a person moved on the Screen on view is forgotten: its Place stopped taking keys. */
  forgetMovedFocus(): void {
    this.moved.set(this.screenOnView, null)
  }

  partIn(place: string): Part | undefined {
    return this.parts.get(place)?.at(-1)
  }

  show(screen: Screen): Handle {
    return this.hold(this.screens, screen, 'binnacle: a screen shown', undefined, () => this.moved.delete(screen))
  }

  layout(screen: string, layout: Layout): Handle {
    return this.hold(listIn(this.layouts, screen), layout, 'binnacle: a layout')
  }

  place(name: string, part: Part): Handle {
    let stops: (() => void)[] = []
    const handle = this.hold(
      listIn(this.parts, name),
      part,
      'binnacle: a part placed',
      () => {
        this.forget(part)
      },
      () => {
        for (const stop of stops) stop()
      },
    )
    stops = (part.models ?? []).map((model) => model.watch(() => handle.redraw()))
    return handle
  }

  model<S extends object>(name: string, model: Model<S>): Handle {
    return this.hold(listIn(this.models, name), { model: model as Model<object> }, 'binnacle: a model named')
  }

  modelOf<S extends object>(name: string): Model<S> | undefined {
    return this.models.get(name)?.at(-1)?.model as Model<S> | undefined
  }

  private hold<T>(list: T[], item: T, label: string, changed?: () => void, off?: () => void): Handle {
    list.push(item)
    this.redraw()
    let held = true
    const release = (): void => {
      if (!held) return
      held = false
      list.splice(list.indexOf(item), 1)
      off?.()
      this.redraw()
    }
    // In a traced copy, `this.ctx` is the calling plugin's context, so what it holds goes when that plugin unloads.
    const dispose = this.ctx.effect(() => release, label)
    return {
      redraw: () => {
        if (!held) return
        changed?.()
        this.redraw()
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
