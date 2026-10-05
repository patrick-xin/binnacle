import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findProblems } from './check-features.mjs'

const patch = `
- insert:
    - id: binnacle
      name: 'binnacle'
    - id: binnacle-read
      name: 'binnacle/plugins/read'
- id: hmr
  disabled: true
`

const map = (...rows) => ['| Feature | What a person sees | Row | Code |', '|---|---|---|---|', ...rows].join('\n')

test('a feature map with a row for each feature row of the patch has no problems, and the core needs none', () => {
  assert.deepEqual(findProblems(patch, map('| Read view | a session | `binnacle-read` | `x` |')), [])
})

test('a feature row of the patch with no row in the map is a problem', () => {
  assert.deepEqual(findProblems(patch, map()), ['binnacle-read is a row of the bundle with no row in docs/features.md; add one'])
})

test('a row of the map that the patch does not insert is a problem', () => {
  assert.deepEqual(
    findProblems(patch, map('| Read view | a session | `binnacle-read` | `x` |', '| Gone | nothing | `binnacle-gone` | `x` |')),
    ['binnacle-gone is in docs/features.md, but the bundle inserts no such row; remove it, or add the row'],
  )
})
