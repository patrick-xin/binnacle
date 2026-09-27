import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Text } from '@earendil-works/pi-tui'
import { drawText } from '../../src/ui/draw.ts'

test('a component is drawn at a width as the lines a person reads', () => {
  assert.deepEqual(drawText(new Text('the quick brown fox jumps', 0, 0), 10), ['the quick', 'brown fox', 'jumps'])
})

test('styling is not what a person reads, so it is not in the lines', () => {
  assert.deepEqual(drawText(new Text('\x1b[1mbold\x1b[22m and \x1b[2mdim\x1b[22m', 0, 0), 40), ['bold and dim'])
})

test('a line wider than its width fails the draw, as it crashes the terminal', () => {
  const overflowing = { render: () => ['fits', '0123456789ABC'], invalidate: () => {} }
  assert.throws(() => drawText(overflowing, 10), { message: 'line 1 is 13 columns wide, over the 10 it was given: 0123456789ABC' })
})
