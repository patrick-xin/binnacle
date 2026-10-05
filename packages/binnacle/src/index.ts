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

type ProcessEvent = 'exit' | 'SIGTSTP' | 'SIGCONT'

export interface Process {
  on(event: ProcessEvent, listener: () => void): void
  off(event: ProcessEvent, listener: () => void): void
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

const ALTERNATE_SCREEN_ON = '\x1b[?1049h'
const ALTERNATE_SCREEN_OFF = '\x1b[?1049l'
const CURSOR_HIDE = '\x1b[?25l'
const CURSOR_SHOW = '\x1b[?25h'
const MOUSE_ON = '\x1b[?1000h\x1b[?1006h'
const MOUSE_OFF = '\x1b[?1006l\x1b[?1000l'

// Raw mode turns off the terminal's own signals, so ctrl+c and ctrl+z arrive as bytes.
const CTRL_C = '\x03'
const CTRL_Z = '\x1a'

const SGR_MOUSE = /^\x1b\[<(?<button>\d+);\d+;\d+[Mm]$/
const WHEEL_UP = 64
const WHEEL_DOWN = 65
const ROWS_PER_WHEEL_NOTCH = 3

interface CommandLine {
  readonly session: string | undefined
}

function program(parsed: (commandLine: CommandLine) => void): Command {
  return new Command()
    .name('dsh --profile binnacle')
    .description('A terminal app for dsh. The wheel scrolls; ctrl+c quits; ctrl+z suspends.')
    .helpOption('-h, --help', 'show this help')
    .option('--session <id>', 'the stored session to read; the newest when none is named')
    .action((options: { session?: string }) => {
      parsed({ session: options.session })
    })
}

export function apply(ctx: Context): void {
  let commandLine: CommandLine | undefined
  parseCmdline(
    ctx,
    program((parsed) => {
      commandLine = parsed
    }),
  )
  // On --help or a refused command line, the launcher exits, and binnacle must not take the terminal.
  if (commandLine === undefined) return

  let terminal: Terminal | undefined
  let holdingTerminal = false
  let printHeldBack: (() => void) | undefined
  let scrolledUp = 0
  const display = new Display((data) => {
    terminal?.write(data)
  })

  const draw = (): void => {
    if (terminal === undefined || !holdingTerminal) return
    const { rows, maxScroll } = rowsOf(service.onView, terminal.columns, terminal.rows, scrolledUp)
    scrolledUp = Math.min(scrolledUp, maxScroll)
    display.draw(rows)
  }
  const service = new BinnacleService(ctx, commandLine.session, draw)

  const redrawAll = (): void => {
    display.clear()
    draw()
  }
  const input = new StdinBuffer()
  const take = (): void => {
    if (terminal === undefined || holdingTerminal) return
    holdingTerminal = true
    printHeldBack = capture(internals.streams)
    terminal.start((data) => {
      input.process(data)
    }, redrawAll)
    terminal.write(ALTERNATE_SCREEN_ON + CURSOR_HIDE + MOUSE_ON)
    redrawAll()
  }
  const giveBack = (): void => {
    if (terminal === undefined || !holdingTerminal) return
    holdingTerminal = false
    terminal.write(MOUSE_OFF + CURSOR_SHOW + ALTERNATE_SCREEN_OFF)
    terminal.stop()
    printHeldBack?.()
    printHeldBack = undefined
  }
  const suspend = (): void => {
    if (!holdingTerminal) return
    giveBack()
    internals.process.stop()
  }

  const exit: AppExit = ctx.appExit!
  input.on('data', (sequence: string) => {
    if (sequence === CTRL_C) exit(0)
    else if (sequence === CTRL_Z) suspend()
    else scroll(SGR_MOUSE.exec(sequence)?.groups?.button)
  })
  const scroll = (button: string | undefined): void => {
    if (button === String(WHEEL_UP)) scrolledUp += ROWS_PER_WHEEL_NOTCH
    else if (button === String(WHEEL_DOWN)) scrolledUp = Math.max(0, scrolledUp - ROWS_PER_WHEEL_NOTCH)
    else return
    draw()
  }

  const ready: AppReady = ctx.appReady!
  const cancelReady = ready.onReady(() => {
    terminal = internals.terminal()
    take()
  })
  const { process } = internals
  process.on('SIGTSTP', suspend)
  process.on('SIGCONT', take)
  // A crash exits without unloading the tree, so this effect's disposer would never run.
  process.on('exit', giveBack)
  ctx.effect(
    () => () => {
      cancelReady()
      process.off('SIGTSTP', suspend)
      process.off('SIGCONT', take)
      process.off('exit', giveBack)
      giveBack()
      terminal = undefined
    },
    'binnacle: the terminal',
  )
}
