import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripTerminalSequences } from '@earendil-works/pi-tui'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import type { Entry, Transcript } from '../../src/models/transcript.ts'
import type { UiState } from '../../src/ui/state.ts'
import type { Node } from '../../src/ui/node.ts'
import { drawText } from '../support/draw.ts'
import { screens } from '../../src/views/screen.ts'
import type { View, Views } from '../../src/views/entries.ts'
import { prompt as promptFact, call as callFact, asked as askedFact, decided as decidedFact, run as runFact, done as doneFact, started as startedFact, summarized as summarizedFact, ended as endedFact } from '../support/facts.ts'

/** An entry alone in a turn of its own: what the screen draws it from. */
const alone = (entry: Entry): Transcript => ({ turns: [{ turn: null, entries: [entry] }] })

/**
 * An entry's lines on the screen, styling and all: drawn through the screen, the seam that gives each fold the theme's start for its kind and scopes its regions to the entry.
 * @param entry - the entry.
 * @param state - the UI state it is drawn in; the regions it names are scoped to the entry, as the screen scopes them.
 * @param views - authors' views, as the screen takes them.
 * @param width - the columns it is drawn at.
 * @returns its lines.
 */
const onScreen = (entry: Entry, state: UiState, views: Views, width: number): string[] =>
  [...screens()(alone(entry), state, width, views).lines]

/**
 * What an entry draws at a width, as a person reads it.
 * @param entry - the entry.
 * @param toggled - the regions a person opened, scoped to the entry as the screen scopes them.
 * @returns its lines.
 */
const lines = (entry: Entry, toggled: string[] = []): string[] =>
  onScreen(entry, { toggled: new Set(toggled) }, new Map(), 40).map(line => stripTerminalSequences(line).trimEnd())

/**
 * What an entry draws at a width, as the terminal reads it back: drawn by
 * `drawText` through the real screen, so a line past the width fails the test.
 * @param entry - the entry.
 * @param toggled - the regions a person opened, scoped to the entry as the screen scopes them.
 * @param views - authors' views, as `drawEntry` takes them.
 * @param width - the columns it is drawn at.
 * @returns its lines.
 */
const seen = (entry: Entry, toggled: string[] = [], views: Views = new Map(), width = 40): string[] =>
  drawText({ render: at => onScreen(entry, { toggled: new Set(toggled) }, views, at), invalidate: () => {} }, width)

/**
 * What an entry draws at a width, styling and all, each line as it was drawn.
 * @param entry - the entry.
 * @param toggled - the regions a person opened, scoped to the entry as the screen scopes them.
 * @returns its lines.
 */
const styled = (entry: Entry, toggled: string[] = []): string[] =>
  onScreen(entry, { toggled: new Set(toggled) }, new Map(), 40).map(line => line.trimEnd())

/**
 * What an entry and any views of its key draw at width 80, styling and all, each line as it was drawn.
 * @param entry - the entry.
 * @param views - authors' views, as `drawEntry` takes them.
 * @returns its lines.
 */
const drawnWide = (entry: Entry, views: Views = new Map()): string[] =>
  onScreen(entry, { toggled: new Set() }, views, 80).map(line => line.trimEnd())

test('a prompt heads its turn in a band: padded, and filled with the theme\'s background, its mark accent and what the person wrote plain within it', () => {
  const entry: Entry = { kind: 'prompt', fact: { kind: 'prompt', seq: 2, time: 10, blocks: [{ kind: 'text', text: 'fix the build' }] } }
  // As pi draws a person's message — a padded band of its own background, one column each side and one line above and below (`pi:packages/coding-agent/src/modes/interactive/components/user-message.ts#UserMessageComponent`) — and every line of the band is filled: 40 columns, one of padding, fifteen of content.
  assert.deepEqual(lines(entry), ['', ' › fix the build', ''])
  assert.deepEqual(styled(entry), [
    `\x1b[100m${' '.repeat(40)}\x1b[49m`,
    `\x1b[100m \x1b[36m›\x1b[39m fix the build${' '.repeat(24)}\x1b[49m`,
    `\x1b[100m${' '.repeat(40)}\x1b[49m`,
  ])
})

