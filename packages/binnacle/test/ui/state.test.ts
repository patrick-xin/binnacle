import { test } from 'node:test'
import assert from 'node:assert/strict'
import { act, initial } from '../../src/ui/state.ts'

const BOUNDS = { focusable: ['tool:c1', 'reasoning:8:0', 'unknown:2'], asks: [] }

test('expand opens a region, and again folds it', () => {
  const opened = act(initial, { kind: 'invoke', region: 'tool:c1', affordance: 'expand' }, BOUNDS)
  assert.deepEqual([...opened.toggled], ['tool:c1'])
  assert.deepEqual([...act(opened, { kind: 'invoke', region: 'tool:c1', affordance: 'expand' }, BOUNDS).toggled], [])
})

test('focus moves through what offers something, in screen order, wrapping', () => {
  const first = act(initial, { kind: 'focus', step: 1 }, BOUNDS)
  assert.equal(first.focus, 'tool:c1')
  assert.equal(act(first, { kind: 'focus', step: -1 }, BOUNDS).focus, 'unknown:2')
  assert.equal(act({ ...initial, focus: 'gone' }, { kind: 'focus', step: 1 }, BOUNDS).focus, 'tool:c1')
})

test('dropping focus keeps what was opened, and leaves a screen with nothing focused as it was', () => {
  const opened = act(initial, { kind: 'invoke', region: 'tool:c1', affordance: 'expand' }, BOUNDS)
  const focused = act(opened, { kind: 'focus', step: 1 }, BOUNDS)
  const dropped = act(focused, { kind: 'unfocus' }, BOUNDS)
  assert.equal(dropped.focus, undefined)
  assert.deepEqual([...dropped.toggled], ['tool:c1'])
  assert.equal(act(initial, { kind: 'unfocus' }, BOUNDS), initial)
})

test("selecting, scrolling, and an affordance that is not the screen's own, leave the screen as it was", () => {
  assert.equal(act(initial, { kind: 'select' }, BOUNDS), initial)
  assert.equal(act(initial, { kind: 'scroll', region: 'transcript', delta: -3 }, BOUNDS), initial)
  assert.equal(act(initial, { kind: 'invoke', region: 'answer:8', affordance: 'copy' }, BOUNDS), initial)
})

/** What one paged ask drew: four rows of prose a page, two pages of it, a window of three over five offers. */
const pageBounds = (page: number) => ({
  focusable: ['o1', 'o2', 'o3', 'o4', 'o5'],
  asks: [{ page, pages: 2, pageRows: 4, window: 0, shown: 3, offers: ['o1', 'o2', 'o3', 'o4', 'o5'] }],
})

test("page moves the ask holding focus's prose page on by its page height less one row, and stops at the last page", () => {
  const paged = act(initial, { kind: 'page', step: 1 }, pageBounds(0))
  assert.deepEqual(paged.asks, [{ page: 3, window: 0 }])
  assert.equal(act(paged, { kind: 'page', step: 1 }, pageBounds(3)), paged, 'already at the last page')
  assert.deepEqual(act({ ...initial, asks: [{ page: 3, window: 0 }] }, { kind: 'page', step: -1 }, pageBounds(3)).asks, [
    { page: 0, window: 0 },
  ])
  assert.equal(act(initial, { kind: 'page', step: -1 }, pageBounds(0)), initial, 'already at the first page')
})

test("jump moves focus by the window's count of offers, clamped at the ends, never wrapping", () => {
  const bounds = {
    focusable: ['o1', 'o2', 'o3', 'o4', 'o5'],
    asks: [{ page: 0, pages: 1, pageRows: 0, window: 0, shown: 2, offers: ['o1', 'o2', 'o3', 'o4', 'o5'] }],
  }
  assert.equal(act(initial, { kind: 'jump', step: 1 }, bounds).focus, 'o3')
  assert.equal(act({ ...initial, focus: 'o2' }, { kind: 'jump', step: 1 }, bounds).focus, 'o4')
  // Clamped at the last offer, never wrapping to the first.
  const atLast = { ...initial, focus: 'o5' }
  assert.equal(act(atLast, { kind: 'jump', step: 1 }, bounds), atLast)
  assert.equal(act({ ...initial, focus: 'o4' }, { kind: 'jump', step: -1 }, bounds).focus, 'o2')
  const atFirst = { ...initial, focus: 'o1' }
  assert.equal(act(atFirst, { kind: 'jump', step: -1 }, bounds), atFirst)
})
