import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findProblems, staleDocs } from './check-features.mjs'

const patch = `
- insert:
    - id: binnacle
      name: 'binnacle'
    - id: binnacle-read
      name: 'binnacle/plugins/read'
- id: hmr
  disabled: true
`

const map = (...rows) => ['| Feature | Doc | Rows |', '|---|---|---|', ...rows].join('\n')
const READ = '| Read view | [read](features/read.md) | `binnacle-read` |'
const DOCS = ['read.md']

test('a feature map with a row for each feature row of the patch has no problems, and the core needs none', () => {
  assert.deepEqual(findProblems(patch, map(READ), DOCS), [])
})

test('a feature row of the patch with no row in the map is a problem', () => {
  assert.deepEqual(findProblems(patch, map(), []), ['binnacle-read is a row of the bundle with no row in docs/features.md; add one'])
})

test('a row of the map that the patch does not insert is a problem', () => {
  assert.deepEqual(findProblems(patch, map(READ, '| Gone | [gone](features/read.md) | `binnacle-gone` |'), DOCS), [
    'binnacle-gone is in docs/features.md, but the bundle inserts no such row; remove it, or add the row',
  ])
})

test("a patch with a row configured by dsh's `!!js` tag is read, as dsh reads it", () => {
  const configured = `${patch}- id: tools\n  config:\n    mode: !!js process.env.DSH_TOOLS_MODE\n`
  assert.deepEqual(findProblems(configured, map(READ), DOCS), [])
})

test('a row that composes a dsh package is not a feature, so the map needs no row for it', () => {
  const composed = `${patch.replace('- id: hmr', `    - id: tool-ask-user\n      name: '@deepseek-ai/dsh-tool-ask-user'\n- id: hmr`)}`
  assert.deepEqual(findProblems(composed, map(READ), DOCS), [])
})

test("the core's row may name a feature of the core, and one feature may hold several rows", () => {
  const two = `${patch}- insert:\n    - id: binnacle-more\n      name: 'binnacle/plugins/more'\n`
  const rows = map(
    '| Core | [core](features/core.md) | `binnacle` |',
    '| Read view | [read](features/read.md) | `binnacle-read`, `binnacle-more` |',
  )
  assert.deepEqual(findProblems(two, rows, ['core.md', 'read.md']), [])
})

test('a feature whose doc is missing, and a doc that no feature links, are problems', () => {
  assert.deepEqual(findProblems(patch, map(READ), ['old.md']), [
    'docs/features.md links features/read.md, which does not exist; write it, or fix the link',
    'docs/features/old.md is linked by no feature in docs/features.md; link it, or remove it',
  ])
})

const CODED = [
  '| Feature | Doc | Rows | Code |',
  '|---|---|---|---|',
  '| Core | [core](features/core.md) | `binnacle` | `src/` |',
  '| Gestures | [gestures](features/gestures.md) | `binnacle` | `src/core/gestures.ts` |',
  '| Read view | [read](features/read.md) | `binnacle-read` | `src/plugins/read/` |',
].join('\n')

test("a branch that changes a feature's code and not its doc is a problem, by the longest path that holds the file", () => {
  const changed = ['src/core/gestures.ts', 'src/core/layout.ts', 'src/plugins/read/index.ts', 'docs/features/read.md', 'README.md']
  assert.deepEqual(staleDocs(changed, CODED, ''), [
    "Gestures: the branch changes src/core/gestures.ts, and not docs/features/gestures.md; say what is built now, or add `Feature doc unchanged: Gestures, <why>` to a commit's message",
    "Core: the branch changes src/core/layout.ts, and not docs/features/core.md; say what is built now, or add `Feature doc unchanged: Core, <why>` to a commit's message",
  ])
})

test('a commit that says why a feature doc stays true lets its code change alone', () => {
  const messages = 'refactor: rename a helper\n\nFeature doc unchanged: Gestures, a rename inside the table.\n'
  assert.deepEqual(staleDocs(['src/core/gestures.ts'], CODED, messages), [])
})
