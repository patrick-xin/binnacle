import type { Context } from '@deepseek-ai/cordis'
import type { AppExit, AppReady } from '@deepseek-ai/dsh-cmdline'
import type { Stream } from './core/capture.ts'
import { readCommandLine } from './core/command-line.ts'
import { Drawing } from './core/drawing.ts'
import { Host } from './core/host.ts'
import type { Process } from './core/host.ts'
import { route } from './core/input.ts'
import { keyTable } from './core/keys.ts'
import { BinnacleService } from './core/service.ts'
import { openChat } from './core/session.ts'
import { setKeybindings } from './terminal/keybindings.ts'
import { ProcessTerminal } from './terminal/process-terminal.ts'
import { StdinBuffer } from './terminal/stdin-buffer.ts'
import type { Terminal } from './terminal/terminal.ts'

export type { Binnacle, Box, ChatSession, Cursor, Handle, Keys, Layout, Part, Screen, Side, Size } from './api.ts'
export type { Process } from './core/host.ts'
export { toPlainText } from './core/view.ts'

export const name = 'binnacle'

export const inject = ['cmdlineArgs', 'appReady', 'appExit'] satisfies (keyof Context)[]

export const internals: { terminal: () => Terminal; process: Process; streams: { stdout: Stream; stderr: Stream } } = {
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
  streams: { stdout: process.stdout, stderr: process.stderr },
}

// The core only puts its parts together; each job is a module of its own in core/.
export function apply(ctx: Context): void {
  // The copied editor reads its keys through pi-tui's global, so the core's table is set there.
  setKeybindings(keyTable)
  const commandLine = readCommandLine(ctx)
  // On --help or a refused command line, the launcher exits, and binnacle must not take the terminal.
  if (commandLine === undefined) return

  const { streams } = internals
  const input = new StdinBuffer()
  const host = new Host(
    [streams.stdout, streams.stderr],
    internals.process,
    (data) => input.process(data),
    () => drawing.redrawAll(),
  )
  const drawing = new Drawing(
    () => host.size,
    (data) => host.write(data),
    () => service,
  )
  const service = new BinnacleService(ctx, drawing.draw, (part) => drawing.forget(part))
  const exit: AppExit = ctx.appExit!
  route(input, {
    answered: (sequence) => host.answered(sequence),
    focused: () => drawing.focused(),
    taken: (part) => {
      drawing.forget(part)
      drawing.draw()
    },
    wheel: (notches, x, y) => drawing.wheel(notches, x, y),
    act: (action) => (action === 'binnacle.quit' ? exit(0) : host.suspend()),
  })
  openChat(ctx, commandLine.session, (why) => {
    streams.stderr.write(`binnacle: ${why}\n`)
    exit(1)
  })

  const ready: AppReady = ctx.appReady!
  const cancelReady = ready.onReady(() => host.open(internals.terminal()))
  ctx.effect(
    () => () => {
      cancelReady()
      host.close()
    },
    'binnacle: the terminal',
  )
}
