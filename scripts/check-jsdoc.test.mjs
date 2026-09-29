import { test } from 'node:test'
import assert from 'node:assert/strict'
import { undocumented } from './check-jsdoc.mjs'

test('a module whose exports are all documented passes', () => {
  const text = `/** A thing. */\nexport const a = 1\n\n/**\n * Another.\n */\nexport function b(): void {}\n`
  assert.deepEqual(undocumented('a.ts', text), [])
})

test('an export without a JSDoc block right above it is named with its line', () => {
  const text = `// not JSDoc\nexport const a = 1\n/** Doc. */\n\nexport class B {}\nexport interface C {}\n`
  assert.deepEqual(undocumented('a.ts', text), ['a.ts:2: a', 'a.ts:6: C'])
})

test('a file that opens with no JSDoc block is refused only for its undocumented exports', () => {
  assert.deepEqual(undocumented('a.ts', '// a line\nexport const a = 1\n'), ['a.ts:2: a'])
})

test('an opening block set apart from the first export by a blank line documents it', () => {
  assert.deepEqual(undocumented('a.ts', '/** Doc. */\n\nexport const a = 1\n'), [])
})

test('a re-export is documented where it is declared', () => {
  assert.deepEqual(undocumented('a.ts', `export { a } from './b.ts'\nexport * from './c.ts'\n`), [])
})
