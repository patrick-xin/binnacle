import type { Context } from '@deepseek-ai/cordis'
import type { ClockState, Model } from '../api.ts'
import { internals } from './internals.ts'
import { createModel } from './model.ts'

/**
 * The model `clock`. It pulls: a read of `now` notes itself, and a second after the clock last changed, it changes again only if `now` was read since.
 * So a Part that names it is drawn again, reads it again, and keeps it ticking, and once nothing reads it, nothing ticks.
 */
export function startClock(ctx: Context): Model<ClockState> {
  let read = false
  let cancel: (() => void) | undefined
  const tick = (): void => {
    cancel = undefined
    if (!read) return
    read = false
    ticked.set(() => {})
    cancel = internals.later(1000, tick)
  }
  const ticked = createModel<ClockState>({
    get now() {
      read = true
      cancel ??= internals.later(1000, tick)
      return internals.now()
    },
  })
  ctx.effect(() => () => cancel?.(), 'binnacle: the clock')
  return { state: ticked.state, watch: ticked.watch, set: () => {} }
}
