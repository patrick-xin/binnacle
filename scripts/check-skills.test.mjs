import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findProblems } from './check-skills.mjs'

function repository() {
  return realpathSync(mkdtempSync(join(tmpdir(), 'binnacle-skills-')))
}

function skill(root, name, text = `---\nname: ${name}\ndescription: What it is for.\n---\n\nBody.\n`) {
  mkdirSync(join(root, '.agents', 'skills', name), { recursive: true })
  writeFileSync(join(root, '.agents', 'skills', name, 'SKILL.md'), text)
}

function linked(root, name, target = join('..', '..', '.agents', 'skills', name)) {
  mkdirSync(join(root, '.claude', 'skills'), { recursive: true })
  symlinkSync(target, join(root, '.claude', 'skills', name))
}

test('a copy of a skill under .claude/skills is refused', () => {
  const root = repository()
  skill(root, 'tdd')
  mkdirSync(join(root, '.claude', 'skills', 'tdd'), { recursive: true })
  writeFileSync(join(root, '.claude', 'skills', 'tdd', 'SKILL.md'), '---\nname: tdd\n---\n')
  assert.deepEqual(findProblems(root), [
    { path: '.claude/skills/tdd', problem: 'is a copy; make it a symlink to ../../.agents/skills/tdd' },
  ])
})

test('a link to anywhere but its own skill under .agents/skills is refused', () => {
  const root = repository()
  skill(root, 'tdd')
  skill(root, 'review')
  linked(root, 'tdd', join('..', '..', '.agents', 'skills', 'review'))
  linked(root, 'review')
  assert.deepEqual(findProblems(root), [
    { path: '.claude/skills/tdd', problem: 'links to ../../.agents/skills/review; make it link to ../../.agents/skills/tdd' },
  ])
})

test('a skill with no link under .claude/skills is refused, and a link to no skill is too', () => {
  const root = repository()
  skill(root, 'tdd')
  linked(root, 'gone')
  assert.deepEqual(findProblems(root), [
    { path: '.agents/skills/tdd', problem: 'has no link; add .claude/skills/tdd -> ../../.agents/skills/tdd' },
    { path: '.claude/skills/gone', problem: 'links to a skill that is not there; remove it' },
  ])
})

test('a skill whose SKILL.md is missing, or names another skill, is refused', () => {
  const root = repository()
  skill(root, 'tdd', '---\nname: red-green\ndescription: What it is for.\n---\n')
  linked(root, 'tdd')
  mkdirSync(join(root, '.agents', 'skills', 'empty'))
  linked(root, 'empty')
  assert.deepEqual(findProblems(root), [
    { path: '.agents/skills/empty', problem: 'has no SKILL.md' },
    { path: '.agents/skills/tdd/SKILL.md', problem: 'is named red-green; name it tdd, as its folder is' },
  ])
})

test('a SKILL.md whose frontmatter is not YAML is refused, saying where it breaks', () => {
  const root = repository()
  skill(root, 'triage', '---\nname: triage\ndescription: Show what needs attention: and move issues.\n---\n')
  linked(root, 'triage')
  assert.deepEqual(findProblems(root), [
    { path: '.agents/skills/triage/SKILL.md', problem: 'has frontmatter that is not YAML: bad indentation of a mapping entry at 3:39; make that line YAML' },
  ])
})

test('a skill under .agents/skills that is itself a link is refused, since .agents/skills holds the one copy', () => {
  const root = repository()
  mkdirSync(join(root, 'elsewhere', 'tdd'), { recursive: true })
  writeFileSync(join(root, 'elsewhere', 'tdd', 'SKILL.md'), '---\nname: tdd\n---\n')
  mkdirSync(join(root, '.agents', 'skills'), { recursive: true })
  symlinkSync(join('..', '..', 'elsewhere', 'tdd'), join(root, '.agents', 'skills', 'tdd'))
  assert.deepEqual(findProblems(root), [
    { path: '.agents/skills/tdd', problem: 'is a link to ../../elsewhere/tdd; .agents/skills holds the skill itself, so move it here' },
  ])
})

test('frontmatter with a key twice is refused at the second, without being told to quote it', () => {
  const root = repository()
  skill(root, 'tdd', '---\nname: tdd\nname: tdd\ndescription: What it is for.\n---\n')
  linked(root, 'tdd')
  assert.deepEqual(findProblems(root), [
    { path: '.agents/skills/tdd/SKILL.md', problem: 'has frontmatter that is not YAML: duplicated mapping key at 3:1; make that line YAML' },
  ])
})
