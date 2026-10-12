import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findInternalImports } from './check-plugins.mjs'

const file = (path, text) => ({ path, text })

test('a built-in that imports a core file is named, with the file and the import', () => {
  const text = "import type { Context } from '@deepseek-ai/cordis'\nimport { createModel } from '../../core/model.ts'\n"
  assert.deepEqual(findInternalImports([file('composer/index.ts', text)]), [
    { path: 'composer/index.ts', line: 2, from: '../../core/model.ts' },
  ])
})

test("binnacle's entry, another built-in's entry, the built-in's own files, cordis and dsh's packages pass", () => {
  const text = [
    "import type { Context } from '@deepseek-ai/cordis'",
    "import type { SessionEvent } from '@deepseek-ai/dsh-session'",
    "import { list, toPlainText } from '../../index.ts'",
    "import type { ComposerState } from '../composer/index.ts'",
    "export { callOf } from './readers.ts'",
  ].join('\n')
  assert.deepEqual(findInternalImports([file('commands/index.ts', text)]), [])
})

test('an import across lines, an export from, and a dynamic import are each read', () => {
  const text = [
    'import {',
    '  wrap,',
    "} from '../../kit/wrap.ts'",
    "export type { Layout } from '../../api.ts'",
    "const later = await import('../../terminal/utils.ts')",
  ].join('\n')
  assert.deepEqual(
    findInternalImports([file('a/index.ts', text)]).map(({ line, from }) => [line, from]),
    [
      [3, '../../kit/wrap.ts'],
      [4, '../../api.ts'],
      [5, '../../terminal/utils.ts'],
    ],
  )
})

test("another built-in's inner file, and a package that is neither cordis nor dsh's, are named", () => {
  const text = "import { glue } from '../transcript/readers.ts'\nimport chalk from 'chalk'\n"
  assert.deepEqual(
    findInternalImports([file('b/index.ts', text)]).map(({ from }) => from),
    ['../transcript/readers.ts', 'chalk'],
  )
})

test('a side-effect import of a core file is named', () => {
  assert.deepEqual(
    findInternalImports([file('a/index.ts', "import '../../core/model.ts'\n")]).map(({ from }) => from),
    ['../../core/model.ts'],
  )
})

test('an import that a comment, a string, a template or a regular expression only mentions is not named', () => {
  const text = [
    "// import { x } from '../../core/model.ts'",
    "/* import '../../core/view.ts' */",
    `const said = "import { x } from '../../core/model.ts'"`,
    "const shown = `import { x } from '../../core/model.ts'`",
    "const quote = /from '['\"]/",
    "import { list } from '../../index.ts'",
  ].join('\n')
  assert.deepEqual(findInternalImports([file('a/index.ts', text)]), [])
})

test('an import in a template expression is read', () => {
  const text = "const a = `${(await import('../../core/model.ts')).x} and ${{ b: 1 }.b}`\nimport { c } from '../../core/view.ts'\n"
  assert.deepEqual(
    findInternalImports([file('a/index.ts', text)]).map(({ line, from }) => [line, from]),
    [
      [1, '../../core/model.ts'],
      [2, '../../core/view.ts'],
    ],
  )
})

test("a core file or another built-in's inner file, spelled another way, is named, and the built-in's own file passes", () => {
  const text = [
    "import { a } from './../../core/model.ts'",
    "import { b } from '../composer/../../core/view.ts'",
    "import { c } from './../transcript/readers.ts'",
    "import { d } from './parts/glue.ts'",
    "import { e } from '../transcript/index.ts'",
  ].join('\n')
  assert.deepEqual(
    findInternalImports([file('commands/index.ts', text)]).map(({ line }) => line),
    [1, 2, 3],
  )
})

test('a cast of the service to a wider type, which reaches what the API does not name, is named', () => {
  const text = 'const place = (binnacle as Binnacle & Focused).focusMovedLast?.()\n'
  assert.deepEqual(findInternalImports([file('a/index.ts', text)]), [
    { path: 'a/index.ts', line: 1, from: 'binnacle as Binnacle & Focused' },
  ])
})

test('a dynamic import whose path is a template is read, and one whose path is not written out is named', () => {
  const text = [
    'const m = await import(`../../core/model.ts`)',
    'const n = await import(`../${name}/index.ts`)',
    'const o = await import(where)',
    'const p = await import(`../../index.ts`)',
  ].join('\n')
  assert.deepEqual(
    findInternalImports([file('a/index.ts', text)]).map(({ line, from }) => [line, from]),
    [
      [1, '../../core/model.ts'],
      [2, 'import(`../${name}/index.ts`)'],
      [3, 'import(where)'],
    ],
  )
})

test('a cast that a comment or a string only mentions is not named', () => {
  const text = ['// Do not use as Binnacle & Focused here.', "const note = 'as Binnacle & Focused'", '/* as Binnacle & Focused */'].join(
    '\n',
  )
  assert.deepEqual(findInternalImports([file('a/index.ts', text)]), [])
})

test('a dynamic import whose path is built from parts is named, and a comment before a path written out whole is not', () => {
  const text = [
    "const m = await import('./' + '../../core/model.ts')",
    "const n = await import(/* the public API */ '../../index.ts')",
  ].join('\n')
  assert.deepEqual(
    findInternalImports([file('composer/index.ts', text)]).map(({ line, from }) => [line, from]),
    [[1, "import('./' + '../../core/model.ts')"]],
  )
})

test('an import type of a core file, and a cast with angle brackets, are named', () => {
  const text = ["type Model = typeof import('../../core/model.ts')", 'const focused = (<Binnacle & Focused>binnacle).focusMovedLast'].join(
    '\n',
  )
  assert.deepEqual(
    findInternalImports([file('a/index.ts', text)]).map(({ line }) => line),
    [1, 2],
  )
})
