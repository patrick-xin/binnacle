import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseStatus, select } from './format-staged.mjs'

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

test('a file staged as added and then gone from disk — AD — is dropped: there is nothing there to format', () => {
  const chosen = select({
    staged: [
      { status: 'A', path: 'packages/binnacle/src/ui/gone.ts' },
      { status: 'A', path: 'packages/binnacle/src/ui/theme.ts' },
    ],
    unstaged: ['packages/binnacle/src/ui/gone.ts'],
    exists: (path) => path !== 'packages/binnacle/src/ui/gone.ts',
  })
  assert.deepEqual(chosen, { format: ['packages/binnacle/src/ui/theme.ts'], skipped: [] })
})

test('an empty stage formats nothing and skips nothing', () => {
  assert.deepEqual(select({ staged: [], unstaged: [], exists: () => true }), { format: [], skipped: [] })
})

test("a commit through git's temporary index — `git commit -- <paths>` — formats nothing: a format staged into it is reverted by the next commit", () => {
  const chosen = select({
    staged: [{ status: 'M', path: 'packages/binnacle/src/ui/node.ts' }],
    unstaged: [],
    exists: () => true,
    index: 'temporary',
  })
  assert.deepEqual(chosen, { format: [], skipped: [] })
})

test("a staged rename's -z record carries the old path as a bare second record, which is not parsed", () => {
  const parsed = parseStatus('R  packages/binnacle/src/ui/node.ts\0packages/binnacle/src/ui/old.ts\0')
  assert.deepEqual(parsed, {
    staged: [{ status: 'R', path: 'packages/binnacle/src/ui/node.ts' }],
    unstaged: [],
  })
})

test('the two-column statuses parse: MM both, AD both, " A" worktree only, ?? neither', () => {
  const cases = [
    ['MM a.ts\0', [{ status: 'M', path: 'a.ts' }], ['a.ts']],
    ['AD a.ts\0', [{ status: 'A', path: 'a.ts' }], ['a.ts']],
    [' A a.ts\0', [], ['a.ts']],
    ['?? a.ts\0', [], []],
  ]
  for (const [listed, staged, unstaged] of cases) {
    assert.deepEqual(parseStatus(listed), { staged, unstaged }, listed.trim())
  }
})
