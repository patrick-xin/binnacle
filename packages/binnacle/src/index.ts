/**
 * binnacle's core: the Cordis row that owns the terminal, and provides the
 * `binnacle` service that plugins show their screens through.
 * @module binnacle
 */
import type { Context } from '@deepseek-ai/cordis'
import { Command } from 'commander'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'
import type { AppExit, AppReady } from '@deepseek-ai/dsh-cmdline'
import { capture } from './core/capture.ts'
import type { Stream } from './core/capture.ts'
import { Display } from './core/display.ts'
import { BinnacleService } from './core/service.ts'
import { rowsOf } from './core/view.ts'
import { ProcessTerminal } from './terminal/process-terminal.ts'
import { StdinBuffer } from './terminal/stdin-buffer.ts'
import type { Terminal } from './terminal/terminal.ts'

export type { Binnacle, Screen, Shown } from './api.ts'

export const name = 'binnacle'

export const inject = ['cmdlineArgs', 'appReady', 'appExit'] satisfies (keyof Context)[]

/** The process binnacle runs in: the signals and the exit it answers, and how it stops itself. */
export interface Process {
  on(event: 'exit' | 'SIGTSTP' | 'SIGCONT', listener: () => void): void
  off(event: 'exit' | 'SIGTSTP' | 'SIGCONT', listener: () => void): void
  /** Stop the process, as the terminal's own suspend does; it runs again on SIGCONT. */
  stop(): void
}

export const internals: { terminal: () => Terminal; process: Process; streams: readonly Stream[] } = {
  terminal: () => new ProcessTerminal(),
  process: {
    on: (event, listener) => {
      process.on(event, listener)
    },
    off: (event, listener) => {
      process.off(event, listener)
    },
    stop: () => {
      process.kill(process.pid, 'SIGSTOP')
    },
  },
  streams: [process.stdout, process.stderr],
}

// The alternate screen, the cursor hidden, and the mouse's presses and wheel reported in SGR's form.
const TAKE = '\x1b[?1049h\x1b[?25l\x1b[?1000h\x1b[?1006h'
const GIVE_BACK = '\x1b[?1006l\x1b[?1000l\x1b[?25h\x1b[?1049l'

// In raw mode the terminal sends ctrl+c as a byte, and sends no signal.
const CTRL_C = '\x03'
const CTRL_Z = '\x1a'

// A mouse event in SGR's form: the button, the column, the row, and M for a press.
const MOUSE = /^\x1b\[<(\d+);\d+;\d+[Mm]$/
const WHEEL_UP = 64
const WHEEL_DOWN = 65
// How many rows one notch of the wheel scrolls.
const NOTCH = 3

/** What the command line asks for. */
interface Asked {
  /** The id of the stored session to read, if one is named. */
  readonly session: string | undefined
}

function program(chosen: (asked: Asked) => void): Command {
  return new Command()
    .name('dsh --profile binnacle')
    .description('A terminal app for dsh. The wheel scrolls; ctrl+c quits; ctrl+z suspends.')
    .helpOption('-h, --help', 'show this help')
    .option('--session <id>', 'the stored session to read; the newest when none is named')
    .action((options: { session?: string }) => {
      chosen({ session: options.session })
    })
}

export function apply(ctx: Context): void {
  let asked: Asked | undefined
  parseCmdline(
    ctx,
    program((chosen) => {
      asked = chosen
    }),
  )
  // Help, or a command line binnacle refuses: the launcher exits, and binnacle takes nothing.
  if (asked === undefined) return
  // The terminal once dsh is ready, and whether binnacle holds it now: it does not while suspended.
  let terminal: Terminal | undefined
  let holding = false
  // While binnacle holds the terminal, what other code writes is held back; this ends that.
  let release: (() => void) | undefined
  const display = new Display((data) => {
    terminal?.write(data)
  })
  // How many rows the screen is scrolled up from its end.
  let back = 0
  const draw = (): void => {
    if (terminal === undefined || !holding) return
    const { rows, most } = rowsOf(service.top, terminal.columns, terminal.rows, back)
    back = Math.min(back, most)
    display.draw(rows)
  }
  const service = new BinnacleService(ctx, asked.session, draw)
  const exit: AppExit = ctx.appExit!
  const input = new StdinBuffer()
  const take = (): void => {
    if (terminal === undefined || holding) return
    holding = true
    release = capture(internals.streams)
    terminal.start(
      (data) => {
        input.process(data)
      },
      () => {
        // The terminal may have moved what it showed, so every row is written again.
        display.forget()
        draw()
      },
    )
    terminal.write(TAKE)
    display.forget()
    draw()
  }
  const giveBack = (): void => {
    if (terminal === undefined || !holding) return
    holding = false
    terminal.write(GIVE_BACK)
    terminal.stop()
    // Printed on the main screen, now that binnacle no longer draws over it.
    release?.()
    release = undefined
  }
  const suspend = (): void => {
    if (!holding) return
    giveBack()
    internals.process.stop()
  }
  const resume = (): void => {
    take()
  }
  input.on('data', (sequence: string) => {
    if (sequence === CTRL_C) {
      exit(0)
      return
    }
    if (sequence === CTRL_Z) {
      suspend()
      return
    }
    const button = MOUSE.exec(sequence)?.[1]
    if (button === undefined) return
    if (Number(button) === WHEEL_UP) back += NOTCH
    else if (Number(button) === WHEEL_DOWN) back = Math.max(0, back - NOTCH)
    else return
    draw()
  })
  const ready: AppReady = ctx.appReady!
  const cancel = ready.onReady(() => {
    terminal = internals.terminal()
    take()
  })
  const { process } = internals
  process.on('SIGTSTP', suspend)
  process.on('SIGCONT', resume)
  // A crash ends the process without unloading the tree; the terminal is given back on the way out.
  process.on('exit', giveBack)
  ctx.effect(
    () => () => {
      cancel()
      process.off('SIGTSTP', suspend)
      process.off('SIGCONT', resume)
      process.off('exit', giveBack)
      giveBack()
      terminal = undefined
    },
    'binnacle: the terminal',
  )
}
