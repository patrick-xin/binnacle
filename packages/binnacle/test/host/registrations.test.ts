import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { stripTerminalSequences } from '@earendil-works/pi-tui'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { adapt } from '../../src/facts/adapt.ts'
import type { Node } from '../../src/api.ts'
import { RegistrationService } from '../../src/host/registrations.ts'
import { ScreenPane } from '../../src/panes/screen.ts'
import { TranscriptPane } from '../../src/panes/transcript.ts'
import { initial } from '../../src/ui/state.ts'
import { screen } from '../../src/views/screen.ts'
import { prompt as promptFact } from '../support/facts.ts'
import { called, seed as seedEvent } from '../support/events.ts'
import { pointer } from '../support/pointer.ts'
import { foldedAlike } from '../support/views.ts'

const prompt = promptFact(1, 1, 'fix the build')
const seed = seedEvent(2, 2)

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
  return screen(facts, initial, 40, registrations.views, registrations.currentTheme).lines.map(line => stripTerminalSequences(line).trimEnd())
}

test('an author\'s view replaces a built-in one, until the author\'s plugin is disposed', async () => {
  const { registrations, author } = surface()
  const fiber = await author((ctx) => {
    ctx.binnacle.view('prompt', entry => ({ kind: 'text', text: `ME: ${entry.kind === 'prompt' ? entry.fact.blocks.length : 0} block` }))
  })
  assert.deepEqual(shown(registrations), ['ME: 1 block'])
  await fiber.dispose()
  assert.deepEqual(shown(registrations), ['', ' › fix the build', ''])
})

test('an author\'s theme draws a mark in its own glyph, until the author\'s plugin is disposed', async () => {
  const { registrations, author } = surface()
  const fiber = await author((ctx) => { ctx.binnacle.theme({ marks: { prompt: { glyph: '>' } } }) })
  assert.deepEqual(shown(registrations), ['', ' > fix the build', ''])
  await fiber.dispose()
  assert.deepEqual(shown(registrations), ['', ' › fix the build', ''])
})

/**
 * A pane on the registrations as they stand, holding two prompts an author's view folds alike, and its lines.
 * @param registrations - the surface's registrations.
 * @returns the pane, and its lines at width 40.
 */
function alikePane(registrations: RegistrationService): { pane: TranscriptPane, lines: () => string[] } {
  const pane = new TranscriptPane(() => {}, () => registrations.views)
  pane.push(promptFact(1, 1, 'one\nmore'))
  pane.push(promptFact(2, 2, 'two\nmore'))
  return { pane, lines: () => pane.render(40).map(line => stripTerminalSequences(line).trimEnd()) }
}

test('an author\'s view that names one fold in every entry opens only the fold a person clicked', async () => {
  const { registrations, author } = surface()
  await author((ctx) => { ctx.binnacle.view('prompt', foldedAlike) })
  const { pane, lines } = alikePane(registrations)
  assert.deepEqual(lines(), ['one', '… 1 more line', '', 'two', '… 1 more line'])
  assert.deepEqual(pane.handleMouse(pointer('click', 4)), { handled: true })
  assert.deepEqual(lines(), ['one', '… 1 more line', '', 'two', 'more'])
})

test('enter on the fold a person focused opens only that entry\'s, wherever its name is shared', async () => {
  const { registrations, author } = surface()
  await author((ctx) => { ctx.binnacle.view('prompt', foldedAlike) })
  const { pane, lines } = alikePane(registrations)
  assert.deepEqual(lines(), ['one', '… 1 more line', '', 'two', '… 1 more line'])
  assert.equal(pane.handleKey({ kind: 'key', binding: 'focus.previous' }), true)
  assert.deepEqual(lines(), ['one', '… 1 more line', '', 'two', '▸ show 1 more line'])
  assert.equal(pane.handleKey({ kind: 'key', binding: 'primary' }), true)
  assert.deepEqual(lines(), ['one', '… 1 more line', '', 'two', 'more', '▸ fold to 1 line'])
})

test('focus moves through each entry\'s regions in turn, where two entries name theirs alike', async () => {
  const { registrations, author } = surface()
  await author((ctx) => { ctx.binnacle.view('prompt', foldedAlike) })
  const { pane, lines } = alikePane(registrations)
  assert.deepEqual(lines(), ['one', '… 1 more line', '', 'two', '… 1 more line'])
  pane.handleKey({ kind: 'key', binding: 'focus.previous' })
  assert.deepEqual(lines(), ['one', '… 1 more line', '', 'two', '▸ show 1 more line'])
  pane.handleKey({ kind: 'key', binding: 'focus.previous' })
  assert.deepEqual(lines(), ['one', '▸ show 1 more line', '', 'two', '… 1 more line'])
})

test('an author\'s adapter turns an event kind into a fact of their own, which their view draws', async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.facts('test/marker', () => ({ name: 'seeded', data: { from: 'fork' } }))
    ctx.binnacle.view('seeded', () => ({ kind: 'text', text: '— seeded from a fork —' }))
  })
  assert.deepEqual(shown(registrations, seed), ['', ' › fix the build', '', '', '— seeded from a fork —'])
})

test('a fact of the author\'s own with no view is drawn by the fallback, by its name, never dropped', async () => {
  const { registrations, author } = surface()
  await author((ctx) => { ctx.binnacle.facts('test/marker', () => ({ name: 'seeded', data: { from: 'fork' } })) })
  assert.deepEqual(shown(registrations, seed), ['', ' › fix the build', '', '', '? seeded · 3 lines'])
})

