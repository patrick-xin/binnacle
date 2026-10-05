/**
 * binnacle's core: the Cordis row that owns the terminal, and provides the
 * `binnacle` service that plugins show their screens through.
 * @module binnacle
 */
import type { Context } from '@deepseek-ai/cordis'
import type { AppExit, AppReady } from '@deepseek-ai/dsh-cmdline'
import { Display } from './core/display.ts'
import { BinnacleService } from './core/service.ts'
import { rowsOf } from './core/view.ts'
import { StdinBuffer } from './terminal/stdin-buffer.ts'
import type { Terminal } from './terminal/terminal.ts'

export type { Binnacle, Screen, Shown } from './api.ts'

export const name = 'binnacle'

export const inject = ['appReady', 'appExit'] satisfies (keyof Context)[]

export const internals: { terminal: () => Terminal } = {
  terminal: () => {
    throw new Error('binnacle: no terminal yet')
  },
}

// The alternate screen, the cursor hidden, and the mouse's presses and wheel reported in SGR's form.
const TAKE = '\x1b[?1049h\x1b[?25l\x1b[?1000h\x1b[?1006h'
const GIVE_BACK = '\x1b[?1006l\x1b[?1000l\x1b[?25h\x1b[?1049l'

// In raw mode the terminal sends ctrl+c as a byte, and sends no signal.
const CTRL_C = '\x03'

// A mouse event in SGR's form: the button, the column, the row, and M for a press.
const MOUSE = /^\x1b\[<(\d+);\d+;\d+[Mm]$/
const WHEEL_UP = 64
const WHEEL_DOWN = 65
// How many rows one notch of the wheel scrolls.
const NOTCH = 3

export function apply(ctx: Context): void {
  let terminal: Terminal | undefined
  let display: Display | undefined
  // How many rows the screen is scrolled up from its end.
  let back = 0
  const draw = (): void => {
    if (terminal === undefined || display === undefined) return
    const { rows, most } = rowsOf(service.top, terminal.columns, terminal.rows, back)
    back = Math.min(back, most)
    display.draw(rows)
  }
  const exit: AppExit = ctx.appExit!
  const hear = (sequence: string): void => {
    if (sequence === CTRL_C) {
      exit(0)
      return
    }
    const button = MOUSE.exec(sequence)?.[1]
    if (button === undefined) return
    if (Number(button) === WHEEL_UP) back += NOTCH
    else if (Number(button) === WHEEL_DOWN) back = Math.max(0, back - NOTCH)
    else return
    draw()
  }
  const input = new StdinBuffer()
  input.on('data', hear)
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
      (data) => {
        input.process(data)
      },
      () => {
        // The terminal may have moved what it showed, so every row is written again.
        display?.forget()
        draw()
      },
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
