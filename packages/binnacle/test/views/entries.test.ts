import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripTerminalSequences } from '@earendil-works/pi-tui'
import type { Entry } from '../../src/models/transcript.ts'
import { layout } from '../../src/ui/layout.ts'
import { drawEntry } from '../../src/views/entries.ts'
import type { View, Views } from '../../src/views/entries.ts'
import type { Node } from '../../src/ui/node.ts'
import { prompt as promptFact, call as callFact } from '../support/facts.ts'

/**
 * What an entry draws at a width, as a person reads it.
 * @param entry - the entry.
 * @param expanded - the regions a person opened.
 * @returns its lines.
 */
const lines = (entry: Entry, expanded: string[] = []): string[] =>
  layout(drawEntry(entry), 40, { expanded: new Set(expanded) }).lines.map(line => stripTerminalSequences(line).trimEnd())

/**
 * What an entry draws at a width, styling and all, each line as it was drawn.
 * @param entry - the entry.
 * @param expanded - the regions a person opened.
 * @returns its lines.
 */
const styled = (entry: Entry, expanded: string[] = []): string[] =>
  layout(drawEntry(entry), 40, { expanded: new Set(expanded) }).lines.map(line => line.trimEnd())

/**
 * What an entry and any views of its key draw at width 80, styling and all, each line as it was drawn.
 * @param entry - the entry.
 * @param views - authors' views, as `drawEntry` takes them.
 * @returns its lines.
 */
const drawnWide = (entry: Entry, views: Views = new Map()): string[] =>
  layout(drawEntry(entry, views), 80, { expanded: new Set() }).lines.map(line => line.trimEnd())

test('the prompt\'s mark is the theme\'s accent, what the person wrote plain', () => {
  const entry: Entry = { kind: 'prompt', fact: { kind: 'prompt', seq: 2, time: 10, blocks: [{ kind: 'text', text: 'fix the build' }] } }
  assert.deepEqual(styled(entry), ['\x1b[36m›\x1b[39m fix the build'])
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
  assert.deepEqual(lines(answer, ['reasoning-0']), ['∴ thinking', 'the build fails in tsc', 'The build', '(interrupted)'])
})

test('an answer\'s text is drawn as the markdown document it is, in the theme\'s styles', () => {
  const entry: Entry = {
    kind: 'answer',
    fact: { ...answer.fact, interrupted: false, blocks: [{ kind: 'text', text: 'Run `pnpm test`, then **ship** it.' }] },
  }
  const drawn = layout(drawEntry(entry), 60, { expanded: new Set() }).lines.map(line => line.trimEnd())
  assert.deepEqual(drawn, ['Run \x1b[33mpnpm test\x1b[39m, then \x1b[1mship\x1b[22m it.'])
})

test('an answer draws no line for a call it made: the call is its tool entry\'s to draw', () => {
  const entry: Entry = {
    kind: 'answer',
    fact: {
      ...answer.fact, interrupted: false,
      blocks: [{ kind: 'text', text: 'Let me look.' }, { kind: 'unread', type: 'tool-call' }, { kind: 'text', text: 'Then I will fix it.' }],
    },
  }
  assert.deepEqual(lines(entry), ['Let me look.', 'Then I will fix it.'])
})

test('the reasoning\'s label is muted, the reasoning under it dim, and an interruption dim', () => {
  const drawn = layout(drawEntry(answer), 40, { expanded: new Set(['reasoning-0']) }).lines.map(line => line.trimEnd())
  assert.equal(drawn[0], '\x1b[90m∴ thinking\x1b[39m')
  assert.equal(drawn[1], '\x1b[2mthe build fails in tsc\x1b[22m')
  assert.equal(drawn[3], '\x1b[2m(interrupted)\x1b[22m')
})

const call = callFact(9, 21, 'c1', 'bash', '{"command":"pnpm build"}')

test('a tool still running says so', () => {
  assert.deepEqual(lines({ kind: 'tool', call }), ['● bash {"command":"pnpm build"}', '  running…'])
})

