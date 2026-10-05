/**
 * Mount binnacle's core on a real Cordis context, with the launcher's facts
 * faked: the command line, the exit request and the startup signal.
 * @module binnacle/test/support/mount
 */
import { Context } from '@deepseek-ai/cordis'
import { internals as cmdline, provideCmdline } from '@deepseek-ai/dsh-cmdline'
import * as core from '../../src/index.ts'
import { XtermTerminal } from './terminal.ts'

/** The process binnacle runs in: its signals and its exit, raised by a test. */
export class FakeProcess {
  readonly #listeners = new Map<string, Set<() => void>>()
  /** How many times binnacle stopped the process. */
  stops = 0
  on(event: string, listener: () => void): void {
    const set = this.#listeners.get(event) ?? new Set()
    set.add(listener)
    this.#listeners.set(event, set)
  }
  off(event: string, listener: () => void): void {
    this.#listeners.get(event)?.delete(listener)
  }
  stop(): void {
    this.stops++
  }
  emit(event: string): void {
    for (const listener of this.#listeners.get(event) ?? []) listener()
  }
}

export async function mount(options: { args?: string[]; columns?: number; rows?: number } = {}) {
  const terminal = new XtermTerminal(options.columns ?? 40, options.rows ?? 8)
  const exits: number[] = []
  const out: string[] = []
  const listeners = new Set<() => void>()
  cmdline.stdout = { write: (chunk: string) => out.push(chunk) }
  cmdline.stderr = { write: (chunk: string) => out.push(chunk) }
  const process = new FakeProcess()
  // The process's own stdout and stderr, which other code writes to: what reaches them, in order.
  const printed: string[] = []
  const stdout = { write: (chunk: string) => printed.push(`stdout: ${chunk}`) > 0 }
  const stderr = { write: (chunk: string) => printed.push(`stderr: ${chunk}`) > 0 }
  core.internals.streams = [stdout, stderr]
  core.internals.terminal = () => terminal
  core.internals.process = process
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
    process,
    stdout,
    stderr,
    printed,
    exits,
    out,
    /** The launcher commits startup: every row has mounted. */
    ready: () => {
      for (const listener of listeners) listener()
      listeners.clear()
    },
  }
}