test('a prompt that steered a running turn is drawn in the band a prompt is, with the steer mark in place of the prompt\'s', () => {
  const entry: Entry = { kind: 'prompt', fact: { kind: 'prompt', seq: 9, time: 30, blocks: [{ kind: 'text', text: 'use pnpm' }] }, steer: true }
  assert.deepEqual(lines(entry), ['', ' ↳ use pnpm', ''])
  assert.equal(styled(entry)[1], `\x1b[100m \x1b[36m↳\x1b[39m use pnpm${' '.repeat(29)}\x1b[49m`)
})

const answer: Entry = {
  kind: 'answer',
  fact: {
    kind: 'answer', seq: 8, time: 20, turn: 1, step: 1, provider: 'deepseek', model: 'deepseek-v4', interrupted: true,
    blocks: [{ kind: 'reasoning', text: 'the build fails in tsc' }, { kind: 'text', text: 'The build' }],
  },
}

test('an answer shows its text, folds its reasoning to one line, and says when it was cut short', () => {
  assert.deepEqual(seen(answer), ['∴ thinking · 1 line', 'The build', '(interrupted)'])
})

test('expanding the reasoning shows it, the line saying it can be folded', () => {
  assert.deepEqual(seen(answer, ['8/reasoning-0']), ['∴ thinking · show less', 'the build fails in tsc', 'The build', '(interrupted)'])
})