test('a call its turn left without a result says so, and why', () => {
  const left: Entry = { kind: 'tool', call, left: 'aborted' }
  assert.deepEqual(lines(left), ['● bash {"command":"pnpm build"}', '  the turn ended without it: aborted'])
  assert.equal(styled(left)[1], '\x1b[90m  the turn ended without it: aborted\x1b[39m')
  assert.equal(styled(left)[0], '\x1b[90m●\x1b[39m bash {"command":"pnpm build"}')
})

test('a tool\'s glyph says how the call stands: muted while it runs, success once it returned, error when it failed', () => {
  const ok = { kind: 'result', seq: 11, time: 40, turn: 1, step: 1, callId: 'c1', failed: false, blocks: [{ kind: 'text', text: 'ok' }], meta: undefined } as const
  const failed = { ...ok, failed: true, failure: { name: 'ExitError', code: 'exit', reason: 'the command exited 2' } } as const
  assert.equal(styled({ kind: 'tool', call })[0], '\x1b[90m●\x1b[39m bash {"command":"pnpm build"}')
  assert.equal(styled({ kind: 'tool', call, result: ok })[0], '\x1b[32m●\x1b[39m bash {"command":"pnpm build"}')
  assert.equal(styled({ kind: 'tool', call, result: failed })[0], '\x1b[31m✗\x1b[39m bash {"command":"pnpm build"}')
})

