#!/usr/bin/env node
/**
 * Hold the agent team's skills to one copy each.
 *
 * A skill lives in `.agents/skills/<name>/`, which codex and pi read, and
 * Claude Code reaches it through `.claude/skills/<name>`, a symlink to it. A
 * copy there drifts from the skill it copied, so every entry under
 * `.claude/skills` is a link to the skill of its own name, every skill has
 * one, and a skill's `SKILL.md` is named as its folder is: a harness finds a
 * skill by its folder, and an agent asks for it by its name.
 * @module binnacle/scripts/check-skills
 */
import { lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load, YAMLException } from 'js-yaml'

/**
 * What is at a path, a link read as itself.
 * @param {string} path - the path.
 * @returns {import('node:fs').Stats | undefined} its stats, or nothing when nothing is there.
 */
function at(path) {
  return lstatSync(path, { throwIfNoEntry: false })
}

/**
 * Every way the skills under a repository root fall short.
 * @param {string} root - the repository root.
 * @returns {{ path: string, problem: string }[]} each problem, by the path it is found at: the skills' first, by name, then the links'.
 */
export function findProblems(root) {
  const problems = []
  const skills = join(root, '.agents', 'skills')
  const links = join(root, '.claude', 'skills')
  const named = at(skills) === undefined ? [] : readdirSync(skills).filter(name => at(join(skills, name)).isDirectory()).toSorted()
  for (const name of named) {
    const file = join(skills, name, 'SKILL.md')
    if (at(file) === undefined) problems.push({ path: `.agents/skills/${name}`, problem: 'has no SKILL.md' })
    else {
      const front = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(readFileSync(file, 'utf8'))?.[1]
      let called
      try {
        called = front === undefined ? undefined : load(front)?.name
      } catch (error) {
        if (!(error instanceof YAMLException)) throw error
        problems.push({ path: `.agents/skills/${name}/SKILL.md`, problem: `has frontmatter that is not YAML (${error.reason} at ${error.mark.line + 2}:${error.mark.column + 1}); quote the value` })
        continue
      }
      if (called !== name) problems.push({ path: `.agents/skills/${name}/SKILL.md`, problem: `is named ${called ?? 'nothing'}; name it ${name}, as its folder is` })
    }
    if (at(join(links, name)) === undefined) problems.push({ path: `.agents/skills/${name}`, problem: `has no link; add .claude/skills/${name} -> ../../.agents/skills/${name}` })
  }
  for (const name of at(links) === undefined ? [] : readdirSync(links).toSorted()) {
    const path = `.claude/skills/${name}`
    const home = `../../.agents/skills/${name}`
    if (!at(join(links, name)).isSymbolicLink()) problems.push({ path, problem: `is a copy; make it a symlink to ${home}` })
    else if (readlinkSync(join(links, name)) !== home) problems.push({ path, problem: `links to ${readlinkSync(join(links, name))}; make it link to ${home}` })
    else if (!named.includes(name)) problems.push({ path, problem: 'links to a skill that is not there; remove it' })
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = findProblems(join(dirname(fileURLToPath(import.meta.url)), '..'))
  for (const found of problems) console.error(`${found.path}: ${found.problem}`)
  console.log(problems.length === 0 ? 'check-skills: ok' : `check-skills: ${problems.length} problems`)
  process.exitCode = problems.length === 0 ? 0 : 1
}
