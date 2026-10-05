import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { Binnacle, Handle, Keys, Layout, Part, Screen } from '../api.ts'
import { CHAT } from './chat.ts'
import { actionsOf } from './keys.ts'

export class BinnacleService extends Service implements Binnacle {
  // TypeScript private, not #private: Cordis reaches the service through traced copies.
  private readonly screens: Screen[] = [CHAT]
  private readonly layouts = new Map<string, Layout[]>()
  private readonly parts = new Map<string, Part[]>()
  private readonly redraw: () => void
  private readonly forget: (part: Part) => void
  readonly keys: Keys = { actionsOf }

  constructor(ctx: Context, redraw: () => void, forget: (part: Part) => void) {
    super(ctx, 'binnacle')
    this.redraw = redraw
    this.forget = forget
  }

  get layoutOnView(): Layout {
    const screen = this.screenOnView
    return this.layouts.get(screen.name)?.at(-1) ?? screen.layout
  }

  get focusOnView(): string | undefined {
    return this.screenOnView.focus
  }

  private get screenOnView(): Screen {
    return this.screens.at(-1) ?? CHAT
  }

  partIn(place: string): Part | undefined {
    return this.parts.get(place)?.at(-1)
  }

  show(screen: Screen): Handle {
    return this.hold(this.screens, screen, 'binnacle: a screen shown')
  }

  layout(screen: string, layout: Layout): Handle {
    return this.hold(listIn(this.layouts, screen), layout, 'binnacle: a layout')
  }

  place(name: string, part: Part): Handle {
    return this.hold(listIn(this.parts, name), part, 'binnacle: a part placed', () => {
      this.forget(part)
    })
  }

  private hold<T>(list: T[], item: T, label: string, changed?: () => void): Handle {
    list.push(item)
    this.redraw()
    let held = true
    const release = (): void => {
      if (!held) return
      held = false
      list.splice(list.indexOf(item), 1)
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
