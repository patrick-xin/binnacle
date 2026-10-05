import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { Binnacle, Screen, Shown } from '../api.ts'

export class BinnacleService extends Service implements Binnacle {
  // TypeScript private, not #private: Cordis reaches the service through traced copies.
  private readonly screens: Screen[] = []
  private readonly redraw: () => void
  readonly session: string | undefined

  constructor(ctx: Context, session: string | undefined, redraw: () => void) {
    super(ctx, 'binnacle')
    this.session = session
    this.redraw = redraw
  }

  get onView(): Screen | undefined {
    return this.screens.at(-1)
  }

  show(screen: Screen): Shown {
    this.screens.push(screen)
    this.redraw()
    let shown = true
    const hide = (): void => {
      if (!shown) return
      shown = false
      this.screens.splice(this.screens.indexOf(screen), 1)
      this.redraw()
    }
    // In a traced copy, `this.ctx` is the calling plugin's context, so the screen goes when that plugin unloads.
    const dispose = this.ctx.effect(() => hide, 'binnacle: a screen shown')
    return {
      redraw: () => {
        if (shown && this.onView === screen) this.redraw()
      },
      dispose: () => {
        void dispose()
      },
    }
  }
}
