import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Fact } from '../../src/facts/adapt.ts'
import type { Node } from '../../src/api.ts'
import { ScreenPane } from '../../src/panes/screen.ts'
import { drawText } from '../../src/ui/draw.ts'
import { builtIn, themed } from '../../src/ui/theme.ts'
import { pointer } from '../support/pointer.ts'
import { prompt } from '../support/facts.ts'

test('the pane draws what its placed screen returns, every line, for the scroll view it sits in', () => {
  const facts: Fact[] = [prompt(1, 1, 'fix the build')]
  const pane = new ScreenPane(() => facts)
  pane.place('trajectory', { draw: () => ({ kind: 'text', text: 'one' }) })
  assert.deepEqual(drawText(pane, 40), ['one'])
})

test('the screen is drawn and laid out again as its facts arrive, and not otherwise: a frame costs what changed', () => {
  const facts: Fact[] = [prompt(1, 1, 'fix the build')]
  const handed: (readonly Fact[])[] = []
  const pane = new ScreenPane(() => facts)
  pane.place('trajectory', { draw: (given) => { handed.push([...given]); return { kind: 'text', text: `lines ${given.length}` } } })
  drawText(pane, 40)
  drawText(pane, 40)
  assert.deepEqual(handed, [[prompt(1, 1, 'fix the build')]], 'the same facts, width and state draw once, however many frames pass')
  facts.push(prompt(2, 2, 'and the tests'))
  drawText(pane, 40)
  assert.deepEqual(handed, [[prompt(1, 1, 'fix the build')]], 'facts the pane was not told of change nothing')
  pane.factsChanged()
  assert.deepEqual(drawText(pane, 40), ['lines 2'])
  assert.deepEqual(handed.at(-1), [prompt(1, 1, 'fix the build'), prompt(2, 2, 'and the tests')], 'told of its facts, the screen draws them as they now stand')
})

test('the screen is drawn in the theme as it stands, and laid out again when it changes', () => {
  let theme = builtIn
  const pane = new ScreenPane(() => [], {}, () => theme)
  pane.place('trajectory', { draw: () => ({ kind: 'text', text: [{ mark: 'prompt' }, ' asked'] }) })
  assert.deepEqual(drawText(pane, 40), ['› asked'])
  theme = themed(builtIn, [{ marks: { prompt: { glyph: '>' } } }])
  assert.deepEqual(drawText(pane, 40), ['> asked'])
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

/** A screen that holds one fold, cut to nothing, over two lines of record. */
function foldScreen(): { readonly draw: (facts: readonly Fact[]) => Node } {
  return {
    draw: () => ({
      kind: 'stack',
      children: [
        { kind: 'text', text: 'one line' },
        { kind: 'fold', id: 'record', rows: 0, child: { kind: 'text', text: 'the\nrecord' } },
      ],
    }),
  }
}

test('a placed screen holds UI state of its own: a click opens a fold, and a click on the open one folds it again', () => {
  const pane = new ScreenPane(() => [])
  pane.place('screened', foldScreen())
  assert.deepEqual(drawText(pane, 40), ['one line', '… 2 more lines'])
  assert.deepEqual(pane.handleMouse(pointer('click', 1)), { handled: true })
  assert.deepEqual(drawText(pane, 40), ['one line', 'the', 'record'])
  assert.deepEqual(pane.handleMouse(pointer('click', 1)), { handled: true })
  assert.deepEqual(drawText(pane, 40), ['one line', '… 2 more lines'])
})

test('enter opens the fold a person focused, and the focus row says what it will do, as on the transcript', () => {
  const pane = new ScreenPane(() => [])
  pane.place('screened', foldScreen())
  assert.deepEqual(drawText(pane, 40), ['one line', '… 2 more lines'])
  assert.equal(pane.handleKey({ kind: 'key', binding: 'focus.previous' }), true)
  assert.deepEqual(drawText(pane, 40), ['one line', '▸ show 2 more lines'])
  assert.equal(pane.handleKey({ kind: 'key', binding: 'primary' }), true)
  assert.deepEqual(drawText(pane, 40), ['one line', 'the', 'record', '▸ fold it away'])
  assert.equal(pane.handleKey({ kind: 'key', binding: 'primary' }), true)
  assert.deepEqual(drawText(pane, 40), ['one line', '▸ show 2 more lines'])
  assert.equal(pane.handleKey({ kind: 'key', binding: 'focus.out' }), true)
  assert.deepEqual(drawText(pane, 40), ['one line', '… 2 more lines'])
})

test('focus moved by a key is reported with its rows, to be brought into view', () => {
  const inView: [number, number][] = []
  const pane = new ScreenPane(() => [], { inView: (top, height) => { inView.push([top, height]) } })
  pane.place('screened', foldScreen())
  drawText(pane, 40)
  assert.equal(pane.handleKey({ kind: 'key', binding: 'focus.previous' }), true)
  assert.deepEqual(inView, [[1, 1]])
})
