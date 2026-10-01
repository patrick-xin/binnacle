import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findCitations, checkCitations } from './check-citations.mjs'

const NAMES = ['pi', 'dsh', 'private']

// `^` becomes a backtick at run time, so this file cites nothing itself.
const cite = (text) => text.replaceAll('^', String.fromCharCode(96))
const onlyTui = (name, path) => (path === 'packages/tui/src/tui.ts' ? 'export class TUI extends Container {}' : null)
const unfetched = () => undefined

test('a citation is a reference name and a path, in backticks, and the symbol after a hash', () => {
  const text = cite('drawn as pi does (^pi:packages/tui/src/tui.ts^)\nand ^dsh:packages/agent/src/index.ts#buildRequest^')
  assert.deepEqual(findCitations(text, NAMES), [
    { name: 'pi', path: 'packages/tui/src/tui.ts', line: 1 },
    { name: 'dsh', path: 'packages/agent/src/index.ts', symbol: 'buildRequest', line: 2 },
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

test('a symbol a reference cites must be written in its file at the pin, as a whole word', () => {
  const files = [
    {
      path: 'n.md',
      text: cite('^pi:packages/tui/src/tui.ts#TUI^\n^pi:packages/tui/src/tui.ts#TU^ ^pi:packages/tui/src/tui.ts#Contain.r^'),
    },
  ]
  const { problems } = checkCitations(files, { pi: { commit: 'abc' } }, onlyTui)
  assert.deepEqual(problems, [
    'n.md:2: pi:packages/tui/src/tui.ts has no TU at abc',
    'n.md:2: pi:packages/tui/src/tui.ts has no Contain.r at abc',
  ])
})

const own = {
  'packages/binnacle/src/facts/adapt.ts': 'function blockOf() {}\nexport function adapt() {}\nexport type { Fact } from "./fact.ts"\n',
  'docs/glossary.md': '| **fact** | One session event |',
  'packages/binnacle/src/api.ts': "export * from './views/view.ts'\nexport * as ui from './ui/node.ts'\n",
  'packages/binnacle/src/views/view.ts': 'export type View = () => void\nexport default 1\n',
}
const here = (name, path) => own[path] ?? null

test('this repository is cited as binnacle, and a symbol in its code must be one its module exports', () => {
  const files = [
    {
      path: 'n.md',
      text: cite(
        '^binnacle:packages/binnacle/src/facts/adapt.ts#adapt^ ^binnacle:packages/binnacle/src/facts/adapt.ts#Fact^\n^binnacle:packages/binnacle/src/facts/adapt.ts#blockOf^',
      ),
    },
  ]
  const { problems } = checkCitations(files, { binnacle: { self: true } }, here)
  assert.deepEqual(problems, ['n.md:2: binnacle:packages/binnacle/src/facts/adapt.ts does not export blockOf'])
})

test('a citation of this repository whose file is gone, or whose prose lacks the word, is a problem', () => {
  const files = [{ path: 'n.md', text: cite('^binnacle:docs/glossary.md#fact^ ^binnacle:docs/glossary.md#turn^\n^binnacle:src/gone.ts^') }]
  const { problems } = checkCitations(files, { binnacle: { self: true } }, here)
  assert.deepEqual(problems, ['n.md:1: binnacle:docs/glossary.md has no turn', 'n.md:2: binnacle:src/gone.ts is not in this repository'])
})

test('a symbol is exported through a star re-export too, and a namespace re-export by its name', () => {
  const files = [
    {
      path: 'n.md',
      text: cite(
        '^binnacle:packages/binnacle/src/api.ts#View^ ^binnacle:packages/binnacle/src/api.ts#ui^\n^binnacle:packages/binnacle/src/api.ts#default^',
      ),
    },
  ]
  const { problems } = checkCitations(files, { binnacle: { self: true } }, here)
  assert.deepEqual(problems, ['n.md:2: binnacle:packages/binnacle/src/api.ts does not export default'])
})

const everywhere = (name, path) => (name === 'pi' ? onlyTui(name, path) : here(name, path))

test('a decision record cites nothing, as it is never edited to follow a move: a citation in one is a problem, resolved or not', () => {
  const files = [
    { path: 'docs/adr/0001-x.md', text: cite('as pi draws (^pi:packages/tui/src/tui.ts^)\nand ^binnacle:docs/glossary.md#fact^') },
    { path: 'docs/glossary.md', text: cite('^pi:packages/tui/src/tui.ts^') },
  ]
  assert.deepEqual(checkCitations(files, { pi: { commit: 'abc' }, binnacle: { self: true } }, everywhere).problems, [
    'docs/adr/0001-x.md:1: pi:packages/tui/src/tui.ts is cited in a decision record, which is never edited to follow it; name what was read, and its version, in words',
    'docs/adr/0001-x.md:2: binnacle:docs/glossary.md is cited in a decision record, which is never edited to follow it; name what was read, and its version, in words',
  ])
})
