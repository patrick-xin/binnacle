#!/usr/bin/env node
// An Intent is the Maintainer's plain words. The design goes in a Spec, and what is built in a feature's doc.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SECTIONS = ['Problem', 'Proposed outcome', 'Affected users and systems', 'Constraints', 'Stages', 'Specs', 'Open questions']
const CITATION = /`[a-z][\w-]*:[^`\s]*\/[^`\s]*`/g

export function findProblems(files) {
  const problems = []
  for (const { path, text } of files) {
    for (const [index, line] of text.split('\n').entries()) {
      const at = `${path}:${index + 1}`
      const section = /^## (.+)$/.exec(line)?.[1]
      if (section !== undefined && !SECTIONS.includes(section))
        problems.push(
          `${at}: "## ${section}" is not a section of an Intent; an Intent has ${SECTIONS.slice(0, -1).join(', ')} and ${SECTIONS.at(-1)}`,
        )
      for (const [citation] of line.matchAll(CITATION))
        problems.push(`${at}: ${citation} cites code; an Intent is in plain words, and the code goes in a Spec or a feature doc`)
    }
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const intents = join(dirname(fileURLToPath(import.meta.url)), '..', 'intents')
  const files = readdirSync(intents).map((slug) => {
    const path = `intents/${slug}/intent.md`
    return { path, text: readFileSync(join(intents, slug, 'intent.md'), 'utf8') }
  })
  const problems = findProblems(files)
  for (const problem of problems) console.error(problem)
  console.log(problems.length === 0 ? 'check-intents: ok' : `check-intents: ${problems.length} problems`)
  process.exitCode = problems.length === 0 ? 0 : 1
}
