/**
 * The theme checker the author skill points an agent at: run from the built
 * bundle under plain `node`, reading a theme file the way the theme row does
 * — the row's translation, then the theme parser — so the agent knows the
 * authoritative reading before it writes into the profile. The command held
 * here is the chapter's own, resolved from the skill's base directory, so the
 * instruction and the shipped artifact cannot drift apart while tests stay
 * green.
 * @module binnacle/test/host/check-theme
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const skill = dirname(fileURLToPath(new URL('../../skills/binnacle-author/themes.md', import.meta.url)))
const dusk = fileURLToPath(new URL('../../skills/binnacle-author/themes/dusk.json', import.meta.url))

/**
 * The checker the theme chapter names, resolved the way the `skill` tool tells an agent to: against the skill's base directory.
 * @returns the path of the built checker the instruction runs.
 * @throws when the chapter names no checker command.
 */
function namedChecker(): string {
  const chapter = readFileSync(join(skill, 'themes.md'), 'utf8')
  const named = /node (\S*check-theme\S*)/.exec(chapter)?.[1]
  if (named === undefined) throw new Error('the theme chapter names no checker command for an agent to run')
  return isAbsolute(named) ? named : resolve(skill, named)
}

test('the checker the chapter names is the built one, and dusk, checked as an agent checks a file, says ok and exits 0', () => {
  const run = spawnSync(process.execPath, [namedChecker(), dusk], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.equal(run.stdout, 'ok\n')
})

test('a file the reading refuses is said in the reading’s own message, and exits 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'binnacle-check-theme-'))
  const broken = join(dir, 'themes', 'broken.json')
  mkdirSync(join(dir, 'themes'), { recursive: true })
  writeFileSync(broken, '{"tones":{"accent":{"color":"no such colour"}}}')
  try {
    const run = spawnSync(process.execPath, [namedChecker(), broken], { encoding: 'utf8' })
    assert.equal(run.status, 1)
    assert.match(run.stdout, /^binnacle\.theme: tones\.accent\.color is "no such colour", not a colour: /)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
