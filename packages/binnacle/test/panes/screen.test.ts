import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Fact } from '../../src/facts/adapt.ts'
import type { Node } from '../../src/api.ts'
import { ScreenPane } from '../../src/panes/screen.ts'
import { drawText } from '../../src/ui/draw.ts'
import type { ScreenScroll } from '../../src/ui/keys.ts'
import { pointer } from '../support/pointer.ts'
import { prompt } from '../support/facts.ts'

test('the pane draws what its placed screen returns, covering the rows it is given', () => {
  const facts: Fact[] = [prompt(1, 1, 'fix the build')]
  const pane = new ScreenPane(() => {}, () => facts, () => 4)
  pane.place('trajectory', { draw: () => ({ kind: 'text', text: 'one' }) })
  assert.deepEqual(drawText(pane, 40), ['one', '', '', ''])
})

test('the drawing is handed the session\'s facts as they stand, at each frame', () => {
  const facts: Fact[] = [prompt(1, 1, 'fix the build')]
  const handed: (readonly Fact[])[] = []
  const pane = new ScreenPane(() => {}, () => facts, () => 4)
  pane.place('trajectory', { draw: (given) => { handed.push(given); return { kind: 'blank' } } })
  drawText(pane, 40)
  assert.deepEqual(handed, [[prompt(1, 1, 'fix the build')]])
  facts.push(prompt(2, 2, 'and the tests'))
  drawText(pane, 40)
  assert.deepEqual(handed.at(-1), [prompt(1, 1, 'fix the build'), prompt(2, 2, 'and the tests')])
})

test('content taller than the screen is shown from its top, and scrolls by line and by jump, clamped at both ends', () => {
  const pane = new ScreenPane(() => {}, () => [], () => 3)
  pane.place('trajectory', {
    draw: () => ({ kind: 'stack', children: [1, 2, 3, 4, 5].map(line => ({ kind: 'text' as const, text: `l${line}` })) }),
  })
  assert.deepEqual(drawText(pane, 40), ['l1', 'l2', 'l3'])
  const scrolled = (scroll: ScreenScroll): string[] => {
    pane.scrollBy(scroll)
    return drawText(pane, 40)
  }
  assert.deepEqual(scrolled('line.down'), ['l2', 'l3', 'l4'])
  assert.deepEqual(scrolled('end'), ['l3', 'l4', 'l5'])
  assert.deepEqual(scrolled('line.down'), ['l3', 'l4', 'l5'], 'clamped at its end')
  assert.deepEqual(scrolled('top'), ['l1', 'l2', 'l3'])
  assert.deepEqual(scrolled('line.up'), ['l1', 'l2', 'l3'], 'clamped at its top')
})

test('the wheel scrolls the screen, and the pane claims the event', () => {
  const pane = new ScreenPane(() => {}, () => [], () => 3)
  pane.place('trajectory', {
    draw: () => ({ kind: 'stack', children: [1, 2, 3, 4, 5].map(line => ({ kind: 'text' as const, text: `l${line}` })) }),
  })
  drawText(pane, 40)
  pane.scrollBy('end')
  assert.deepEqual(pane.handleMouse(pointer('wheel', 1)), { handled: true })
  assert.deepEqual(drawText(pane, 40), ['l2', 'l3', 'l4'])
})

test('a drawing that throws draws what went wrong, naming its registration, and the pane stays up', () => {
  const pane = new ScreenPane(() => {}, () => [], () => 2)
  pane.place('trajectory', { draw: () => { throw new Error('no phone') } })
  assert.deepEqual(drawText(pane, 60), ['✗ binnacle.screen(trajectory) threw: no phone', ''])
})

test('a drawing that returns no node binnacle can lay out draws what went wrong likewise', () => {
  const pane = new ScreenPane(() => {}, () => [], () => 2)
  pane.place('trajectory', { draw: () => ({ kind: 'shrug' }) as unknown as Node })
  assert.deepEqual(drawText(pane, 100), ['✗ binnacle.screen(trajectory) returned no drawable node: shrug is no kind of node', ''])
})
