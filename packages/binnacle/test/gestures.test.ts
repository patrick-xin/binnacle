import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Region } from '../src/contract/index.ts'
import { meaning } from '../src/ui/gestures.ts'

/** A tool card whose command was cut: it offers `expand`, and fits. */
const card: Region = { id: 'card', affordances: [{ kind: 'expand', label: 'show the whole command' }], overflows: false }
/** The transcript: offers nothing of its own, and is longer than the screen. */
const transcript: Region = { id: 'transcript', affordances: [], overflows: true }
/** An approval: `grant` is primary, `dismiss` second. */
const approval: Region = {
  id: 'approval',
  affordances: [{ kind: 'grant', label: 'allow the command' }, { kind: 'dismiss', label: 'refuse it' }],
  overflows: false,
}
/** A line of prose that fits and offers nothing. */
const prose: Region = { id: 'prose', affordances: [], overflows: false }

test('a click means the primary affordance of the innermost region offering one', () => {
  assert.deepEqual(meaning({ kind: 'click' }, [card, transcript]), { kind: 'invoke', region: 'card', affordance: 'expand' })
})

test('a click on content that offers nothing means nothing', () => {
  assert.equal(meaning({ kind: 'click' }, [prose, transcript]), undefined)
  assert.equal(meaning({ kind: 'click' }, []), undefined)
})

test('a click never grants, and does not fall through to what is behind the approval', () => {
  assert.equal(meaning({ kind: 'click' }, [approval, card, transcript]), undefined)
})

test('the wheel scrolls the innermost region that overflows', () => {
  assert.deepEqual(meaning({ kind: 'wheel', delta: -3 }, [card, transcript]), { kind: 'scroll', region: 'transcript', delta: -3 })
})

test('the wheel over content that fits, with nothing overflowing behind it, means nothing', () => {
  assert.equal(meaning({ kind: 'wheel', delta: 3 }, [card, prose]), undefined)
})

test('a drag selects, whatever it starts on', () => {
  assert.deepEqual(meaning({ kind: 'drag' }, [card, transcript]), { kind: 'select' })
  assert.deepEqual(meaning({ kind: 'drag' }, []), { kind: 'select' })
})

test('hovering means nothing, even over something that offers', () => {
  assert.equal(meaning({ kind: 'hover' }, [card, transcript]), undefined)
})

test('focus keys move among what offers, whatever is focused', () => {
  assert.deepEqual(meaning({ kind: 'key', binding: 'focus.next' }, [prose]), { kind: 'focus', step: 1 })
  assert.deepEqual(meaning({ kind: 'key', binding: 'focus.previous' }, []), { kind: 'focus', step: -1 })
})

test('the step-out key means focus is dropped, wherever it lands', () => {
  assert.deepEqual(meaning({ kind: 'key', binding: 'focus.out' }, [card]), { kind: 'unfocus' })
  assert.deepEqual(meaning({ kind: 'key', binding: 'focus.out' }, []), { kind: 'unfocus' })
})

test('the primary key invokes the focused region\'s primary affordance, a grant included', () => {
  assert.deepEqual(meaning({ kind: 'key', binding: 'primary' }, [approval]), { kind: 'invoke', region: 'approval', affordance: 'grant' })
  assert.equal(meaning({ kind: 'key', binding: 'primary' }, []), undefined)
})

test('an affordance\'s own key invokes it only where the focused region offers it', () => {
  assert.deepEqual(meaning({ kind: 'key', binding: 'dismiss' }, [approval]), { kind: 'invoke', region: 'approval', affordance: 'dismiss' })
  assert.equal(meaning({ kind: 'key', binding: 'copy' }, [card, transcript]), undefined)
})
