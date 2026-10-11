import { Context } from '@deepseek-ai/cordis'
import { internals as cmdline, provideCmdline } from '@deepseek-ai/dsh-cmdline'
import * as core from '../../src/index.ts'
import type { TerminalColorMode } from '../../src/terminal/colors.ts'
import { XtermTerminal } from './terminal.ts'

export class FakeProcess {
  readonly #listeners = new Map<string, Set<() => void>>()
  stopCount = 0
  on(event: string, listener: () => void): void {
    const set = this.#listeners.get(event) ?? new Set()
    set.add(listener)
    this.#listeners.set(event, set)
  }
  off(event: string, listener: () => void): void {
    this.#listeners.get(event)?.delete(listener)
  }
  stop(): void {
    this.stopCount++
  }
  emit(event: string): void {
    for (const listener of this.#listeners.get(event) ?? []) listener()
  }
}

export async function mount(
  options: { args?: string[]; columns?: number; rows?: number; colorMode?: TerminalColorMode; provide?: (ctx: Context) => void } = {},
) {
  const terminal = new XtermTerminal(options.columns ?? 40, options.rows ?? 8)
  const exits: number[] = []
  const out: string[] = []
  const listeners = new Set<() => void>()
  cmdline.stdout = { write: (chunk: string) => out.push(chunk) }
  cmdline.stderr = { write: (chunk: string) => out.push(chunk) }
  const process = new FakeProcess()
  const printed: string[] = []
  const stdout = { write: (chunk: string) => printed.push(`stdout: ${chunk}`) > 0 }
  const stderr = { write: (chunk: string) => printed.push(`stderr: ${chunk}`) > 0 }
  core.internals.streams = { stdout, stderr }
  core.internals.terminal = () => terminal
  core.internals.process = process
  core.internals.colorMode = () => options.colorMode ?? 'truecolor'
  const timers: { at: number; run: () => void }[] = []
  const clock = {
    now: 0,
    /** Moves the time on by `ms`, and runs each timer that falls due, in order. */
    pass: async (ms: number) => {
      const end = clock.now + ms
      for (;;) {
        timers.sort((a, b) => a.at - b.at)
        const next = timers[0]
        if (next === undefined || next.at > end) break
        timers.shift()
        clock.now = next.at
        next.run()
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
      clock.now = end
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    },
    timers: () => timers.length,
  }
  core.internals.now = () => clock.now
  core.internals.later = (ms, run) => {
    const timer = { at: clock.now + ms, run }
    timers.push(timer)
    return () => {
      const at = timers.indexOf(timer)
      if (at !== -1) timers.splice(at, 1)
    }
  }
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
  options.provide?.(ctx)
  const fiber = ctx.plugin(core)
  await fiber
  return {
    ctx,
    fiber,
    terminal,
    process,
    clock,
    stdout,
    stderr,
    printed,
    exits,
    out,
    ready: () => {
      for (const listener of listeners) listener()
      listeners.clear()
    },
  }
}
