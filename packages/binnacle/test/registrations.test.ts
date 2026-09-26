import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { stripTerminalSequences } from '@earendil-works/pi-tui'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { adapt } from '../src/facts/adapt.ts'
import type { Fact } from '../src/facts/adapt.ts'
import { RegistrationService } from '../src/host/registrations.ts'
import { TranscriptPane } from '../src/panes/transcript.ts'
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
  const registrations = new RegistrationService(ctx)
  const author = async (apply: (ctx: Context) => void) => {
    const fiber = ctx.plugin({ name: 'author', inject: ['binnacle'], apply })
    await fiber
    return fiber
  }
  return { registrations, author }
}

/**
 * What the screen shows with the registrations as they stand.
 * @param registrations - the service.
 * @param events - the session's events, beyond the prompt.
 * @returns its lines, plain.
 */
const shown = (registrations: RegistrationService, ...events: SessionEvent[]): string[] => {
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

test('the newest plugin to draw a key draws it, on what the one before drew, and disposing either gives its place back', async () => {
  const { registrations, author } = surface()
  const first = await author((ctx) => { ctx.binnacle.view('prompt', () => ({ kind: 'text', text: 'first' })) })
  const second = await author((ctx) => { ctx.binnacle.view('prompt', (_, next) => ({ kind: 'stack', children: [next(), { kind: 'text', text: 'second' }] })) })
  assert.deepEqual(shown(registrations), ['first', 'second'])
  await first.dispose()
  assert.deepEqual(shown(registrations), ['› fix the build', 'second'])
  await second.dispose()
  assert.deepEqual(shown(registrations), ['› fix the build'])
})

test('a view that throws is drawn over by the view beneath it, which says whose view failed and why', async () => {
  const { registrations, author } = surface()
  await author((ctx) => { ctx.binnacle.view('prompt', () => ({ kind: 'text', text: 'first' })) })
  await author((ctx) => { ctx.binnacle.view('prompt', () => { throw new Error('no phone') }) })
  assert.deepEqual(shown(registrations), ['first', '✗ binnacle.view(prompt) threw: no phone'])
})

test('the newest adapter of a kind reads it, and disposing it gives the kind back to the one before', async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.facts('session/end-seed', () => ({ name: 'seeded', data: {} }))
    ctx.binnacle.view('seeded', () => ({ kind: 'text', text: 'seeded' }))
  })
  const forked = await author((ctx) => {
    ctx.binnacle.facts('session/end-seed', () => ({ name: 'forked', data: {} }))
    ctx.binnacle.view('forked', () => ({ kind: 'text', text: 'forked' }))
  })
  assert.deepEqual(shown(registrations, seed), ['› fix the build', 'forked'])
  await forked.dispose()
  assert.deepEqual(shown(registrations, seed), ['› fix the build', 'seeded'])
})

test('a view is handed what the view beneath it draws, and builds on it', async () => {
  const { registrations, author } = surface()
  await author((ctx) => { ctx.binnacle.view('prompt', (_, next) => ({ kind: 'stack', children: [next(), { kind: 'text', text: '  sent from the phone' }] })) })
  assert.deepEqual(shown(registrations), ['› fix the build', '  sent from the phone'])
})

/**
 * A tool the model asked for, as dsh logs it.
 * @param seq - its place in the log, which also names the call.
 * @param name - the tool.
 * @returns the event.
 */
const called = (seq: number, name: string): SessionEvent<'tool/call'> => ({
  type: 'tool/call', seq: SessionSeq(seq), time: seq, data: { turn: 1, step: 1, callId: ToolCallId(`c${seq}`), name, arguments: '{}' },
})

test('two plugins can each draw one tool\'s card, and every other card stays binnacle\'s', async () => {
  const { registrations, author } = surface()
  await author((ctx) => { ctx.binnacle.view('tool', (entry, next) => entry.kind === 'tool' && entry.call.name === 'bash' ? { kind: 'text', text: '$ make' } : next()) })
  await author((ctx) => { ctx.binnacle.view('tool', (entry, next) => entry.kind === 'tool' && entry.call.name === 'read' ? { kind: 'text', text: 'read a file' } : next()) })
  assert.deepEqual(shown(registrations, called(2, 'bash'), called(3, 'read'), called(4, 'grep')), ['› fix the build', '$ make', 'read a file', '● grep {}', '  running…'])
})

test('a view that read something besides its entry invalidates its key, and only that key\'s entries are drawn again', async () => {
  const { registrations, author } = surface()
  let marker = '›'
  let calls = 0
  await author((ctx) => {
    ctx.binnacle.view('prompt', entry => ({ kind: 'text', text: `${marker} ${entry.kind === 'prompt' ? entry.fact.seq : 0}` }))
    ctx.binnacle.view('context', (_, next) => { calls++; return next() })
  })
  const pane = new TranscriptPane(() => {}, () => registrations.views)
  pane.push(prompt)
  pane.push({ kind: 'context', seq: 2, time: 2, source: 'goal', blocks: [{ kind: 'text', text: 'ship it' }] })
  const lines = () => pane.render(40).map(line => stripTerminalSequences(line).trimEnd())
  assert.deepEqual(lines(), ['› 1', '⋯ added by goal', '… 1 more line'])
  marker = '»'
  assert.deepEqual(lines(), ['› 1', '⋯ added by goal', '… 1 more line'])
  registrations.invalidate('prompt')
  assert.deepEqual(lines(), ['» 1', '⋯ added by goal', '… 1 more line'])
  assert.equal(calls, 1)
})
