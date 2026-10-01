import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseStatus, select } from './format-staged.mjs'

const here = dirname(fileURLToPath(import.meta.url))

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

test("the hook's entry path: a misformatted .ts staged whole is formatted and staged into the index", () => {
  const root = join(here, '..')
  const repo = mkdtempSync(join(tmpdir(), 'binnacle-hook-'))
  const env = { ...process.env, GIT_CEILING_DIRECTORIES: repo }
  delete env.GIT_DIR
  delete env.GIT_WORK_TREE
  delete env.GIT_INDEX_FILE
  const git = (args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env })
  try {
    git(['init', '-q'])
    git(['config', 'user.email', 'test@example.com'])
    git(['config', 'user.name', 'test'])
    writeFileSync(join(repo, 'a.ts'), 'const   a   =   "x";\n')
    mkdirSync(join(repo, 'scripts'))
    writeFileSync(join(repo, 'scripts', 'format-staged.mjs'), readFileSync(join(here, 'format-staged.mjs')))
    symlinkSync(join(root, 'node_modules'), join(repo, 'node_modules'))
    writeFileSync(join(repo, '.oxfmtrc.json'), readFileSync(join(root, '.oxfmtrc.json')))
    git(['add', 'a.ts'])
    // By relative path, as the hook runs it: an absolute /var path and the module's /private/var URL disagree under macOS's symlink.
    const run = spawnSync(process.execPath, ['scripts/format-staged.mjs'], { encoding: 'utf8', cwd: repo, env })
    assert.equal(run.status, 0, run.stderr)
    assert.equal(git(['show', ':a.ts']), "const a = 'x'\n")
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})
