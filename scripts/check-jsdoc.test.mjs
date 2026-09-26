import { test } from 'node:test'
import assert from 'node:assert/strict'
import { undocumented } from './check-jsdoc.mjs'

const MODULE = '/**\n * What this module is.\n * @module x\n */\n'

test('a documented module whose exports are all documented passes', () => {
  const text = `${MODULE}/** A thing. */\nexport const a = 1\n\n/**\n * Another.\n */\nexport function b(): void {}\n`
  assert.deepEqual(undocumented('a.ts', text), [])
})

test('an export without a JSDoc block right above it is named with its line', () => {
  const text = `${MODULE}// not JSDoc\nexport const a = 1\n/** Doc. */\n\nexport class B {}\nexport interface C {}\n`
  assert.deepEqual(undocumented('a.ts', text), ['a.ts:6: a', 'a.ts:10: C'])
})

test('a file that does not open with a module JSDoc is named', () => {
  assert.deepEqual(undocumented('a.ts', '/** Doc. */\nexport const a = 1\n'), ['a.ts:1: the module has no opening JSDoc with @module'])
})

test('a re-export is documented where it is declared', () => {
  assert.deepEqual(undocumented('a.ts', `${MODULE}export { a } from './b.ts'\nexport * from './c.ts'\n`), [])
})
