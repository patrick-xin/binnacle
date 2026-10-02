import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readable } from '../../src/ui/readable.ts'

test('a control character is drawn as a picture a person can see: C0 as its control picture, DEL as ␡, C1 as �, and tab and newline as they are', () => {
  assert.deepEqual(readable({ kind: 'text', text: 'a\x07b\x7fc\x85d\te\nf' }), { kind: 'text', text: 'a␇b␡c�d\te\nf' })
})

test('a carriage return before a newline is the line ending and goes; anywhere else it is drawn ␍', () => {
  assert.deepEqual(readable({ kind: 'text', text: 'one\r\ntwo\rthree' }), { kind: 'text', text: 'one\ntwo␍three' })
})

test('a terminal sequence is dropped and its visible text kept', () => {
  assert.deepEqual(readable({ kind: 'text', text: '\x1b[31mred\x1b[0m \x1b]0;title\x07kept' }), { kind: 'text', text: 'red kept' })
})

test('every string a node carries is treated, wherever it sits, and a mark or a moment is left as it is', () => {
  const bell = 'x\x07'
  const drawn = readable({
    kind: 'stack',
    children: [
      { kind: 'markdown', text: bell },
      { kind: 'text', text: [bell, { text: bell, tone: 'muted' }, { mark: 'done' }, { since: 5 }] },
      { kind: 'offer', id: bell, affordances: [{ kind: 'copy', label: bell }, { kind: 'expand' }], child: { kind: 'blank' } },
      { kind: 'ask', title: bell, child: { kind: 'band', background: 'userMessageBg', child: { kind: 'text', text: bell } } },
      { kind: 'show', title: [bell], child: { kind: 'fold', id: 'output', title: [bell], child: { kind: 'text', text: bell } } },
    ],
  })
  assert.deepEqual(drawn, {
    kind: 'stack',
    children: [
      { kind: 'markdown', text: 'x␇' },
      { kind: 'text', text: ['x␇', { text: 'x␇', tone: 'muted' }, { mark: 'done' }, { since: 5 }] },
      { kind: 'offer', id: bell, affordances: [{ kind: 'copy', label: 'x␇' }, { kind: 'expand' }], child: { kind: 'blank' } },
      { kind: 'ask', title: 'x␇', child: { kind: 'band', background: 'userMessageBg', child: { kind: 'text', text: 'x␇' } } },
      { kind: 'show', title: ['x␇'], child: { kind: 'fold', id: 'output', title: ['x␇'], child: { kind: 'text', text: 'x␇' } } },
    ],
  })
})
