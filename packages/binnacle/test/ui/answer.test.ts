/**
 * A gesture answered: the one place a gesture that has landed becomes a
 * change of UI state, shared by the panes that hold the state a person
 * changes — the transcript's and a placed screen's.
 *
 * @module binnacle/test/ui/answer
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Region } from '../../src/contract/index.ts'
import { answer } from '../../src/ui/answer.ts'
import { initial } from '../../src/ui/state.ts'

/** A fold's region, offering to open. */
const fold: Region = { id: 'fold', affordances: [{ kind: 'expand', label: 'show 1 more line' }], overflows: false }

/** A region of prose, offering nothing. */
const prose: Region = { id: 'prose', affordances: [], overflows: false }

test('a key on the focused region answers its primary affordance, and focus that did not move is not reported', () => {
  assert.deepEqual(answer({ toggled: new Set(), focus: 'fold' }, { kind: 'key', binding: 'primary' }, [fold], { focusable: ['fold'] }), {
    state: { toggled: new Set(['fold']), focus: 'fold' },
  })
})

test('a key that moves focus says the region it moved to, landing on nothing to do it', () => {
  assert.deepEqual(answer(initial, { kind: 'key', binding: 'focus.previous' }, [], { focusable: ['a', 'b'] }), {
    state: { toggled: new Set(), focus: 'b' },
    focus: 'b',
  })
})

test('a gesture that means nothing where it lands is not answered', () => {
  assert.equal(answer(initial, { kind: 'key', binding: 'primary' }, [prose], { focusable: ['prose'] }), undefined)
  assert.equal(answer(initial, { kind: 'click' }, [], { focusable: [] }), undefined)
})
