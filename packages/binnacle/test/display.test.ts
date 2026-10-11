import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Display } from '../src/core/display.ts'

// A row as wide as the terminal leaves the cursor waiting on its last cell, and a terminal erases that cell at an erase to the line's end.
test('a changed row is written after its line is cleared, so a row as wide as the terminal keeps its last cell', () => {
  const written: string[] = []
  new Display((data) => written.push(data)).draw(['abc'])
  assert.deepEqual(written, ['\x1b[?2026h\x1b[1;1H\x1b[Kabc\x1b[0m\x1b[?2026l'])
})
