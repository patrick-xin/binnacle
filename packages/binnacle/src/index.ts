import type { Context } from '@deepseek-ai/cordis'
import type { AppExit, AppReady } from '@deepseek-ai/dsh-cmdline'
import { readCommandLine } from './core/command-line.ts'
import { coreActions } from './core/actions.ts'
import { Drawing } from './core/drawing.ts'
import { gestureTable } from './core/gestures.ts'
import { Host } from './core/host.ts'
import { internals } from './core/internals.ts'
import { route } from './core/input.ts'
import { BinnacleService } from './core/service.ts'
import { openChat } from './core/session.ts'
import { setKeybindings } from './terminal/keybindings.ts'
import { StdinBuffer } from './terminal/stdin-buffer.ts'

export type * from './api.ts'
export type { Process } from './core/host.ts'
export { toPlainText } from './core/view.ts'
export { createModel } from './core/model.ts'
export { internals } from './core/internals.ts'

export const name = 'binnacle'

export const inject = ['cmdlineArgs', 'appReady', 'appExit'] satisfies (keyof Context)[]

// The core only puts its parts together; each job is a module of its own in core/.
export function apply(ctx: Context): void {
  // The copied editor reads its keys through pi-tui's global, so the core's table is set there.
  setKeybindings(gestureTable)
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
  const service = new BinnacleService(ctx, {
    redraw: drawing.draw,
    forget: (part) => drawing.forget(part),
    forgetAll: () => drawing.forgetAll(),
    colorMode: () => internals.colorMode(),
  })
  const exit: AppExit = ctx.appExit!
  route(input, {
    answered: (sequence) => host.answered(sequence),
    focused: () => drawing.focused(),
    taken: (part) => {
      drawing.forget(part)
      drawing.draw()
    },
    click: (x, y) => drawing.click(x, y),
    act: coreActions({
      now: () => internals.now(),
      quit: () => exit(0),
      suspend: () => host.suspend(),
      interrupt: () => ctx.get('binnacleSession')?.interrupt(),
      focusNext: () => drawing.nextFocus(),
      scroll: (notches, at) => {
        if (at !== undefined) drawing.wheel(notches, at.x, at.y)
      },
    }),
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