test('an answer\'s text is drawn as the markdown document it is, in the theme\'s styles', () => {
  const entry: Entry = {
    kind: 'answer',
    fact: { ...answer.fact, interrupted: false, blocks: [{ kind: 'text', text: 'Run `pnpm test`, then **ship** it.' }] },
  }
  const drawn = onScreen(entry, { toggled: new Set() }, new Map(), 60).map(line => line.trimEnd())
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

test('a stream cut short keeps none of the calls it streamed, so an answer hiding its calls hides none left without a tool entry', () => {
  const stream = new BlockAssembler()
  stream.push({ type: 'text-delta', index: 0, text: 'Let me look.' })
  stream.push({ type: 'tool-call-delta', index: 1, id: 'c1' as never, name: 'bash', argumentsDelta: '{"command":"ls"}' })
  stream.push({ type: 'block-end', index: 1, block: { type: 'tool-call', id: 'c1' as never, name: 'bash', arguments: '{"command":"ls"}' } })
  assert.deepEqual(stream.interruptedBlocks().map(block => block.type), ['text'])
})

test('the reasoning\'s line is muted, marker and all, the reasoning under it dim, and an interruption dim', () => {
  const drawn = onScreen(answer, { toggled: new Set(['8/reasoning-0']) }, new Map(), 40).map(line => line.trimEnd())
  assert.equal(drawn[0], '\x1b[90m∴ thinking · show less\x1b[39m')
  assert.equal(drawn[1], '\x1b[2mthe build fails in tsc\x1b[22m')
  assert.equal(drawn[3], '\x1b[2m(interrupted)\x1b[22m')
})

const call = callFact(9, 21, 'c1', 'bash', '{"command":"pnpm build"}')

const command = runFact(9, 21, 'cmd-1a2b3c4d-1', 'compact', ' --keep 2')

/** The command, done as the outcome names. */
const doneAs = (outcome: 'success' | 'error', text: string): Entry =>
  ({ kind: 'command', run: command, done: doneFact(10, 23, 'cmd-1a2b3c4d-1', outcome, text) })

test('a command drawn as /name args, muted, with what it returned beneath: plain on success, in the error tone on failure', () => {
  assert.deepEqual(lines(doneAs('success', 'compacted: 12 messages folded to a summary')), ['/compact --keep 2', '  compacted: 12 messages folded to a', 'summary'])
  assert.deepEqual(lines(doneAs('error', 'no such skill')), ['/compact --keep 2', '  no such skill'])
  assert.equal(styled(doneAs('success', 'compacted'))[0], '\x1b[90m/compact --keep 2\x1b[39m')
  assert.equal(styled(doneAs('success', 'compacted'))[1], '  compacted')
  assert.equal(styled(doneAs('error', 'no such skill'))[1], '\x1b[31m  no such skill\x1b[39m')
})

test('a command still running says so, and a success that said nothing draws only its line', () => {
  assert.deepEqual(lines({ kind: 'command', run: command }), ['/compact --keep 2', '  running…'])
  assert.equal(styled({ kind: 'command', run: command })[1], '\x1b[90m  running…\x1b[39m')
  assert.deepEqual(lines({ kind: 'command', run: command, done: doneFact(10, 23, 'cmd-1a2b3c4d-1', 'success') }), ['/compact --keep 2'])
})

test('a tool still running says so, along the gutter of what the surface shows and did not write', () => {
  assert.deepEqual(lines({ kind: 'tool', call }), ['● bash {"command":"pnpm build"}', '│ running 0s'])
})

test('a call its turn left without a result says so, and why', () => {
  const left: Entry = { kind: 'tool', call, left: 'aborted' }
  assert.deepEqual(lines(left), ['● bash {"command":"pnpm build"}', '│ the turn ended without it: aborted'])
  assert.equal(styled(left)[1], '\x1b[2m│\x1b[22m \x1b[90mthe turn ended without it: aborted\x1b[39m')
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
  assert.equal(styled({ kind: 'tool', call })[1], '\x1b[2m│\x1b[22m \x1b[90mrunning 0s\x1b[39m')
  assert.equal(styled({ kind: 'tool', call, result: failed })[1], '\x1b[2m│\x1b[22m \x1b[31mthe command exited 2\x1b[39m')
})

test('a finished tool shows its output, folded to three rows', () => {
  const result = { kind: 'result', seq: 11, time: 40, turn: 1, step: 1, callId: 'c1', failed: false, blocks: [{ kind: 'text', text: 'a\nb\nc\nd\ne' }], meta: undefined } as const
  assert.deepEqual(lines({ kind: 'tool', call, result }), ['● bash {"command":"pnpm build"}', '│ a', '│ b', '│ c', '│ … 2 more lines'])
})

test('a failed tool is marked, with the reason dsh gave a person', () => {
  const result = {
    kind: 'result', seq: 11, time: 40, turn: 1, step: 1, callId: 'c1', failed: true,
    failure: { name: 'ExitError', code: 'exit', reason: 'the command exited 2' }, blocks: [{ kind: 'text', text: 'tsc: 1 error' }], meta: undefined,
  } as const
  assert.deepEqual(lines({ kind: 'tool', call, result }), ['✗ bash {"command":"pnpm build"}', '│ the command exited 2', '│ tsc: 1 error'])
})

const approval = askedFact(5, 22, 'a1', 'bash', 'writes outside the repo')

/** A compaction that landed, shadowing 42 items of about 18.3k tokens, its summary one paragraph. */
const compaction: Entry = {
  kind: 'compaction',
  start: startedFact(20, 100, 'cmp-1'),
  summary: summarizedFact(21, 110, 'cmp-1', 42, 18_300, 'The person asked to fix the build, and it did.'),
  end: endedFact(22, 120, 'cmp-1'),
}

/** The approval, decided as the outcome names. */
const decidedAs = (outcome: 'allowed-once' | 'rejected' | 'cancelled'): Entry =>
  ({ kind: 'approval', asked: approval, decided: decidedFact(6, 24, 'a1', outcome) })

test('an approval decided draws what was asked, why, and the decision in the tone of its outcome', () => {
  assert.deepEqual(lines(decidedAs('allowed-once')), ['⚑ bash asks: writes outside the repo', '  allowed once'])
  assert.deepEqual(lines(decidedAs('rejected')), ['⚑ bash asks: writes outside the repo', '  rejected'])
  assert.deepEqual(lines(decidedAs('cancelled')), ['⚑ bash asks: writes outside the repo', '  cancelled'])
  assert.equal(styled(decidedAs('allowed-once'))[0], '\x1b[33m⚑\x1b[39m bash asks: writes outside the repo')
  assert.equal(styled(decidedAs('allowed-once'))[1], '\x1b[32m  allowed once\x1b[39m')
  assert.equal(styled(decidedAs('rejected'))[1], '\x1b[31m  rejected\x1b[39m')
  assert.equal(styled(decidedAs('cancelled'))[1], '\x1b[90m  cancelled\x1b[39m')
})

test('an approval still waiting for its answer says so, and asks without a reason named', () => {
  assert.deepEqual(lines({ kind: 'approval', asked: approval }), ['⚑ bash asks: writes outside the repo', '  waiting…'])
  assert.deepEqual(lines({ kind: 'approval', asked: askedFact(7, 30, 'a2', 'bash') }), ['⚑ bash asks', '  waiting…'])
  assert.equal(styled({ kind: 'approval', asked: approval })[1], '\x1b[90m  waiting…\x1b[39m')
})

test('a landed compaction is one muted line: the mark, how many items it shadowed, and about how many tokens', () => {
  assert.deepEqual(seen(compaction, [], new Map(), 80), ['≡ context compacted · 42 items (~18.3k tokens) · 1 line'])
  const wide = onScreen(compaction, { toggled: new Set() }, new Map(), 80).map(line => line.trimEnd())
  assert.equal(wide[0], '\x1b[90m≡ context compacted · 42 items (~18.3k tokens) · 1 line\x1b[39m')
  // At a width where the line wraps, the fold's marker rides the line it folds under where it ends.
  assert.deepEqual(lines(compaction), ['≡ context compacted · 42 items (~18.3k', 'tokens) · 2 lines'])
})

test('opening a landed compaction shows the summary the model now sees, folded beneath the marker as markdown', () => {
  assert.deepEqual(seen(compaction, ['20/summary'], new Map(), 80), [
    '≡ context compacted · 42 items (~18.3k tokens) · show less',
    'The person asked to fix the build, and it did.',
  ])
})

test('a compaction still running says so', () => {
  const running: Entry = { kind: 'compaction', start: startedFact(20, 100, 'cmp-1') }
  assert.deepEqual(lines(running), ['≡ compacting context…'])
  assert.equal(styled(running)[0], '\x1b[90m≡ compacting context…\x1b[39m')
})

test('a compaction that failed says why, in error', () => {
  const failed: Entry = {
    kind: 'compaction',
    start: startedFact(20, 100, 'cmp-2'),
    end: endedFact(22, 120, 'cmp-2', 'summary: the provider refused the call'),
  }
  assert.deepEqual(lines(failed), ['≡ compaction failed', '  summary: the provider refused the call'])
  assert.equal(styled(failed)[0], '\x1b[90m≡ compaction failed\x1b[39m')
  assert.equal(styled(failed)[1], '\x1b[31m  summary: the provider refused the call\x1b[39m')
})

test('a summary or end whose compaction is not in its turn draws on its own, muted, naming the compaction', () => {
  const half: Entry = { kind: 'summary', fact: summarizedFact(3, 30, 'cmp-9', 3, 300, 'half a log') }
  assert.deepEqual(lines(half), ['≡ summary of compaction cmp-9', 'half a log'])
  const failed: Entry = { kind: 'end', fact: endedFact(4, 40, 'cmp-8', 'summary: the provider refused the call') }
  assert.deepEqual(lines(failed), ['≡ end of compaction cmp-8', '  summary: the provider refused the call'])
})

test('a decision whose ask is not in its turn draws on its own, muted, naming the approval it answered', () => {
  const orphan: Entry = { kind: 'decided', fact: decidedFact(9, 40, 'a9', 'rejected') }
  assert.deepEqual(lines(orphan), ['⚑ decision of approval a9: rejected'])
  assert.equal(styled(orphan)[0], '\x1b[90m⚑ decision of approval a9: rejected\x1b[39m')
})

test('a done whose run is not in its turn draws on its own, muted, naming the command it settled', () => {
  const orphan: Entry = { kind: 'done', fact: doneFact(9, 40, 'cmd-1a2b3c4d-9', 'error', 'no such skill') }
  assert.deepEqual(lines(orphan), ['done of command cmd-1a2b3c4d-9: error'])
  assert.equal(styled(orphan)[0], '\x1b[90mdone of command cmd-1a2b3c4d-9: error\x1b[39m')
})

/** A tool call with a result whose blocks are one text block, as an output a test reads. */
const toolWith = (output: string): Entry => {
  const result = { kind: 'result', seq: 11, time: 40, turn: 1, step: 1, callId: 'c1', failed: false, blocks: [{ kind: 'text', text: output }], meta: undefined } as const
  return { kind: 'tool', call, result }
}

/**
 * An entry's lines as they reach the terminal, styling and all: what a test reads back to say no line carries a control the theme did not put there.
 * @param entry - the entry.
 * @param focus - the region focused, if any, scoped to the entry as the screen scopes it.
 * @returns its lines, raw.
 */
const raw = (entry: Entry, focus?: string): string[] =>
  onScreen(entry, focus === undefined ? { toggled: new Set() } : { toggled: new Set(), focus }, new Map(), 40).map(line => line.trimEnd())

test('a tool\'s output that clears the screen is drawn as its text, and clears nothing', () => {
  assert.deepEqual(raw(toolWith('wiped\x1b[2Jclean'))[1], '\x1b[2m│\x1b[22m wipedclean')
})

test('a sequence that writes the clipboard or sets the title is dropped, its visible text kept', () => {
  assert.deepEqual(raw(toolWith('copied \x1b]52;c;aGVsbG8=\x07 by \x1b]0;owned\x1b\\ one'))[1], '\x1b[2m│\x1b[22m copied  by  one')
})

test('a colour in a tool\'s output is dropped, and the rows after it are drawn in the theme\'s tones', () => {
  const result = {
    kind: 'result', seq: 11, time: 40, turn: 1, step: 1, callId: 'c1', failed: true,
    failure: { name: 'ExitError', code: 'exit', reason: 'the command exited 2' }, blocks: [{ kind: 'text', text: '\x1b[31mred\x1b[39m and plain' }], meta: undefined,
  } as const
  assert.deepEqual(raw({ kind: 'tool', call, result }), ['\x1b[31m✗\x1b[39m bash {"command":"pnpm build"}', '\x1b[2m│\x1b[22m \x1b[31mthe command exited 2\x1b[39m', '\x1b[2m│\x1b[22m red and plain'])
})

test('a bell, and any other control character, is drawn as a symbol a person can see', () => {
  assert.deepEqual(raw(toolWith('a\x07b\x7fc\x9bd\x00e'))[1], '\x1b[2m│\x1b[22m a␇b␡c�d␀e')
})

test('a line ending with a carriage return reads as a line ending, and one anywhere else is drawn ␍', () => {
  assert.deepEqual(raw(toolWith('done\r\nnext\ralso')).slice(1), ['\x1b[2m│\x1b[22m done', '\x1b[2m│\x1b[22m next␍also'])
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

test('context the person did not type names who added it, one line saying what it holds', () => {
  const entry: Entry = { kind: 'context', fact: { kind: 'context', seq: 0, time: 1, source: 'agent-instructions', blocks: [{ kind: 'text', text: 'AGENTS.md\nsays' }] } }
  assert.deepEqual(seen(entry), ['⋯ added by agent-instructions · 2 lines'])
})

test('a fold\'s title line is muted, marker and all, whoever wrote the content', () => {
  const context: Entry = { kind: 'context', fact: { kind: 'context', seq: 0, time: 1, source: 'agent-instructions', blocks: [{ kind: 'text', text: 'AGENTS.md' }] } }
  const result: Entry = { kind: 'result', fact: { kind: 'result', seq: 11, time: 40, turn: 1, step: 1, callId: 'c9', failed: false, blocks: [{ kind: 'text', text: 'ok' }], meta: undefined } }
  const authored: Entry = { kind: 'authored', fact: { kind: 'authored', seq: 3, time: 11, name: 'seeded', data: {} } }
  const unknown: Entry = { kind: 'unknown', fact: { kind: 'unknown', seq: 2, time: 900, type: 'goal/change', record: {} } }
  assert.equal(styled(context)[0], '\x1b[90m⋯ added by agent-instructions · 1 line\x1b[39m')
  assert.equal(styled(result)[0], '\x1b[90m● result of call c9\x1b[39m')
  assert.equal(styled(authored)[0], '\x1b[90m? seeded · 1 line\x1b[39m')
  assert.equal(styled(unknown)[0], '\x1b[90m? goal/change · 1 line\x1b[39m')
})

test('a quiet entry draws no line', () => {
  const entry: Entry = { kind: 'quiet', fact: { kind: 'quiet', seq: 2, time: 900, type: 'session/title', record: { title: 'read readme' } } }
  assert.deepEqual(lines(entry), [])
})

test('an author\'s view registered for a quiet kind draws it again', () => {
  const entry: Entry = { kind: 'quiet', fact: { kind: 'quiet', seq: 2, time: 900, type: 'session/title', record: { title: 'read readme' } } }
  const views: Views = new Map([['session/title', [() => ({ kind: 'text', text: 'read readme' })]]])
  assert.deepEqual(drawn(entry, views), ['read readme'])
})

test('a view for a quiet kind that throws says so over the nothing it would otherwise draw', () => {
  const entry: Entry = { kind: 'quiet', fact: { kind: 'quiet', seq: 2, time: 900, type: 'session/title', record: { title: 'read readme' } } }
  const views: Views = new Map([['session/title', [() => { throw new Error('no title recorded') }]]])
  assert.deepEqual(drawn(entry, views), ['✗ binnacle.view(session/title) threw: no title recorded'])
})

test('whatever went wrong is drawn in error, under or after what it went wrong with', () => {
  const prompt: Entry = { kind: 'prompt', fact: { kind: 'prompt', seq: 2, time: 10, blocks: [{ kind: 'text', text: 'fix the build' }] } }
  const views = new Map<string, View[]>([['prompt', [() => { throw new Error('no blocks') }]]])
  const unknown: Entry = { kind: 'unknown', fact: { kind: 'unknown', seq: 2, time: 900, type: 'test/marker', record: {}, problem: 'binnacle.facts(test/marker) threw: no fork recorded' } }
  assert.equal(drawnWide(prompt, views)[3], '\x1b[31m✗ binnacle.view(prompt) threw: no blocks\x1b[39m')
  assert.equal(drawnWide(unknown)[1], '\x1b[31m✗ binnacle.facts(test/marker) threw: no fork recorded\x1b[39m')
})

test('a result with no call on screen names the call it answers', () => {
  const entry: Entry = { kind: 'result', fact: { kind: 'result', seq: 11, time: 40, turn: 1, step: 1, callId: 'c9', failed: false, blocks: [{ kind: 'text', text: 'ok' }], meta: undefined } }
  assert.deepEqual(lines(entry), ['● result of call c9', 'ok'])
})

test('an author\'s fold that names the line it folds under draws one line, its marker riding it', () => {
  const views = new Map<string, View[]>([['prompt', [() => ({ kind: 'fold', id: 'mine', rows: 0, title: [{ text: '›', tone: 'accent' }, ' asked'], tone: 'muted', child: { kind: 'text', text: 'one\ntwo' } }) as unknown as Node]]])
  assert.deepEqual(seen(prompt, [], views, 80), ['› asked · 2 lines'])
  assert.deepEqual(drawnWide(prompt, views), ['\x1b[36m›\x1b[39m\x1b[90m asked · 2 lines\x1b[39m'])
})

test('a fold\'s title carrying a control sequence is drawn as its text, in its tone', () => {
  const views = new Map<string, View[]>([['prompt', [() => ({ kind: 'fold', id: 'mine', rows: 0, title: [{ text: 'wiped\x1b[2Jclean', tone: 'error' }], child: { kind: 'text', text: 'one' } }) as unknown as Node]]])
  assert.deepEqual(seen(prompt, [], views, 80), ['wipedclean · 1 line'])
  assert.deepEqual(drawnWide(prompt, views), ['\x1b[31mwipedclean\x1b[39m · 1 line'])
})

test('a result with no call keeps its title a line of its own above the fold, outside it', () => {
  const entry: Entry = { kind: 'result', fact: { kind: 'result', seq: 11, time: 40, turn: 1, step: 1, callId: 'c9', failed: false, blocks: [{ kind: 'text', text: 'a\nb\nc\nd\ne' }], meta: undefined } }
  assert.deepEqual(seen(entry), ['● result of call c9', 'a', 'b', 'c', '… 2 more lines'])
  assert.deepEqual(screens()(alone(entry), { toggled: new Set() }, 40).regions.map(({ region, top, height }) => [region.id, top, height]), [['11/output', 1, 4]])
})

test('a kind nothing draws is its type in one line, what it holds beside it, and expand shows the raw record', () => {
  const entry: Entry = { kind: 'unknown', fact: { kind: 'unknown', seq: 2, time: 900, type: 'goal/change', record: { type: 'goal/change', data: {} } } }
  assert.deepEqual(seen(entry), ['? goal/change · 4 lines'])
  assert.deepEqual(seen(entry, ['2/record']), ['? goal/change · show less', '{', '  "type": "goal/change",', '  "data": {}', '}'])
})

const prompt: Entry = { kind: 'prompt', fact: promptFact(2, 10, 'fix the build') }
const drawn = (entry: Entry, views: Views): string[] =>
  onScreen(entry, { toggled: new Set() }, views, 80).map(line => stripTerminalSequences(line).trimEnd())

test('an author\'s view that throws is drawn over by the built-in one, which says whose view failed and why', () => {
  const views = new Map<string, View[]>([['prompt', [() => { throw new Error('no blocks') }]]])
  assert.deepEqual(drawn(prompt, views), ['', ' › fix the build', '', '✗ binnacle.view(prompt) threw: no blocks'])
})

test('an authored fact named as a kind binnacle draws is drawn by the fallback, never by that kind\'s view', () => {
  const entry: Entry = { kind: 'authored', fact: { kind: 'authored', seq: 3, time: 11, name: 'tool', data: {} } }
  const views = new Map<string, View[]>([['tool', [() => ({ kind: 'text', text: 'a tool card' })]]])
  // Its name is its key, so the theme\'s start for `tool` reaches its fold; the refusal stops views, not fold starts.
  assert.deepEqual(seen(entry, [], views, 80), ['? tool', '{}', '✗ tool is a kind binnacle draws; the adapter must give its fact another name'])
})

test('an unknown fact carrying a problem says it under its one line', () => {
  const entry: Entry = { kind: 'unknown', fact: { kind: 'unknown', seq: 2, time: 900, type: 'test/marker', record: {}, problem: 'binnacle.facts(test/marker) threw: no fork recorded' } }
  assert.deepEqual(seen(entry, [], new Map(), 80), ['? test/marker · 1 line', '✗ binnacle.facts(test/marker) threw: no fork recorded'])
})

test('an author\'s view may show what it did not write, its title read as spans and what it holds beneath it', () => {
  const shown = new Map<string, View[]>([['prompt', [() => ({ kind: 'show', title: ['notes.md'], child: { kind: 'text', text: 'first line' } })]]])
  assert.deepEqual(drawn(prompt, shown), ['notes.md', '│ first line'])
  const untitled = new Map<string, View[]>([['prompt', [() => ({ kind: 'show', title: 'notes.md', child: { kind: 'blank' } }) as unknown as Node]]])
  assert.deepEqual(drawn(prompt, untitled).at(-1), '✗ binnacle.view(prompt) returned no drawable node: a show\'s title is notes.md')
})

/** An array of one slot with nothing in it, as a careless view might return. */
const hole = <T>(): T[] => Object.assign<T[], { length: number }>([], { length: 1 })

test('an author\'s view that returns what binnacle cannot lay out is drawn over, saying what was wrong with it', () => {
  const band = ['', ' › fix the build', '']
  const nothing = new Map<string, View[]>([['prompt', [() => undefined as unknown as Node]]])
  assert.deepEqual(drawn(prompt, nothing), [...band, '✗ binnacle.view(prompt) returned no drawable node: it is undefined'])
  const unreadable = new Map<string, View[]>([['prompt', [() => ({ kind: 'stack', children: [{ kind: 'text', get text(): string { throw new Error('text unavailable') } }] })]]])
  assert.deepEqual(drawn(prompt, unreadable), [...band, '✗ binnacle.view(prompt) returned no drawable node: text unavailable'])
  const holed = new Map<string, View[]>([['prompt', [() => ({ kind: 'stack', children: hole<Node>() })]]])
  assert.deepEqual(drawn(prompt, holed), [...band, '✗ binnacle.view(prompt) returned no drawable node: it is undefined'])
  const unlabelled = new Map<string, View[]>([['prompt', [() => ({ kind: 'offer', id: 'o', affordances: hole(), child: { kind: 'blank' } })]]])
  assert.deepEqual(drawn(prompt, unlabelled), [...band, '✗ binnacle.view(prompt) returned no drawable node: undefined is no affordance'])
  const folded = new Map<string, View[]>([['prompt', [() => ({ kind: 'fold', id: 'f', rows: -1, child: { kind: 'blank' } })]]])
  assert.deepEqual(drawn(prompt, folded), [...band, '✗ binnacle.view(prompt) returned no drawable node: a fold\'s rows are -1'])
  const untitled = new Map<string, View[]>([['prompt', [() => ({ kind: 'fold', id: 'f', rows: 0, title: 'one line', child: { kind: 'blank' } }) as unknown as Node]]])
  assert.deepEqual(drawn(prompt, untitled), [...band, '✗ binnacle.view(prompt) returned no drawable node: a fold\'s title is one line'])
  const loud = new Map<string, View[]>([['prompt', [() => ({ kind: 'text', text: 'hi', tone: 'shouting' }) as unknown as Node]]])
  assert.deepEqual(drawn(prompt, loud), [...band, '✗ binnacle.view(prompt) returned no drawable node: shouting is no tone'])
  const titled = new Map<string, View[]>([['prompt', [() => ({ kind: 'ask', title: 'two\nlines', child: { kind: 'blank' } })]]])
  assert.deepEqual(drawn(prompt, titled), [...band, '✗ binnacle.view(prompt) returned no drawable node: an ask\'s title is one line'])
  const undocumented = new Map<string, View[]>([['prompt', [() => ({ kind: 'markdown' }) as unknown as Node]]])
  assert.deepEqual(drawn(prompt, undocumented), [...band, '✗ binnacle.view(prompt) returned no drawable node: a markdown block needs text'])
  const unspanned = new Map<string, View[]>([['prompt', [() => ({ kind: 'text', text: ['fix', 3] }) as unknown as Node]]])
  assert.deepEqual(drawn(prompt, unspanned), [...band, '✗ binnacle.view(prompt) returned no drawable node: 3 is no span'])
  const untone = new Map<string, View[]>([['prompt', [() => ({ kind: 'text', text: [{ text: 'fix' }] }) as unknown as Node]]])
  assert.deepEqual(drawn(prompt, untone), [...band, '✗ binnacle.view(prompt) returned no drawable node: undefined is no tone'])
  const untext = new Map<string, View[]>([['prompt', [() => ({ kind: 'text', text: [{ tone: 'error' }] }) as unknown as Node]]])
  assert.deepEqual(drawn(prompt, untext), [...band, '✗ binnacle.view(prompt) returned no drawable node: a span needs its text'])
})

test('an author\'s view may draw a line of spans, each drawn in its tone', () => {
  const views = new Map<string, View[]>([['prompt', [() => ({ kind: 'text', text: [{ text: '›', tone: 'accent' }, ' fix the build'] }) as unknown as Node]]])
  assert.deepEqual(drawnWide(prompt, views), ['\x1b[36m›\x1b[39m fix the build'])
})

test('an author\'s band is filled with the background it names, and one naming a background the theme has not is drawn by the view beneath, saying why', () => {
  const banded = new Map<string, View[]>([['prompt', [() => ({ kind: 'band', background: 'prompt', child: { kind: 'text', text: [{ mark: 'prompt' } as const, ' asked again'] } })]]])
  // 80 columns, one of padding, thirteen of content
  assert.deepEqual(drawnWide(prompt, banded), [`\x1b[100m${' '.repeat(80)}\x1b[49m`, `\x1b[100m \x1b[36m›\x1b[39m asked again${' '.repeat(66)}\x1b[49m`, `\x1b[100m${' '.repeat(80)}\x1b[49m`])
  const unbacked = new Map<string, View[]>([['prompt', [() => ({ kind: 'band', background: 'shouting', child: { kind: 'text', text: 'asked again' } }) as unknown as Node]]])
  assert.deepEqual(drawn(prompt, unbacked), ['', ' › fix the build', '', '✗ binnacle.view(prompt) returned no drawable node: shouting is no background'])
})

/**
 * What an entry and any views of its key draw at a width, raw: styling and all, as the lines reach the terminal.
 * @param entry - the entry.
 * @param views - authors' views, as `drawEntry` takes them.
 * @param width - the columns it is drawn at.
 * @param focus - the region focused, if any, scoped to the entry as the screen scopes it.
 * @returns its lines, raw.
 */
const rawWith = (entry: Entry, views: Views, width: number, focus?: string): string[] =>
  onScreen(entry, focus === undefined ? { toggled: new Set() } : { toggled: new Set(), focus }, views, width).map(line => line.trimEnd())

test('a span carrying a control sequence is drawn as its text, in its tone', () => {
  const views = new Map<string, View[]>([['prompt', [() => ({ kind: 'text', text: [{ text: 'wiped\x1b[2Jclean', tone: 'error' }, ' \x1b]0;owned\x07kept'] }) as unknown as Node]]])
  assert.deepEqual(rawWith(prompt, views, 40), ['\x1b[31mwipedclean\x1b[39m kept'])
})

test('an author\'s card title and affordance label carrying a control sequence are drawn as their text', () => {
  const views = new Map<string, View[]>([['prompt', [() => ({
    kind: 'offer',
    id: 'theirs',
    affordances: [{ kind: 'open', label: 'open \x1b]0;owned\x07wide' }],
    child: { kind: 'ask', title: 'to\x1b[2Jdo', child: { kind: 'text', text: 'the body' } },
  }) as unknown as Node]]])
  assert.deepEqual(rawWith(prompt, views, 20, '2/theirs'), [
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
  assert.deepEqual(seen(entry, ['3/data'], new Map(), 80), ['? seeded · show less', 'a value binnacle cannot show'])
})
