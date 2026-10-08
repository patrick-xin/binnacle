import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findProblems } from './check-intents.mjs'

const PLAIN = `# Intent: a thing

## Problem

A person cannot do it.

## Proposed outcome

A person runs \`dsh --profile binnacle\` and does it.

## Open questions

None.
`

test("an Intent in plain words, under the Intent's sections, has no problems", () => {
  assert.deepEqual(findProblems([{ path: 'intents/thing/intent.md', text: PLAIN }]), [])
})

test("a section that is not an Intent's, such as Decisions, is a problem: the design goes in a Spec, and what is built in a feature's doc", () => {
  const text = `${PLAIN}\n## Decisions\n\n1. The core owns the terminal.\n`
  assert.deepEqual(findProblems([{ path: 'intents/thing/intent.md', text }]), [
    'intents/thing/intent.md:15: "## Decisions" is not a section of an Intent; an Intent has Problem, Proposed outcome, Affected users and systems, Constraints, Stages, Specs and Open questions',
  ])
})

test('a citation of code is a problem: an Intent is in plain words', () => {
  const text = PLAIN.replace(
    'A person cannot do it.',
    'A person cannot do it, as `binnacle:packages/binnacle/src/core/chat.ts#CHAT` shows.',
  )
  assert.deepEqual(findProblems([{ path: 'intents/thing/intent.md', text }]), [
    'intents/thing/intent.md:5: `binnacle:packages/binnacle/src/core/chat.ts#CHAT` cites code; an Intent is in plain words, and the code goes in a Spec or a feature doc',
  ])
})
