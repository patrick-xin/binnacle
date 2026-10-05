/**
 * The `binnacle` service, which plugins show their screens through.
 * @module binnacle/core/service
 */
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { Binnacle, Screen, Shown } from '../api.ts'

export class BinnacleService extends Service implements Binnacle {
  // TypeScript private, not #private: Cordis reaches the service through traced copies.
  private readonly screens: Screen[] = []
  private readonly changed: () => void

  constructor(ctx: Context, changed: () => void) {
    super(ctx, 'binnacle')
    this.changed = changed
  }

  /** The screen on view: the newest shown. */
  get top(): Screen | undefined {
    return this.screens.at(-1)
  }

  show(screen: Screen): Shown {
    this.screens.push(screen)
    this.changed()
    let shown = true
    const hide = (): void => {
      if (!shown) return
      shown = false
      this.screens.splice(this.screens.indexOf(screen), 1)
      this.changed()
    }
    // `this.ctx` is the context of the plugin that called: its screen goes when it unloads.
    const effect = this.ctx.effect(() => hide, 'binnacle: a screen shown')
    return {
      redraw: () => {
        if (shown && this.top === screen) this.changed()
      },
      dispose: () => {
        void effect()
      },
    }
  }
}