test('the newest plugin to draw a key draws it, on what the one before drew, and disposing either gives its place back', async () => {
  const { registrations, author } = surface()
  const first = await author((ctx) => { ctx.binnacle.view('prompt', () => ({ kind: 'text', text: 'first' })) })
  const second = await author((ctx) => { ctx.binnacle.view('prompt', (_, next) => ({ kind: 'stack', children: [next(), { kind: 'text', text: 'second' }] })) })
  assert.deepEqual(shown(registrations), ['first', 'second'])
  await first.dispose()
  assert.deepEqual(shown(registrations), ['', ' › fix the build', '', 'second'])
  await second.dispose()
  assert.deepEqual(shown(registrations), ['', ' › fix the build', ''])
})

test('an author\'s view may name a mark, and the theme draws its glyph in the mark\'s tone', async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.view('prompt', () => ({ kind: 'text', text: [{ mark: 'failed' }, ' the build'] }))
  })
  assert.deepEqual(shown(registrations), ['✗ the build'])
  const raw = screen([prompt], initial, 40, registrations.views).lines.map(line => line.trimEnd())
  assert.equal(raw[0], '\x1b[31m✗\x1b[39m the build')
})

test('an author\'s view naming a mark the theme has not is drawn by the view beneath, which names the mark', async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.view('prompt', () => ({ kind: 'text', text: [{ mark: 'shrug' }, ' the build'] }) as unknown as Node)
  })
  assert.deepEqual(shown(registrations), ['', ' › fix the build', '', '✗ binnacle.view(prompt) returned no', 'drawable node: shrug is no mark'])
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
    ctx.binnacle.facts('test/marker', () => ({ name: 'seeded', data: {} }))
    ctx.binnacle.view('seeded', () => ({ kind: 'text', text: 'seeded' }))
  })
  const forked = await author((ctx) => {
    ctx.binnacle.facts('test/marker', () => ({ name: 'forked', data: {} }))
    ctx.binnacle.view('forked', () => ({ kind: 'text', text: 'forked' }))
  })
  assert.deepEqual(shown(registrations, seed), ['', ' › fix the build', '', '', 'forked'])
  await forked.dispose()
  assert.deepEqual(shown(registrations, seed), ['', ' › fix the build', '', '', 'seeded'])
})

test('a view is handed what the view beneath it draws, and builds on it', async () => {
  const { registrations, author } = surface()
  await author((ctx) => { ctx.binnacle.view('prompt', (_, next) => ({ kind: 'stack', children: [next(), { kind: 'text', text: '  sent from the phone' }] })) })
  assert.deepEqual(shown(registrations), ['', ' › fix the build', '', '  sent from the phone'])
})

test('two plugins can each draw one tool\'s card, and every other card stays binnacle\'s', async () => {
  const { registrations, author } = surface()
  await author((ctx) => { ctx.binnacle.view('tool', (entry, next) => entry.kind === 'tool' && entry.call.name === 'bash' ? { kind: 'text', text: '$ make' } : next()) })
  await author((ctx) => { ctx.binnacle.view('tool', (entry, next) => entry.kind === 'tool' && entry.call.name === 'read' ? { kind: 'text', text: 'read a file' } : next()) })
  assert.deepEqual(shown(registrations, called(2, 'bash'), called(3, 'read'), called(4, 'grep')), ['', ' › fix the build', '', '', '$ make', '', 'read a file', '', '● grep {}', '  running…'])
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
  assert.deepEqual(lines(), ['› 1', '', '⋯ added by goal · 1 line'])
  marker = '»'
  assert.deepEqual(lines(), ['› 1', '', '⋯ added by goal · 1 line'])
  registrations.invalidate('prompt')
  assert.deepEqual(lines(), ['» 1', '', '⋯ added by goal · 1 line'])
  assert.equal(calls, 1)
})

test('a plugin places a screen, read back as lines, and disposing its plugin takes it back', async () => {
  const { registrations, author } = surface()
  const changes: string[] = []
  registrations.onChange((changed) => { changes.push(changed) })
  const fiber = await author((ctx) => {
    ctx.binnacle.screen('trajectory', { key: 'f2', description: 'open the trajectory', draw: () => ({ kind: 'text', text: 'the turns' }) })
  })
  assert.deepEqual(changes, ['screens'])
  const placed = registrations.screens.get('trajectory')
  assert.equal(placed?.key, 'f2')
  const pane = new ScreenPane(() => [prompt])
  pane.place('trajectory', placed ?? { draw: () => ({ kind: 'blank' }) })
  assert.deepEqual(pane.render(40).map(line => stripTerminalSequences(line).trimEnd()), ['the turns'])
  await fiber.dispose()
  assert.equal(registrations.screens.has('trajectory'), false)
})

test('the newest plugin to place a name places it, and disposing it gives the name back', async () => {
  const { registrations, author } = surface()
  const first = await author((ctx) => { ctx.binnacle.screen('trajectory', { key: 'f2', description: 'first', draw: () => ({ kind: 'text', text: 'first' }) }) })
  await author((ctx) => { ctx.binnacle.screen('trajectory', { key: 'f3', description: 'second', draw: () => ({ kind: 'text', text: 'second' }) }) })
  assert.equal(registrations.screens.get('trajectory')?.description, 'second')
  await first.dispose()
  assert.equal(registrations.screens.get('trajectory')?.description, 'second')
  const fiber = await author((ctx) => { ctx.binnacle.screen('trajectory', { key: 'f3', description: 'second', draw: () => ({ kind: 'text', text: 'second' }) }) })
  await fiber.dispose()
  assert.equal(registrations.screens.get('trajectory')?.description, 'second', 'disposing one of two alike gives the other back')
})
