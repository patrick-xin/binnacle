import { test } from 'node:test'
import assert from 'node:assert/strict'
import { select } from './format-staged.mjs'

test('a file staged whole is chosen to format', () => {
  const chosen = select({
    staged: [{ status: 'M', path: 'packages/binnacle/src/ui/node.ts' }],
    unstaged: [],
    exists: () => true,
  })
  assert.deepEqual(chosen, { format: ['packages/binnacle/src/ui/node.ts'], skipped: [] })
})

test('a file staged in part is skipped, so unstaged edits never ride into the commit', () => {
  const chosen = select({
    staged: [
      { status: 'M', path: 'packages/binnacle/src/ui/node.ts' },
      { status: 'A', path: 'packages/binnacle/src/ui/theme.ts' },
    ],
    unstaged: ['packages/binnacle/src/ui/node.ts'],
    exists: () => true,
  })
  assert.deepEqual(chosen, { format: ['packages/binnacle/src/ui/theme.ts'], skipped: ['packages/binnacle/src/ui/node.ts'] })
})

test("a rename's old half, gone from disk, is dropped: there is nothing there to format", () => {
  const chosen = select({
    staged: [
      { status: 'R', path: 'packages/binnacle/src/ui/old.ts' },
      { status: 'R', path: 'packages/binnacle/src/ui/node.ts' },
    ],
    unstaged: [],
    exists: (path) => path !== 'packages/binnacle/src/ui/old.ts',
  })
  assert.deepEqual(chosen, { format: ['packages/binnacle/src/ui/node.ts'], skipped: [] })
})

test('an empty stage formats nothing and skips nothing', () => {
  assert.deepEqual(select({ staged: [], unstaged: [], exists: () => true }), { format: [], skipped: [] })
})
