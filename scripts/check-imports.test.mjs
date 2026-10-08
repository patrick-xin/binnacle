import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findProblems } from './check-imports.mjs'

test("a built-in may import binnacle's entry, its own folder and packages", () => {
  const text = [
    "import type { Context } from '@deepseek-ai/cordis'",
    "import { toPlainText } from '../../index.ts'",
    "import { draw } from './draw.ts'",
  ].join('\n')
  assert.deepEqual(findProblems([{ path: 'plugins/questions/index.ts', text }]), [])
})

test('an import from inside binnacle fails, by static import, re-export or dynamic import', () => {
  const files = [
    { path: 'plugins/approvals/index.ts', text: "import { queueOf } from '../requests/index.ts'" },
    { path: 'plugins/approvals/more.ts', text: "export { gestureTable } from '../../core/gestures.ts'" },
    { path: 'plugins/questions/index.ts', text: "await import('../../core/view.ts')" },
  ]
  const hint =
    "which an author cannot; import it from binnacle's entry, or file an issue labelled author-gap and end the line with // Author Gap #<n>"
  assert.deepEqual(findProblems(files), [
    `src/plugins/approvals/index.ts imports plugins/requests/index.ts, ${hint}`,
    `src/plugins/approvals/more.ts imports core/gestures.ts, ${hint}`,
    `src/plugins/questions/index.ts imports core/view.ts, ${hint}`,
  ])
})

test('an import from inside binnacle that names its author-gap issue on its line passes, and a mark on another line does not', () => {
  const marked = "import { visibleWidth } from '../../terminal/utils.ts' // Author Gap #176"
  assert.deepEqual(findProblems([{ path: 'plugins/questions/index.ts', text: marked }]), [])
  const elsewhere = "import { visibleWidth } from '../../terminal/utils.ts'\n// Author Gap #176"
  assert.equal(findProblems([{ path: 'plugins/questions/index.ts', text: elsewhere }]).length, 1)
})
