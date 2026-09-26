import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { stripTerminalSequences } from '@earendil-works/pi-tui'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { adapt } from '../src/facts/adapt.ts'
import type { Fact } from '../src/facts/adapt.ts'
import { Registrations } from '../src/host/registrations.ts'
import { initial } from '../src/ui/state.ts'
import { screen } from '../src/views/screen.ts'

const prompt: Fact = { kind: 'prompt', seq: 1, time: 1, blocks: [{ kind: 'text', text: 'fix the build' }] }
const seed: SessionEvent<'session/end-seed'> = { type: 'session/end-seed', seq: SessionSeq(2), time: 2, data: {} }

/**
 * The surface's registrations on a real context, and a way to mount an author's plugin on it.
 * @returns the registrations and the author mounter.
 */
function surface() {
  const ctx = new Context()
  const registrations = new Registrations(ctx)
  const author = async (apply: (ctx: Context) => void) => {
    const fiber = ctx.plugin({ name: 'author', inject: ['binnacle'], apply })
    await fiber
    return fiber
  }
  return { registrations, author }
}

/**
 * What the screen shows with the registrations as they stand.
 * @param registrations - the registrations.
 * @param events - the session's events, beyond the prompt.
 * @returns its lines, plain.
 */
const shown = (registrations: Registrations, ...events: SessionEvent[]): string[] => {
  const facts = [prompt, ...events.map(event => adapt(event, registrations.adapters))]
  return screen(facts, initial, 40, registrations.views).lines.map(line => stripTerminalSequences(line).trimEnd())
}

test('an author\'s view replaces a built-in one, until the author\'s plugin is disposed', async () => {
  const { registrations, author } = surface()
  const fiber = await author((ctx) => {
    ctx.binnacle.view('prompt', entry => ({ kind: 'text', text: `ME: ${entry.kind === 'prompt' ? entry.fact.blocks.length : 0} block` }))
  })
  assert.deepEqual(shown(registrations), ['ME: 1 block'])
  await fiber.dispose()
  assert.deepEqual(shown(registrations), ['› fix the build'])
})

test('an author\'s adapter turns an event kind into a fact of their own, which their view draws', async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.facts('session/end-seed', () => ({ name: 'seeded', data: { from: 'fork' } }))
    ctx.binnacle.view('seeded', () => ({ kind: 'text', text: '— seeded from a fork —' }))
  })
  assert.deepEqual(shown(registrations, seed), ['› fix the build', '— seeded from a fork —'])
})

test('a fact of the author\'s own with no view is drawn by the fallback, by its name, never dropped', async () => {
  const { registrations, author } = surface()
  await author((ctx) => { ctx.binnacle.facts('session/end-seed', () => ({ name: 'seeded', data: { from: 'fork' } })) })
  assert.deepEqual(shown(registrations, seed), ['› fix the build', '? seeded', '… 3 more lines'])
})

test('a second plugin cannot draw a key another plugin draws, until the first is disposed', async () => {
  const { registrations, author } = surface()
  const first = await author((ctx) => { ctx.binnacle.view('prompt', () => ({ kind: 'text', text: 'first' })) })
  assert.throws(() => registrations.view('prompt', () => ({ kind: 'text', text: 'second' })), /binnacle\.view\(prompt\): already registered by another plugin; dispose it first/)
  await first.dispose()
  await author((ctx) => { ctx.binnacle.view('prompt', () => ({ kind: 'text', text: 'second' })) })
  assert.deepEqual(shown(registrations), ['second'])
})
