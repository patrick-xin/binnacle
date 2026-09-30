import { test } from 'node:test'
import assert from 'node:assert/strict'
import { longComments, ratchet } from './check-comments.mjs'

test('a comment of two lines or fewer passes', () => {
  const text = `// one\nconst a = 1\n/** Two\n * lines. */\nconst b = 2\n/**\n * Two, with bare delimiters.\n * Still two.\n */\nconst c = 3\n`
  assert.deepEqual(longComments('a.ts', text), [])
})

test('a comment of three lines is refused, named by the line it starts on', () => {
  const text = `const a = 1\n/**\n * One.\n * Two.\n * Three.\n */\nconst b = 2\n`
  assert.deepEqual(longComments('a.ts', text), ['a.ts:2: 3 lines'])
})

test('line comments on consecutive lines are one comment', () => {
  const text = `const a = 1\n  // One.\n  // Two.\n  // Three.\nconst b = 2 // beside\n// apart\n`
  assert.deepEqual(longComments('a.ts', text), ['a.ts:2: 3 lines'])
})

test('a comment citing another repository, even in one line, is refused', () => {
  const text = "// dsh rethrows (`dsh:packages/interaction/commands/src/index.ts`).\nconst a = 1\n/** As `pi:packages/tui/src/tui.ts#TUI` does. */\nconst b = 2\n// a `key: value` is not a citation\n"
  assert.deepEqual(longComments('a.ts', text, ['dsh', 'pi', 'binnacle']), ['a.ts:1: cites dsh', 'a.ts:3: cites pi'])
})

test('the JSDoc of a declaration an author reads may say more, but cite nothing', () => {
  const text = "/**\n * One.\n * Two.\n * Three.\n */\nexport interface Read {}\n/**\n * One.\n * Two, per `dsh:package.json`.\n * Three.\n */\nexport interface Cites {}\n/**\n * One.\n * Two.\n * Three.\n */\nexport interface Unread {}\n"
  assert.deepEqual(longComments('a.ts', text, ['dsh'], [{ line: 6, end: 6 }, { line: 12, end: 12 }]), ['a.ts:7: cites dsh', 'a.ts:13: 3 lines'])
})

test('a file may keep what the baseline records, never more, and a baseline left above a file is lowered', () => {
  const found = new Map([['a.ts', ['a.ts:1: 3 lines', 'a.ts:9: cites dsh']], ['b.ts', ['b.ts:4: 5 lines']], ['c.ts', []]])
  const baseline = { 'a.ts': 2, 'c.ts': 1 }
  assert.deepEqual(ratchet(found, baseline), [
    'b.ts:4: 5 lines',
    'c.ts: the baseline holds 1, and 0 are left: lower it',
  ])
})

test('a baseline for a file that is gone is removed', () => {
  assert.deepEqual(ratchet(new Map(), { 'gone.ts': 2 }), ['gone.ts: the baseline holds 2, and 0 are left: lower it'])
})

test('the JSDoc of a member of a declaration an author reads may say more too', () => {
  const text = "export interface Read {\n  /**\n   * One.\n   * Two.\n   * Three.\n   */\n  readonly a: string\n}\nconst b = {\n  /**\n   * One.\n   * Two.\n   * Three.\n   */\n  c: 1,\n}\n"
  assert.deepEqual(longComments('a.ts', text, [], [{ line: 1, end: 8 }]), ['a.ts:10: 3 lines'])
})
