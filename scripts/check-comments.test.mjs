import { test } from 'node:test'
import assert from 'node:assert/strict'
import { longComments, ratchet } from './check-comments.mjs'
import { authorSurface } from './check-jsdoc.mjs'

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

test('line comments on consecutive lines are one comment where lines end in CRLF too', () => {
  assert.deepEqual(longComments('a.ts', '// One.\r\n// Two.\r\n// Three.\r\nconst a = 1\r\n'), ['a.ts:1: 3 lines'])
})

test('only JSDoc an author reads may say more: a plain block, or a comment in a body, is held to two lines', () => {
  const cases = [
    '/* one\n two\n three */\nexport interface Read {}\n',
    '/** Doc. */\nexport interface Read {\n  /* one\n  two\n  three */\n  value: string\n}\n',
    '/** Doc. */\nexport const run = (): void => {\n  /** one\n   * two\n   * three */\n  console.log("ok")\n}\n',
  ]
  for (const text of cases) {
    const surface = authorSurface('a.ts', () => text)
    assert.equal(longComments('a.ts', text, [], surface).length, 1, text)
  }
})

test('a comment in any function an author declaration holds is held to two lines, however the function is reached', () => {
  const body = '{\n  /** one\n   * two\n   * three */\n}'
  const cases = [
    `/** Doc. */\nexport const a = () => ${body}, b = 1\n`,
    `/** Doc. */\nexport const a = true ? () => ${body} : () => {}\n`,
    `/** Doc. */\nexport const a = { run: () => ${body} }\n`,
  ]
  for (const text of cases) assert.equal(longComments('a.ts', text, [], authorSurface('a.ts', () => text)).length, 1, text)
})

test('the JSDoc of an author declaration\'s members, in an interface, a type or an object, may say more', () => {
  const doc = '/**\n * One.\n * Two.\n * Three.\n */\n'
  const text = `export interface A {\n${doc}  a: string\n}\nexport type B = {\n${doc}  b: string\n}\nexport const c = {\n${doc}  c: 1,\n}\n`
  assert.deepEqual(longComments('a.ts', text, [], authorSurface('a.ts', () => text)), [])
})
