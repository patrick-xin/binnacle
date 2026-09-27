import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Fact } from '../../src/facts/adapt.ts'
import type { Node } from '../../src/api.ts'
import { ScreenPane } from '../../src/panes/screen.ts'
import { drawText } from '../../src/ui/draw.ts'
import { prompt } from '../support/facts.ts'

test('the pane draws what its placed screen returns, every line, for the scroll view it sits in', () => {
  const facts: Fact[] = [prompt(1, 1, 'fix the build')]
  const pane = new ScreenPane(() => facts)
  pane.place('trajectory', { draw: () => ({ kind: 'text', text: 'one' }) })
  assert.deepEqual(drawText(pane, 40), ['one'])
})

test('the drawing is handed the session\'s facts as they stand, at each frame', () => {
  const facts: Fact[] = [prompt(1, 1, 'fix the build')]
  const handed: (readonly Fact[])[] = []
  const pane = new ScreenPane(() => facts)
  pane.place('trajectory', { draw: (given) => { handed.push(given); return { kind: 'blank' } } })
  drawText(pane, 40)
  assert.deepEqual(handed, [[prompt(1, 1, 'fix the build')]])
  facts.push(prompt(2, 2, 'and the tests'))
  drawText(pane, 40)
  assert.deepEqual(handed.at(-1), [prompt(1, 1, 'fix the build'), prompt(2, 2, 'and the tests')])
})

test('a drawing that throws draws what went wrong, naming its registration, and the pane stays up', () => {
  const pane = new ScreenPane(() => [])
  pane.place('trajectory', { draw: () => { throw new Error('no phone') } })
  assert.deepEqual(drawText(pane, 60), ['✗ binnacle.screen(trajectory) threw: no phone'])
})

test('a drawing that returns no node binnacle can lay out draws what went wrong likewise', () => {
  const pane = new ScreenPane(() => [])
  pane.place('trajectory', { draw: () => ({ kind: 'shrug' }) as unknown as Node })
  assert.deepEqual(drawText(pane, 100), ['✗ binnacle.screen(trajectory) returned no drawable node: shrug is no kind of node'])
})
