import type { Context } from '@deepseek-ai/cordis'
import { Command } from 'commander'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'
import type { AppExit, AppReady } from '@deepseek-ai/dsh-cmdline'
import { capture } from './core/capture.ts'
import type { Stream } from './core/capture.ts'
import { Display } from './core/display.ts'
import { BinnacleService } from './core/service.ts'
import { coreActionOf, keyTable } from './core/keys.ts'
import { arrange } from './core/layout.ts'
import type { Placed } from './core/layout.ts'
import type { Part } from './api.ts'
import { rowsOf } from './core/view.ts'
import { setKeybindings } from './terminal/keybindings.ts'
import { ProcessTerminal } from './terminal/process-terminal.ts'
import { StdinBuffer } from './terminal/stdin-buffer.ts'
import type { Terminal } from './terminal/terminal.ts'

export type { Binnacle, Box, Handle, Layout, Part, Screen, Side, Size } from './api.ts'

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

const SGR_MOUSE = /^\x1b\[<(?<button>\d+);(?<x>\d+);(?<y>\d+)[Mm]$/
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

function placedAt(placed: readonly Placed[], x: number, y: number): Placed | undefined {
  return placed.find(({ top, left, width, height }) => y >= top && y < top + height && x >= left && x < left + width)
}

export function apply(ctx: Context): void {
  // The copied editor reads its keys through pi-tui's global, so the core's table is set there.
  setKeybindings(keyTable)
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
  const scrolledUp = new Map<string, number>()
  let placed: readonly Placed[] = []
  const display = new Display((data) => {
    terminal?.write(data)
  })

  const draw = (): void => {
    if (terminal === undefined || !holdingTerminal) return
    const arranged = arrange(service.layoutOnView, terminal.columns, terminal.rows, {
      rows: (place, width) => rowsOf(service.partIn(place), width),
      scrolledUp: (place) => scrolledUp.get(place) ?? 0,
    })
    placed = arranged.placed
    for (const { place, maxScroll } of placed) scrolledUp.set(place, Math.min(scrolledUp.get(place) ?? 0, maxScroll))
    display.draw(arranged.rows)
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
  const focused = (): Part | undefined => {
    const place = service.focusOnView
    return placed.some((drawn) => drawn.place === place) && place !== undefined ? service.partIn(place) : undefined
  }
  input.on('data', (sequence: string) => {
    const mouse = SGR_MOUSE.exec(sequence)?.groups
    if (mouse !== undefined) return scroll(mouse)
    if (focused()?.key?.(sequence) === true) return draw()
    // Raw mode turns off the terminal's own signals, so ctrl+c and ctrl+z arrive as keys.
    const action = coreActionOf(sequence)
    if (action === 'binnacle.quit') exit(0)
    else if (action === 'binnacle.suspend') suspend()
  })
  const scroll = (mouse: { button?: string; x?: string; y?: string }): void => {
    const notches = mouse.button === String(WHEEL_UP) ? 1 : mouse.button === String(WHEEL_DOWN) ? -1 : 0
    // SGR mouse reports count columns and rows from 1.
    const under = placedAt(placed, Number(mouse.x) - 1, Number(mouse.y) - 1)
    if (notches === 0 || under === undefined) return
    scrolledUp.set(under.place, Math.max(0, (scrolledUp.get(under.place) ?? 0) + notches * ROWS_PER_WHEEL_NOTCH))
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