test('running is muted, and why a tool failed is error', () => {
  const failed = { kind: 'result', seq: 11, time: 40, turn: 1, step: 1, callId: 'c1', failed: true, failure: { name: 'ExitError', code: 'exit', reason: 'the command exited 2' }, blocks: [], meta: undefined } as const
  assert.equal(styled({ kind: 'tool', call })[1], '\x1b[90m  running…\x1b[39m')
  assert.equal(styled({ kind: 'tool', call, result: failed })[1], '\x1b[31m  the command exited 2\x1b[39m')
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

/** A tool call with a result whose blocks are one text block, as an output a test reads. */
const toolWith = (output: string): Entry => {
  const result = { kind: 'result', seq: 11, time: 40, turn: 1, step: 1, callId: 'c1', failed: false, blocks: [{ kind: 'text', text: output }], meta: undefined } as const
  return { kind: 'tool', call, result }
}

/**
 * An entry's lines as they reach the terminal, styling and all: what a test reads back to say no line carries a control the theme did not put there.
 * @param entry - the entry.
 * @param focus - the region focused, if any.
 * @returns its lines, raw.
 */
const raw = (entry: Entry, focus?: string): string[] =>
  layout(drawEntry(entry), 40, focus === undefined ? { expanded: new Set() } : { expanded: new Set(), focus }).lines.map(line => line.trimEnd())

test('a tool\'s output that clears the screen is drawn as its text, and clears nothing', () => {
  assert.deepEqual(raw(toolWith('wiped\x1b[2Jclean'))[1], 'wipedclean')
})

test('a sequence that writes the clipboard or sets the title is dropped, its visible text kept', () => {
  assert.deepEqual(raw(toolWith('copied \x1b]52;c;aGVsbG8=\x07 by \x1b]0;owned\x1b\\ one'))[1], 'copied  by  one')
})

test('a colour in a tool\'s output is dropped, and the rows after it are drawn in the theme\'s tones', () => {
  const result = {
    kind: 'result', seq: 11, time: 40, turn: 1, step: 1, callId: 'c1', failed: true,
    failure: { name: 'ExitError', code: 'exit', reason: 'the command exited 2' }, blocks: [{ kind: 'text', text: '\x1b[31mred\x1b[39m and plain' }], meta: undefined,
  } as const
  assert.deepEqual(raw({ kind: 'tool', call, result }), ['\x1b[31m✗\x1b[39m bash {"command":"pnpm build"}', '\x1b[31m  the command exited 2\x1b[39m', 'red and plain'])
})

test('a bell, and any other control character, is drawn as a symbol a person can see', () => {
  assert.deepEqual(raw(toolWith('a\x07b\x7fc\x9bd\x00e'))[1], 'a␇b␡c�d␀e')
})

test('a line ending with a carriage return reads as a line ending, and one anywhere else is drawn ␍', () => {
  assert.deepEqual(raw(toolWith('done\r\nnext\ralso')).slice(1), ['done', 'next␍also'])
})

test('an answer\'s markdown carrying an escape is drawn without it, in the theme\'s styles', () => {
  const entry: Entry = {
    kind: 'answer',
    fact: {
      kind: 'answer', seq: 8, time: 20, turn: 1, step: 1, provider: 'deepseek', model: 'deepseek-v4', interrupted: false,
      blocks: [{ kind: 'text', text: 'See \x1b[2Jthis, **then** that.' }],
    },
  }
  assert.deepEqual(raw(entry), ['See this, \x1b[1mthen\x1b[22m that.'])
})

test('context the person did not type names who added it, folded away', () => {
  const entry: Entry = { kind: 'context', fact: { kind: 'context', seq: 0, time: 1, source: 'agent-instructions', blocks: [{ kind: 'text', text: 'AGENTS.md\nsays' }] } }
  assert.deepEqual(lines(entry), ['⋯ added by agent-instructions', '… 2 more lines'])
})

test('a title over folded content is muted, whoever wrote the content', () => {
  const context: Entry = { kind: 'context', fact: { kind: 'context', seq: 0, time: 1, source: 'agent-instructions', blocks: [{ kind: 'text', text: 'AGENTS.md' }] } }
  const result: Entry = { kind: 'result', fact: { kind: 'result', seq: 11, time: 40, turn: 1, step: 1, callId: 'c9', failed: false, blocks: [{ kind: 'text', text: 'ok' }], meta: undefined } }
  const authored: Entry = { kind: 'authored', fact: { kind: 'authored', seq: 3, time: 11, name: 'seeded', data: {} } }
  const unknown: Entry = { kind: 'unknown', fact: { kind: 'unknown', seq: 2, time: 900, type: 'goal/change', record: {} } }
  assert.equal(styled(context)[0], '\x1b[90m⋯ added by agent-instructions\x1b[39m')
  assert.equal(styled(result)[0], '\x1b[90m● result of call c9\x1b[39m')
  assert.equal(styled(authored)[0], '\x1b[90m? seeded\x1b[39m')
  assert.equal(styled(unknown)[0], '\x1b[90m? goal/change\x1b[39m')
})

test('whatever went wrong is drawn in error, under or after what it went wrong with', () => {
  const prompt: Entry = { kind: 'prompt', fact: { kind: 'prompt', seq: 2, time: 10, blocks: [{ kind: 'text', text: 'fix the build' }] } }
  const views = new Map<string, View[]>([['prompt', [() => { throw new Error('no blocks') }]]])
  const unknown: Entry = { kind: 'unknown', fact: { kind: 'unknown', seq: 2, time: 900, type: 'session/end-seed', record: {}, problem: 'binnacle.facts(session/end-seed) threw: no fork recorded' } }
  assert.equal(drawnWide(prompt, views)[1], '\x1b[31m✗ binnacle.view(prompt) threw: no blocks\x1b[39m')
  assert.equal(drawnWide(unknown)[1], '\x1b[31m✗ binnacle.facts(session/end-seed) threw: no fork recorded\x1b[39m')
})

test('a result with no call on screen names the call it answers', () => {
  const entry: Entry = { kind: 'result', fact: { kind: 'result', seq: 11, time: 40, turn: 1, step: 1, callId: 'c9', failed: false, blocks: [{ kind: 'text', text: 'ok' }], meta: undefined } }
  assert.deepEqual(lines(entry), ['● result of call c9', 'ok'])
})

test('a kind nothing draws is its type in one line, and expand shows the raw record', () => {
  const entry: Entry = { kind: 'unknown', fact: { kind: 'unknown', seq: 2, time: 900, type: 'goal/change', record: { type: 'goal/change', data: {} } } }
  assert.deepEqual(lines(entry), ['? goal/change', '… 4 more lines'])
  assert.deepEqual(lines(entry, ['record']), ['? goal/change', '{', '  "type": "goal/change",', '  "data": {}', '}'])
})

const prompt: Entry = { kind: 'prompt', fact: promptFact(2, 10, 'fix the build') }
const drawn = (entry: Entry, views: Views): string[] =>
  layout(drawEntry(entry, views), 80, { expanded: new Set() }).lines.map(line => stripTerminalSequences(line).trimEnd())

test('an author\'s view that throws is drawn over by the built-in one, which says whose view failed and why', () => {
  const views = new Map<string, View[]>([['prompt', [() => { throw new Error('no blocks') }]]])
  assert.deepEqual(drawn(prompt, views), ['› fix the build', '✗ binnacle.view(prompt) threw: no blocks'])
})

test('an authored fact named as a kind binnacle draws is drawn by the fallback, never by that kind\'s view', () => {
  const entry: Entry = { kind: 'authored', fact: { kind: 'authored', seq: 3, time: 11, name: 'tool', data: {} } }
  const views = new Map<string, View[]>([['tool', [() => ({ kind: 'text', text: 'a tool card' })]]])
  assert.deepEqual(drawn(entry, views), ['? tool', '✗ tool is a kind binnacle draws; the adapter must give its fact another name', '… 1 more line'])
})

test('an unknown fact carrying a problem says it under its type', () => {
  const entry: Entry = { kind: 'unknown', fact: { kind: 'unknown', seq: 2, time: 900, type: 'session/end-seed', record: {}, problem: 'binnacle.facts(session/end-seed) threw: no fork recorded' } }
  assert.deepEqual(drawn(entry, new Map()), ['? session/end-seed', '✗ binnacle.facts(session/end-seed) threw: no fork recorded', '… 1 more line'])
})

/** An array of one slot with nothing in it, as a careless view might return. */
const hole = <T>(): T[] => Object.assign<T[], { length: number }>([], { length: 1 })

test('an author\'s view that returns what binnacle cannot lay out is drawn over, saying what was wrong with it', () => {
  const nothing = new Map<string, View[]>([['prompt', [() => undefined as unknown as Node]]])
  assert.deepEqual(drawn(prompt, nothing), ['› fix the build', '✗ binnacle.view(prompt) returned no drawable node: it is undefined'])
  const unreadable = new Map<string, View[]>([['prompt', [() => ({ kind: 'stack', children: [{ kind: 'text', get text(): string { throw new Error('text unavailable') } }] })]]])
  assert.deepEqual(drawn(prompt, unreadable), ['› fix the build', '✗ binnacle.view(prompt) returned no drawable node: text unavailable'])
  const holed = new Map<string, View[]>([['prompt', [() => ({ kind: 'stack', children: hole<Node>() })]]])
  assert.deepEqual(drawn(prompt, holed), ['› fix the build', '✗ binnacle.view(prompt) returned no drawable node: it is undefined'])
  const unlabelled = new Map<string, View[]>([['prompt', [() => ({ kind: 'offer', id: 'o', affordances: hole(), child: { kind: 'blank' } })]]])
  assert.deepEqual(drawn(prompt, unlabelled), ['› fix the build', '✗ binnacle.view(prompt) returned no drawable node: undefined is no affordance'])
  const folded = new Map<string, View[]>([['prompt', [() => ({ kind: 'fold', id: 'f', rows: -1, child: { kind: 'blank' } })]]])
  assert.deepEqual(drawn(prompt, folded), ['› fix the build', '✗ binnacle.view(prompt) returned no drawable node: a fold\'s rows are -1'])
  const loud = new Map<string, View[]>([['prompt', [() => ({ kind: 'text', text: 'hi', tone: 'shouting' }) as unknown as Node]]])
  assert.deepEqual(drawn(prompt, loud), ['› fix the build', '✗ binnacle.view(prompt) returned no drawable node: shouting is no tone'])
  const titled = new Map<string, View[]>([['prompt', [() => ({ kind: 'card', title: 'two\nlines', child: { kind: 'blank' } })]]])
  assert.deepEqual(drawn(prompt, titled), ['› fix the build', '✗ binnacle.view(prompt) returned no drawable node: a card\'s title is one line'])
  const undocumented = new Map<string, View[]>([['prompt', [() => ({ kind: 'markdown' }) as unknown as Node]]])
  assert.deepEqual(drawn(prompt, undocumented), ['› fix the build', '✗ binnacle.view(prompt) returned no drawable node: a markdown block needs text'])
  const unspanned = new Map<string, View[]>([['prompt', [() => ({ kind: 'text', text: ['fix', 3] }) as unknown as Node]]])
  assert.deepEqual(drawn(prompt, unspanned), ['› fix the build', '✗ binnacle.view(prompt) returned no drawable node: 3 is no span'])
  const untone = new Map<string, View[]>([['prompt', [() => ({ kind: 'text', text: [{ text: 'fix' }] }) as unknown as Node]]])
  assert.deepEqual(drawn(prompt, untone), ['› fix the build', '✗ binnacle.view(prompt) returned no drawable node: undefined is no tone'])
  const untext = new Map<string, View[]>([['prompt', [() => ({ kind: 'text', text: [{ tone: 'error' }] }) as unknown as Node]]])
  assert.deepEqual(drawn(prompt, untext), ['› fix the build', '✗ binnacle.view(prompt) returned no drawable node: a span needs its text'])
})

test('an author\'s view may draw a line of spans, each drawn in its tone', () => {
  const views = new Map<string, View[]>([['prompt', [() => ({ kind: 'text', text: [{ text: '›', tone: 'accent' }, ' fix the build'] }) as unknown as Node]]])
  assert.deepEqual(drawnWide(prompt, views), ['\x1b[36m›\x1b[39m fix the build'])
})

/**
 * What an entry and any views of its key draw at a width, raw: styling and all, as the lines reach the terminal.
 * @param entry - the entry.
 * @param views - authors' views, as `drawEntry` takes them.
 * @param width - the columns it is drawn at.
 * @param focus - the region focused, if any.
 * @returns its lines, raw.
 */
const rawWith = (entry: Entry, views: Views, width: number, focus?: string): string[] =>
  layout(drawEntry(entry, views), width, focus === undefined ? { expanded: new Set() } : { expanded: new Set(), focus }).lines.map(line => line.trimEnd())

test('a span carrying a control sequence is drawn as its text, in its tone', () => {
  const views = new Map<string, View[]>([['prompt', [() => ({ kind: 'text', text: [{ text: 'wiped\x1b[2Jclean', tone: 'error' }, ' \x1b]0;owned\x07kept'] }) as unknown as Node]]])
  assert.deepEqual(rawWith(prompt, views, 40), ['\x1b[31mwipedclean\x1b[39m kept'])
})

test('an author\'s card title and affordance label carrying a control sequence are drawn as their text', () => {
  const views = new Map<string, View[]>([['prompt', [() => ({
    kind: 'offer',
    id: 'theirs',
    affordances: [{ kind: 'open', label: 'open \x1b]0;owned\x07wide' }],
    child: { kind: 'card', title: 'to\x1b[2Jdo', child: { kind: 'text', text: 'the body' } },
  }) as unknown as Node]]])
  assert.deepEqual(rawWith(prompt, views, 20, 'theirs'), [
    '\x1b[2m╭─ \x1b[22mtodo\x1b[2m ───────────╮\x1b[22m',
    '\x1b[2m│\x1b[22m the body         \x1b[2m│\x1b[22m',
    '\x1b[2m╰──────────────────╯\x1b[22m',
    '\x1b[36m▸ open wide\x1b[39m',
  ])
})

test('data with no JSON and no string form is still drawn, as what it is', () => {
  const cycle: Record<string, unknown> = Object.create(null)
  cycle.self = cycle
  const entry: Entry = { kind: 'authored', fact: { kind: 'authored', seq: 3, time: 11, name: 'seeded', data: cycle } }
  assert.deepEqual(layout(drawEntry(entry), 80, { expanded: new Set(['data']) }).lines.map(line => stripTerminalSequences(line).trimEnd()), ['? seeded', 'a value binnacle cannot show'])
})
