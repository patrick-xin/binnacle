/**
 * The host: the one layer that touches the terminal and the harness runtime.
 *
 * It reads the invocation through dsh's command line, and once the launcher
 * commits startup it either reports the composition healthy (`--check`) or
 * takes the terminal through pi-tui until the person quits. Every layer below
 * it is a function of facts, UI state and a size; this is where those meet a
 * real process.
 * @module binnacle/host
 */

import { Command } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'
import { matchesKey, ProcessTerminal, Text, TuiMainScreen } from '@earendil-works/pi-tui'
import type { Terminal } from '@earendil-works/pi-tui'

/** The row's Cordis name, as the bundle patch inserts it. */
export const name = 'binnacle'

/** The services the row needs before it applies: the launcher's command line. */
export const inject = ['cmdlineArgs']

/** Process-facing seams, replaced by tests. */
export const internals: {
  /** Build the terminal the surface draws on. */
  terminal: () => Terminal
  /** Where `--check` reports. */
  stdout: { write(chunk: string): unknown }
} = {
  terminal: () => new ProcessTerminal(),
  stdout: process.stdout,
}

/** What this invocation asked for. */
type Mode = 'check' | 'interactive'

/**
 * This surface's command: its flags and help.
 * @param chosen - receives the mode when the invocation parses.
 * @returns a fresh program, so one process can parse more than once.
 */
function surfaceCommand(chosen: (mode: Mode) => void): Command {
  return new Command()
    .name('dsh --profile binnacle')
    .description('Open a terminal session with an agent.')
    .helpOption('-h, --help', 'show this help')
    .option('--check', 'mount the composition, report whether it started, and exit, drawing nothing')
    .action((options: { check?: boolean }) => { chosen(options.check === true ? 'check' : 'interactive') })
}

/**
 * Hold the terminal until the person quits, and give it back on quit or disposal.
 * @param exit - the launcher's bounded exit request.
 * @returns a disposer that gives the terminal back.
 */
function takeTerminal(exit: (code: number) => void): () => void {
  const tui = new TuiMainScreen(internals.terminal())
  let held = true
  const release = (): void => {
    if (!held) return
    held = false
    tui.stop()
  }
  tui.addChild(new Text('binnacle — nothing is drawn yet. ctrl+c quits.'))
  tui.addInputListener((data) => {
    if (!matchesKey(data, 'ctrl+c')) return undefined
    release()
    exit(0)
    return { consume: true }
  })
  tui.start()
  return release
}

/**
 * Parse the invocation and, once startup commits, check or draw.
 * @param ctx - the row's context, carrying the launcher's command line, exit request and readiness.
 */
export function apply(ctx: Context): void {
  let mode: Mode | undefined
  parseCmdline(ctx, surfaceCommand((chosen) => { mode = chosen }))
  if (mode === undefined) return
  const exit = ctx.get('appExit')
  const ready = ctx.get('appReady')
  if (exit === undefined || ready === undefined) {
    throw new Error('binnacle: the launcher must provide ctx.appExit and ctx.appReady before the tree mounts')
  }
  let release: (() => void) | undefined
  const cancel = ready.onReady(() => {
    if (mode === 'check') {
      internals.stdout.write('binnacle: ok\n')
      exit(0)
      return
    }
    release = takeTerminal(exit)
  })
  ctx.effect(() => () => {
    cancel()
    release?.()
  }, 'binnacle: the terminal')
}
