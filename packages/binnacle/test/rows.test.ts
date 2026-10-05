import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Rows } from '../src/core/view.ts'

test('a Part that redraws with one line more has only that line wrapped again, so a long transcript streams at the cost of what changed', () => {
  const wrapped: string[] = []
  const rows = new Rows((line) => {
    wrapped.push(line)
    return [line]
  })
  const lines = Array.from({ length: 1000 }, (_, index) => `event ${index}`)
  const part = { lines: () => lines }
  rows.of(part, 20)
  wrapped.length = 0
  lines.push('delta')
  rows.forget(part)
  assert.deepEqual([rows.of(part, 20).length, wrapped], [1001, ['delta']])
})
