import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkFolderNotes } from './check-folder-notes.mjs'

const SRC = 'packages/binnacle/src'
const ts = path => ({ path: `${SRC}/${path}`, text: 'export {}\n' })
const note = (folder, text) => ({ path: `${SRC}/${folder === '' ? '' : `${folder}/`}AGENTS.md`, text })

test('a folder with no AGENTS.md is a problem', () => {
  assert.deepEqual(checkFolderNotes([ts('ui/pointer.ts')]), [
    'packages/binnacle/src: no AGENTS.md — add one saying in a line what each file here is for',
    'packages/binnacle/src/ui: no AGENTS.md — add one saying in a line what each file here is for',
  ])
})

test('a file or folder the note does not name is a problem naming both', () => {
  const files = [note('ui', '# ui\n\nDraws.\n\n- `node.ts` — nodes.\n'), ts('ui/node.ts'), ts('ui/pointer.ts'), ts('ui/deep/x.ts'), note('ui/deep', '# ui/deep\n\n- `x.ts` — x.\n'), note('', '# src\n\n- `ui/` — ui.\n')]
  assert.deepEqual(checkFolderNotes(files), [
    'packages/binnacle/src/ui/AGENTS.md: says nothing of pointer.ts — add a line for it',
    'packages/binnacle/src/ui/AGENTS.md: says nothing of deep/ — add a line for it',
  ])
})

test('a bullet naming what is not there is a problem', () => {
  const files = [note('ui', '# ui\n\n- `node.ts` — nodes.\n- `gone.ts` — was.\n- `old/` — was.\n'), ts('ui/node.ts'), note('', '# src\n\n- `ui/` — ui.\n')]
  assert.deepEqual(checkFolderNotes(files), [
    'packages/binnacle/src/ui/AGENTS.md: names gone.ts, which is not here — remove its line',
    'packages/binnacle/src/ui/AGENTS.md: names old/, which is not here — remove its line',
  ])
})

test('bullets under a later heading are free text and are not checked', () => {
  const files = [note('ui', '# ui\n\n- `node.ts` — nodes.\n\n## Keep\n\n- `gone.ts` is not a file.\n'), ts('ui/node.ts'), note('', '# src\n\n- `ui/` — ui.\n')]
  assert.deepEqual(checkFolderNotes(files), [])
})
