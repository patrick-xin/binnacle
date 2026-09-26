import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { internals as cmdline, provideCmdline } from '@deepseek-ai/dsh-cmdline'
import type { Terminal } from '@earendil-works/pi-tui'
import * as host from '../src/host/index.ts'

/** A terminal that records what is written and lets a test type into it. */
class FakeTerminal implements Terminal {
  written = ''
  started = false
  #onInput: ((data: string) => void) | undefined
  start(onInput: (data: string) => void): void { this.started = true; this.#onInput = onInput }
  stop(): void { this.started = false }
  async drainInput(): Promise<void> {}
  write(data: string): void { this.written += data }
  get columns(): number { return 80 }
  get rows(): number { return 24 }
  get kittyProtocolActive(): boolean { return false }
  moveBy(): void {}
  hideCursor(): void {}
  showCursor(): void {}
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void {}
  setTitle(): void {}
  setProgress(): void {}
  type(data: string): void { this.#onInput?.(data) }
}

/** Mount the host on a real Context with the launcher's facts, and commit startup. */
async function mount(args: string[]) {
  const exits: number[] = []
  const out: string[] = []
  let ready: (() => void) | undefined
  const terminal = new FakeTerminal()
  cmdline.stdout = { write: (chunk: string) => { out.push(chunk); return true } }
  cmdline.stderr = { write: (chunk: string) => { out.push(chunk); return true } }
  host.internals.terminal = () => terminal
  host.internals.stdout = { write: (chunk: string) => { out.push(chunk); return true } }
  const ctx = new Context()
  provideCmdline(ctx, {
    args,
    exit: code => { exits.push(code) },
    ready: { onReady: listener => { ready = listener; return () => { ready = undefined } } },
  })
  const fiber = ctx.plugin(host)
  await fiber
  return { ctx, fiber, exits, out, terminal, commit: () => ready?.() }
}

test('the row is named binnacle and needs the launcher\'s command line', () => {
  assert.equal(host.name, 'binnacle')
  assert.deepEqual(host.inject, ['cmdlineArgs'])
})

test('--check reports ok once startup commits, draws nothing, and exits 0', async () => {
  const { exits, out, terminal, commit } = await mount(['--check'])
  assert.deepEqual(exits, [])
  commit()
  assert.deepEqual(out, ['binnacle: ok\n'])
  assert.deepEqual(exits, [0])
  assert.equal(terminal.started, false)
})

test('--help prints the usage and exits 0 without holding the terminal', async () => {
  const { exits, out, terminal } = await mount(['--help'])
  assert.match(out.join(''), /Usage: dsh --profile binnacle/)
  assert.deepEqual(exits, [0])
  assert.equal(terminal.started, false)
})

test('with no flag, the terminal is taken only once startup commits, and says what this is', async () => {
  const { terminal, commit } = await mount([])
  assert.equal(terminal.started, false)
  commit()
  assert.equal(terminal.started, true)
  await new Promise(resolve => setImmediate(resolve))
  assert.match(terminal.written, /binnacle/)
})

test('ctrl+c gives the terminal back and asks to exit 0', async () => {
  const { terminal, exits, commit } = await mount([])
  commit()
  terminal.type('\x03')
  assert.equal(terminal.started, false)
  assert.deepEqual(exits, [0])
})

test('disposing the row gives the terminal back and cancels a pending start', async () => {
  const drawn = await mount([])
  drawn.commit()
  await drawn.fiber.dispose()
  assert.equal(drawn.terminal.started, false)

  const pending = await mount([])
  await pending.fiber.dispose()
  pending.commit()
  assert.equal(pending.terminal.started, false)
})
