#!/usr/bin/env node
// A built-in is an author's example, so it may import only what an author can: binnacle's entry, its own folder, and packages (ADR 3).
// An import that an author cannot make yet names its issue on its line, so it goes with the import and no record has to be kept.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, posix, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'

const ENTRY = 'index.ts'
const GAP = /^[^\n]*?\/\/ Author Gap #\d+/

export function importsOf(path, text) {
  const { module } = parseSync(path, text)
  const requests = [
    ...module.staticImports.map((item) => item.moduleRequest),
    ...module.staticExports.flatMap((item) => item.entries.flatMap((entry) => entry.moduleRequest ?? [])),
    ...module.dynamicImports.map((item) => {
      const source = text.slice(item.moduleRequest.start, item.moduleRequest.end)
      return { ...item.moduleRequest, value: /^(['"`])([^'"`$]*)\1$/.exec(source)?.[2] ?? source }
    }),
  ]
  return requests.map((request) => ({ value: request.value, marked: GAP.test(text.slice(request.end)) }))
}

/** `files` are paths under `src/`, as `plugins/<plugin>/<file>`, with their text. */
export function findProblems(files) {
  const problems = []
  for (const { path, text } of files) {
    const plugin = path.split('/')[1]
    for (const { value, marked } of importsOf(path, text)) {
      if (!value.startsWith('.') || marked) continue
      const target = posix.normalize(posix.join(posix.dirname(path), value))
      if (target === ENTRY || target.startsWith(`plugins/${plugin}/`)) continue
      problems.push(
        `src/${path} imports ${target}, which an author cannot; import it from binnacle's entry, or file an issue labelled author-gap and end the line with // Author Gap #<n>`,
      )
    }
  }
  return problems
}

function sources(src) {
  const plugins = join(src, 'plugins')
  return readdirSync(plugins, { recursive: true })
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
    .map((file) => {
      const path = relative(src, join(plugins, file)).split('\\').join('/')
      return { path, text: readFileSync(join(src, path), 'utf8') }
    })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const problems = findProblems(sources(join(root, 'packages', 'binnacle', 'src')))
  for (const problem of problems) console.error(problem)
  console.log(problems.length === 0 ? 'check-imports: ok' : `check-imports: ${problems.length} problems`)
  process.exitCode = problems.length === 0 ? 0 : 1
}
