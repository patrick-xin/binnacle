/**
 * Mount binnacle's core on a real Cordis context, with the launcher's facts
 * faked: the command line, the exit request and the startup signal.
 * @module binnacle/test/support/mount
 */
import { Context } from '@deepseek-ai/cordis'
import { internals as cmdline, provideCmdline } from '@deepseek-ai/dsh-cmdline'
import * as core from '../../src/index.ts'
import { XtermTerminal } from './terminal.ts'

export async function mount(options: { args?: string[]; columns?: number; rows?: number } = {}) {
  const terminal = new XtermTerminal(options.columns ?? 40, options.rows ?? 8)
  const exits: number[] = []
  const out: string[] = []
  const listeners = new Set<() => void>()
  cmdline.stdout = { write: (chunk: string) => out.push(chunk) }
  cmdline.stderr = { write: (chunk: string) => out.push(chunk) }
  core.internals.terminal = () => terminal
  const ctx = new Context()
  provideCmdline(ctx, {
    args: options.args ?? [],
    exit: (code) => {
      exits.push(code)
    },
    ready: {
      onReady: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
  })
  const fiber = ctx.plugin(core)
  await fiber
  return {
    ctx,
    fiber,
    terminal,
    exits,
    out,
    /** The launcher commits startup: every row has mounted. */
    ready: () => {
      for (const listener of listeners) listener()
      listeners.clear()
    },
  }
}
