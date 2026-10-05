#!/usr/bin/env node
// Claude Code reads a skill through .claude/skills/<name>. A copy there drifts from the skill, so each must be a symlink.
import { lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load, YAMLException } from 'js-yaml'

function at(path) {
  return lstatSync(path, { throwIfNoEntry: false })
}

export function findProblems(root) {
  const problems = []
  const skills = join(root, '.agents', 'skills')
  const links = join(root, '.claude', 'skills')
  const entries = at(skills) === undefined ? [] : readdirSync(skills).toSorted()
  for (const name of entries.filter((entry) => at(join(skills, entry)).isSymbolicLink())) {
    problems.push({
      path: `.agents/skills/${name}`,
      problem: `is a link to ${readlinkSync(join(skills, name))}; .agents/skills holds the skill itself, so move it here`,
    })
  }
  const named = entries.filter((name) => at(join(skills, name)).isDirectory())
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
        problems.push({
          path: `.agents/skills/${name}/SKILL.md`,
          problem: `has frontmatter that is not YAML: ${error.reason} at ${error.mark.line + 2}:${error.mark.column + 1}; make that line YAML`,
        })
        continue
      }
      if (called !== name)
        problems.push({
          path: `.agents/skills/${name}/SKILL.md`,
          problem: `is named ${called ?? 'nothing'}; name it ${name}, as its folder is`,
        })
    }
    if (at(join(links, name)) === undefined)
      problems.push({ path: `.agents/skills/${name}`, problem: `has no link; add .claude/skills/${name} -> ../../.agents/skills/${name}` })
  }
  for (const name of at(links) === undefined ? [] : readdirSync(links).toSorted()) {
    const path = `.claude/skills/${name}`
    const home = `../../.agents/skills/${name}`
    if (!at(join(links, name)).isSymbolicLink()) problems.push({ path, problem: `is a copy; make it a symlink to ${home}` })
    else if (readlinkSync(join(links, name)) !== home)
      problems.push({ path, problem: `links to ${readlinkSync(join(links, name))}; make it link to ${home}` })
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
