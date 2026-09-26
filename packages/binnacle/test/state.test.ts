import { test } from 'node:test'
import assert from 'node:assert/strict'
import { act, initial } from '../src/ui/state.ts'

const BOUNDS = { scrollLimit: 10, focusable: ['tool:c1', 'reasoning:8:0', 'unknown:2'] }

test('expand opens a region, and again folds it', () => {
  const opened = act(initial, { kind: 'invoke', region: 'tool:c1', affordance: 'expand' }, BOUNDS)
  assert.deepEqual([...opened.expanded], ['tool:c1'])
  assert.deepEqual([...act(opened, { kind: 'invoke', region: 'tool:c1', affordance: 'expand' }, BOUNDS).expanded], [])
})

test('the wheel up moves away from the end, within the transcript', () => {
  assert.equal(act(initial, { kind: 'scroll', region: 'transcript', delta: -3 }, BOUNDS).scroll, 3)
  assert.equal(act({ ...initial, scroll: 9 }, { kind: 'scroll', region: 'transcript', delta: -3 }, BOUNDS).scroll, 10)
  assert.equal(act({ ...initial, scroll: 2 }, { kind: 'scroll', region: 'transcript', delta: 3 }, BOUNDS).scroll, 0)
})

test('focus moves through what offers something, in screen order, wrapping', () => {
  const first = act(initial, { kind: 'focus', step: 1 }, BOUNDS)
  assert.equal(first.focus, 'tool:c1')
  assert.equal(act(first, { kind: 'focus', step: -1 }, BOUNDS).focus, 'unknown:2')
  assert.equal(act({ ...initial, focus: 'gone' }, { kind: 'focus', step: 1 }, BOUNDS).focus, 'tool:c1')
})

test('selecting, and an affordance that is not the screen\'s own, leave the screen as it was', () => {
  assert.equal(act(initial, { kind: 'select' }, BOUNDS), initial)
  assert.equal(act(initial, { kind: 'invoke', region: 'answer:8', affordance: 'copy' }, BOUNDS), initial)
})
