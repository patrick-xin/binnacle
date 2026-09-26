import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findCitations, checkCitations } from './check-citations.mjs'

const NAMES = ['pi', 'dsh', 'private']

// `^` becomes a backtick at run time, so this file cites nothing itself.
const cite = text => text.replaceAll('^', String.fromCharCode(96))
const onlyTui = (name, path) => path === 'packages/tui/src/tui.ts'
const unfetched = () => undefined

test('a citation is a reference name and a path, in backticks', () => {
  const text = cite('drawn as pi does (^pi:packages/tui/src/tui.ts^)\nand ^dsh:packages/agent/src/index.ts#buildRequest^')
  assert.deepEqual(findCitations(text, NAMES), [
    { name: 'pi', path: 'packages/tui/src/tui.ts', line: 1 },
    { name: 'dsh', path: 'packages/agent/src/index.ts', line: 2 },
  ])
})

test('a name the manifest does not hold is not a citation', () => {
  assert.deepEqual(findCitations(cite('^http://x^ and ^codex:a/b.rs^ and pi:bare/path'), NAMES), [])
})

test('a citation whose path is missing at the pin is a problem', () => {
  const files = [{ path: 'n.md', text: cite('^pi:packages/tui/src/tui.ts^ ^pi:packages/tui/src/gone.ts^') }]
  const { problems } = checkCitations(files, { pi: { commit: 'abc' } }, onlyTui)
  assert.deepEqual(problems, ['n.md:1: pi:packages/tui/src/gone.ts is not at abc'])
})

test('an unfetched public reference is a problem, an unfetched local one is skipped', () => {
  const files = [{ path: 'n.md', text: cite('^pi:a.ts^\n^private:b.ts^') }]
  const manifest = { pi: { commit: 'abc' }, private: { commit: 'def', local: true } }
  assert.deepEqual(checkCitations(files, manifest, unfetched), {
    problems: [cite('n.md:1: pi is not fetched; run ^pnpm refs^')],
    skipped: 1,
  })
})
