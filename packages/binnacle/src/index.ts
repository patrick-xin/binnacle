/**
 * binnacle's core: the Cordis row that owns the terminal, and provides the
 * `binnacle` service that plugins show their screens through.
 * @module binnacle
 */
import type { Context } from '@deepseek-ai/cordis'
import type { AppReady } from '@deepseek-ai/dsh-cmdline'
import { Display } from './core/display.ts'
import { BinnacleService } from './core/service.ts'
import { rowsOf } from './core/view.ts'
import type { Terminal } from './terminal/terminal.ts'

export type { Binnacle, Screen, Shown } from './api.ts'

export const name = 'binnacle'

export const inject = ['appReady'] satisfies (keyof Context)[]

export const internals: { terminal: () => Terminal } = {
  terminal: () => {
    throw new Error('binnacle: no terminal yet')
  },
}

// The alternate screen, the cursor hidden, and the mouse's presses and wheel reported in SGR's form.
const TAKE = '\x1b[?1049h\x1b[?25l\x1b[?1000h\x1b[?1006h'
const GIVE_BACK = '\x1b[?1006l\x1b[?1000l\x1b[?25h\x1b[?1049l'

export function apply(ctx: Context): void {
  let terminal: Terminal | undefined
  let display: Display | undefined
  const draw = (): void => {
    if (terminal === undefined || display === undefined) return
    display.draw(rowsOf(service.top, terminal.columns, terminal.rows))
  }
  const service = new BinnacleService(ctx, draw)
  const release = (): void => {
    if (terminal === undefined) return
    terminal.write(GIVE_BACK)
    terminal.stop()
    terminal = undefined
    display = undefined
  }
  const ready: AppReady = ctx.appReady!
  const cancel = ready.onReady(() => {
    const taken = internals.terminal()
    terminal = taken
    taken.start(
      () => {},
      () => {},
    )
    taken.write(TAKE)
    display = new Display((data) => {
      taken.write(data)
    })
    draw()
  })
  ctx.effect(
    () => () => {
      cancel()
      release()
    },
    'binnacle: the terminal',
  )
}
