import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripTerminalSequences } from '@earendil-works/pi-tui'
import type { TuiMouseEvent } from '@earendil-works/pi-tui'
import type { Fact } from '../src/facts/adapt.ts'
import { TranscriptView } from '../src/host/transcript-view.ts'

const prompt: Fact = { kind: 'prompt', seq: 1, time: 1, blocks: [{ kind: 'text', text: 'fix the build' }] }

/**
 * What a view shows at a width.
 * @param view - the view.
 * @returns its lines, plain.
 */
const shown = (view: TranscriptView): string[] => view.render(40).map(line => stripTerminalSequences(line).trimEnd())

test('the view draws the facts pushed into it, and asks for a frame each time', () => {
  let asked = 0
  const view = new TranscriptView(() => { asked++ })
  view.push(prompt)
  assert.deepEqual(shown(view), ['› fix the build'])
  assert.equal(asked, 1)
})

const context: Fact = { kind: 'context', seq: 2, time: 2, source: 'goal', blocks: [{ kind: 'text', text: 'a\nb' }] }

/**
 * A pointer event on a row of the view, as pi-tui's containers deliver it.
 * @param type - what the pointer did.
 * @param y - the row, in the view's own lines.
 * @returns the event.
 */
const pointer = (type: TuiMouseEvent['type'], y: number): TuiMouseEvent => ({
  type, button: type === 'wheel' || type === 'move' ? 'none' : 'left', x: 0, y, screenX: 0, screenY: y, width: 40, height: 3,
  shift: false, alt: false, ctrl: false, ...type === 'wheel' ? { wheelDelta: -1 } : {},
})

test('a click on a fold opens it, and the view claims the click', () => {
  const view = new TranscriptView(() => {})
  view.push(prompt)
  view.push(context)
  assert.deepEqual(shown(view), ['› fix the build', '⋯ added by goal', '… 2 more lines'])
  assert.deepEqual(view.handleMouse(pointer('click', 2)), { handled: true })
  assert.deepEqual(shown(view), ['› fix the build', '⋯ added by goal', 'a', 'b'])
})

test('a click on what offers nothing, a wheel, a drag and hovering are left to pi-tui', () => {
  const view = new TranscriptView(() => {})
  view.push(prompt)
  view.push(context)
  shown(view)
  for (const event of [pointer('click', 0), pointer('wheel', 2), pointer('drag', 2), pointer('move', 2)]) {
    assert.equal(view.handleMouse(event), undefined, event.type)
  }
})
