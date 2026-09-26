import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripTerminalSequences } from '@earendil-works/pi-tui'
import type { Entry } from '../src/models/transcript.ts'
import { layout } from '../src/ui/layout.ts'
import { drawEntry } from '../src/views/entries.ts'

/**
 * What an entry draws at a width, as a person reads it.
 * @param entry - the entry.
 * @param expanded - the regions a person opened.
 * @returns its lines.
 */
const lines = (entry: Entry, expanded: string[] = []): string[] =>
  layout(drawEntry(entry), 40, { expanded: new Set(expanded) }).lines.map(line => stripTerminalSequences(line).trimEnd())

test('a prompt is what the person sent, marked as theirs', () => {
  const entry: Entry = { kind: 'prompt', fact: { kind: 'prompt', seq: 2, time: 10, blocks: [{ kind: 'text', text: 'fix the build' }] } }
  assert.deepEqual(lines(entry), ['› fix the build'])
})

const answer: Entry = {
  kind: 'answer',
  fact: {
    kind: 'answer', seq: 8, time: 20, turn: 1, step: 1, provider: 'deepseek', model: 'deepseek-v4', interrupted: true,
    blocks: [{ kind: 'reasoning', text: 'the build fails in tsc' }, { kind: 'text', text: 'The build' }],
  },
}

test('an answer shows its text, folds its reasoning away, and says when it was cut short', () => {
  assert.deepEqual(lines(answer), ['∴ thinking', '… 1 more line', 'The build', '(interrupted)'])
})

test('expanding the reasoning shows it', () => {
  assert.deepEqual(lines(answer, ['reasoning:8:0']), ['∴ thinking', 'the build fails in tsc', 'The build', '(interrupted)'])
})

const call = { kind: 'call', seq: 9, time: 21, turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{"command":"pnpm build"}' } as const

test('a tool still running says so', () => {
  assert.deepEqual(lines({ kind: 'tool', call }), ['● bash {"command":"pnpm build"}', '  running…'])
})

test('a finished tool shows its output, folded to three rows', () => {
  const result = { kind: 'result', seq: 11, time: 40, turn: 1, step: 1, callId: 'c1', failed: false, blocks: [{ kind: 'text', text: 'a\nb\nc\nd\ne' }], meta: undefined } as const
  assert.deepEqual(lines({ kind: 'tool', call, result }), ['● bash {"command":"pnpm build"}', 'a', 'b', 'c', '… 2 more lines'])
})

test('a failed tool is marked, with the reason dsh gave a person', () => {
  const result = {
    kind: 'result', seq: 11, time: 40, turn: 1, step: 1, callId: 'c1', failed: true,
    failure: { name: 'ExitError', code: 'exit', reason: 'the command exited 2' }, blocks: [{ kind: 'text', text: 'tsc: 1 error' }], meta: undefined,
  } as const
  assert.deepEqual(lines({ kind: 'tool', call, result }), ['✗ bash {"command":"pnpm build"}', '  the command exited 2', 'tsc: 1 error'])
})

test('context the person did not type names who added it, folded away', () => {
  const entry: Entry = { kind: 'context', fact: { kind: 'context', seq: 0, time: 1, source: 'agent-instructions', blocks: [{ kind: 'text', text: 'AGENTS.md\nsays' }] } }
  assert.deepEqual(lines(entry), ['⋯ added by agent-instructions', '… 2 more lines'])
})

test('a result with no call on screen names the call it answers', () => {
  const entry: Entry = { kind: 'result', fact: { kind: 'result', seq: 11, time: 40, turn: 1, step: 1, callId: 'c9', failed: false, blocks: [{ kind: 'text', text: 'ok' }], meta: undefined } }
  assert.deepEqual(lines(entry), ['● result of call c9', 'ok'])
})

test('a kind nothing draws is its type in one line, and expand shows the raw record', () => {
  const entry: Entry = { kind: 'unknown', fact: { kind: 'unknown', seq: 2, time: 900, type: 'goal/change', record: { type: 'goal/change', data: {} } } }
  assert.deepEqual(lines(entry), ['? goal/change', '… 4 more lines'])
  assert.deepEqual(lines(entry, ['unknown:2']), ['? goal/change', '{', '  "type": "goal/change",', '  "data": {}', '}'])
})
