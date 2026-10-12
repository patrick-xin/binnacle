import { Context } from '@deepseek-ai/cordis'
import { internals as cmdline, provideCmdline } from '@deepseek-ai/dsh-cmdline'
import * as core from '../index.ts'
import type { TerminalColorMode } from '../terminal/colors.ts'
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

/**
 * The core alone, on a fake terminal, process, streams and clock, before dsh says it is ready. The core's own tests read these; `mount` builds on it.
 * `restore()` puts back what it replaced.
 */
export async function mountCore(
  options: {
    args?: string[]
    columns?: number
    rows?: number
    colorMode?: TerminalColorMode
    provide?: (ctx: Context) => void
    /** Loads the core, the module of binnacle's entry. By default it is a plugin of its own, with no row. */
    load?: (ctx: Context, core: object) => Promise<{ dispose(): unknown }>
  } = {},
) {
  const replaced = { ...core.internals }
  const written = { stdout: cmdline.stdout, stderr: cmdline.stderr }
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
  const restore = (): void => {
    Object.assign(core.internals, replaced)
    cmdline.stdout = written.stdout
    cmdline.stderr = written.stderr
  }
  const ctx = new Context()
  let fiber: { dispose(): unknown }
  try {
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
    fiber = options.load === undefined ? ctx.plugin(core) : await options.load(ctx, core)
    await fiber
  } catch (error) {
    // A core that fails to start gives back what it replaced.
    await ctx.fiber.dispose().catch(() => {})
    restore()
    throw error
  }
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
    restore,
  }
}
