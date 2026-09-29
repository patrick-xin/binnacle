import { test } from 'node:test'
import assert from 'node:assert/strict'
import { undocumented, undocumentedSurface } from './check-jsdoc.mjs'

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

test('what an author reads is held: every name the entry exports, and each name it re-exports where it is declared, and nothing else', () => {
  const files = {
    'src/api.ts': `export type { Kept } from './ui/node.ts'\n/** Doc. */\nexport interface Own {}\nexport type Bare = string\n`,
    'src/ui/node.ts': `export type Kept = string\nexport type Unread = number\n`,
  }
  assert.deepEqual(undocumentedSurface('src/api.ts', path => files[path]), ['src/api.ts:4: Bare', 'src/ui/node.ts:1: Kept'])
})

test('a declaration an author reaches through another is held too, through the files it is imported from, and nothing it does not reach', () => {
  const files = {
    'src/api.ts': `export type { Node } from './ui/node.ts'\n`,
    'src/ui/node.ts': `import type { Tone } from './theme.ts'\n/** Doc. */\nexport type Node = { span: Span, tone: Tone }\ntype Span = string\ntype Unreached = number\n`,
    'src/ui/theme.ts': `export type Tone = 'dim'\n`,
  }
  assert.deepEqual(undocumentedSurface('src/api.ts', path => files[path]), ['src/ui/node.ts:4: Span', 'src/ui/theme.ts:1: Tone'])
})

test('a module augmentation an author reaches is held: ctx.binnacle is what every author reads', () => {
  const files = { 'src/api.ts': `/** Doc. */\nexport interface Registrations {}\ndeclare module '@deepseek-ai/cordis' {\n  interface Context { binnacle: Registrations }\n}\n` }
  assert.deepEqual(undocumentedSurface('src/api.ts', path => files[path]), ["src/api.ts:3: declare module '@deepseek-ai/cordis'"])
})
