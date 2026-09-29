/**
 * The Trajectory: every event of a session, on a screen of its own.
 *
 * @module binnacle/test/trajectory
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { stripTerminalSequences } from '@earendil-works/pi-tui'
import type { Surface } from '../../../src/api.ts'
import type { Fact } from '../../../src/facts/adapt.ts'
import { adapt } from '../../../src/facts/adapt.ts'
import { RegistrationService } from '../../../src/host/registrations.ts'
import { ScreenPane } from '../../../src/panes/screen.ts'
import { trajectory } from '../../../src/plugins/trajectory/index.ts'
import { drawText } from '../../../src/ui/draw.ts'
import { drawnAsTranscript } from '../../../src/views/screen.ts'
import { layout } from '../../../src/ui/layout.ts'
import { componentOf } from '../../support/drawn.ts'
import { call as callFact, prompt as promptFact, returned as returnedFact, asked as askedFact, decided as decidedFact, run as runFact, done as doneFact, started as startedFact, summarized as summarizedFact, ended as endedFact } from '../../support/facts.ts'
import { logged } from '../../support/log.ts'


/** Where the session stands, as the host hands it to a screen: the Trajectory draws from the facts alone. */
const stands: Surface = { model: 'deepseek/deepseek-v4', running: false }
/**
 * The Trajectory applied in a Cordis context, with the `binnacle` service,
 * drawing the facts given.
 * @param facts - the session's facts, in log order.
 * @returns its registration, the pane it draws through, its lines at width 60, and the plugin's fiber.
 */
async function trajectoryOver(facts: readonly Fact[]) {
  const ctx = new Context()
  const registrations = new RegistrationService(ctx)
  const fiber = await ctx.plugin(trajectory)
  const placed = registrations.screens.get('trajectory')
  const pane = new ScreenPane(() => facts)
  if (placed !== undefined) pane.place('trajectory', { draw: drawn => placed.draw(drawn, stands, drawnAsTranscript) })
  const lines = () => drawText(pane, 60)
  return { fiber, placed, pane, lines }
}

/** One event of a kind dsh knows but binnacle reads as quiet, as dsh logs it. */
const quiet = (seq: number, type: string, data: unknown): Fact =>
  ({ kind: 'quiet', seq, time: seq, type, record: { type, seq, time: seq, data } })

/** A session: machinery, then one turn that asks, answers, calls and ends. */
function session(): Fact[] {
  return [
    quiet(0, 'permission/preset', { preset: 'workspace-write' }),
    { kind: 'turn', seq: 1, time: 1, turn: 1, phase: 'start' },
    { kind: 'step', seq: 2, time: 2, turn: 1, step: 1, phase: 'start' },
    promptFact(3, 3, 'fix the build'),
    { kind: 'answer', seq: 4, time: 4, turn: 1, step: 1, provider: 'deepseek-official', model: 'deepseek-flash', interrupted: false, blocks: [{ kind: 'text', text: 'on it' }] },
    callFact(5, 5, 'c1', 'read', '{"path":"src/api.ts"}'),
    returnedFact(6, 6, 'c1', 'the file'),
    { kind: 'step', seq: 7, time: 7, turn: 1, step: 1, phase: 'end' },
    { kind: 'turn', seq: 8, time: 8, turn: 1, phase: 'end', ending: 'completed' },
    { kind: 'unknown', seq: 9, time: 9, type: 'test/marker', record: { type: 'test/marker', seq: 9, time: 9, data: {} } },
  ]
}

/** Every line as its title reads, the count each line folds left off. */
const titles = (lines: readonly string[]): readonly string[] => lines.map(line => line.replace(/ · \d+ lines?$/, ''))

/** A second turn, asking again. */
function secondTurn(): Fact[] {
  return [
    { kind: 'turn', seq: 10, time: 10, turn: 2, phase: 'start' },
    promptFact(11, 11, 'again'),
    { kind: 'turn', seq: 12, time: 12, turn: 2, phase: 'end', ending: 'interrupted' },
  ]
}

test('a second turn opens under its own heading, a blank line between, and the kinds the fixture holds none of say their words', async () => {
  const facts: Fact[] = [
    { kind: 'context', seq: 20, time: 20, source: 'goal', blocks: [{ kind: 'text', text: 'ship it' }] },
    { kind: 'authored', seq: 21, time: 21, name: 'seeded', data: { from: 'fork' } },
    { kind: 'answer', seq: 22, time: 22, turn: 2, step: 1, provider: 'p', model: 'm', interrupted: true, blocks: [{ kind: 'text', text: 'half said' }] },
    { kind: 'result', seq: 23, time: 23, turn: 2, step: 1, callId: 'c9', failed: true, blocks: [], meta: undefined, failure: { name: 'ENOENT', code: 'not-found' } },
    startedFact(24, 24, 'cmp-1'),
    summarizedFact(25, 25, 'cmp-1', 42, 18_300, 'The person asked to fix the build, and it did.'),
    endedFact(26, 26, 'cmp-1'),
    ...secondTurn(),
  ]
  const { lines } = await trajectoryOver(facts)
  assert.deepEqual(titles(lines()), [
    'before turn 1',
    '20 ⋯ added by goal',
    '21 ? seeded',
    '22 answer by p/m · interrupted',
    '23 ✗ result of c9',
    '24 ≡ compaction begins',
    '25 ≡ summary of 42 items',
    '26 ≡ compaction ends',
    '',
    'turn 2',
    '10 turn 2 begins',
    '11 › again',
    '12 turn 2 ended · interrupted',
  ])
})

test('disposing the plugin takes its screen back', async () => {
  const ctx = new Context()
  const registrations = new RegistrationService(ctx)
  const fiber = await ctx.plugin(trajectory)
  assert.equal(registrations.screens.has('trajectory'), true)
  await fiber.dispose()
  assert.equal(registrations.screens.has('trajectory'), false)
})

test('over a real session\'s log, every event is one line, quiet ones included, grouped by turn with the machinery before the first', async () => {
  const { lines } = await trajectoryOver(logged().map(event => adapt(event)))
  assert.deepEqual(titles(lines()), [
    'before turn 1',
    '0 permission/preset',
    '1 sandbox/mode',
    '2 approval/policy',
    '3 agent/inbox/spliced',
    '',
    'turn 1',
    '4 turn 1 begins',
    '5 agent/inbox/spliced',
    '6 step 1 begins',
    '7 system/message',
    '8 › read readme',
    '9 user/message',
    '10 user/message',
    '11 user/message',
    '12 request/header',
    '13 request/context',
    '14 session/title',
    '15 session/title-llm-request',
    '16 session-log-deepseek/delivery-accepted',
    '17 session-log-deepseek/delivery-accepted',
    '18 session/title',
    '19 answer by deepseek-official/deepseek-flash',
    '20 call glob',
    '21 ● result of glob',
    '22 step 1 ends',
    '23 step 2 begins',
    '24 session-log-deepseek/delivery-accepted',
    '25 answer by deepseek-official/deepseek-flash',
    '26 call bash',
    '27 ● result of bash',
    '28 step 2 ends',
    '29 step 3 begins',
    '30 session-log-deepseek/delivery-accepted',
    '31 answer by deepseek-official/deepseek-flash',
    '32 call read',
    '33 ● result of read',
    '34 step 3 ends',
    '35 step 4 begins',
    '36 session-log-deepseek/delivery-accepted',
    '37 answer by deepseek-official/deepseek-flash',
    '38 step 4 ends',
    '39 turn 1 ended · completed',
  ])
})

test('each event is one line, its record folded on it: the line says how much it holds, and opens to its record under it', async () => {
  const facts = session()
  const { placed } = await trajectoryOver(facts)
  assert.ok(placed !== undefined)
  const closed = drawText(componentOf(placed.draw(facts, stands, drawnAsTranscript), { toggled: new Set() }), 60)
  assert.deepEqual([closed[1], closed[4], closed[11]], ['0 permission/preset · 8 lines', '1 turn 1 begins · 7 lines', '8 turn 1 ended · completed · 8 lines'])
  assert.equal(closed[6], '3 › fix the build · 11 lines')
  const opened = drawText(componentOf(placed.draw(facts, stands, drawnAsTranscript), { toggled: new Set(['3']) }), 60)
  assert.deepEqual(opened.slice(6, 10), ['3 › fix the build · show less', '{', '  "kind": "prompt",', '  "seq": 3,'])
})

test('each line folds its record: a read fact\'s opens to the fact binnacle read, a quiet one to the event as logged, as the fallback shows it', async () => {
  const facts = session()
  const { placed } = await trajectoryOver(facts)
  assert.ok(placed !== undefined)
  const opened = (id: string): readonly string[] => {
    const lines = layout(placed.draw(facts, stands, drawnAsTranscript), 60, { toggled: new Set([id]) }).lines.map(line => stripTerminalSequences(line).trimEnd())
    return lines.slice(lines.findIndex(line => line.startsWith(`${id} `)))
  }
  assert.deepEqual(opened('3').slice(0, 12), [
    '3 › fix the build · show less',
    '{',
    '  "kind": "prompt",',
    '  "seq": 3,',
    '  "time": 3,',
    '  "blocks": [',
    '    {',
    '      "kind": "text",',
    '      "text": "fix the build"',
    '    }',
    '  ]',
    '}',
  ])
  assert.deepEqual(opened('0').slice(0, 9), [
    '0 permission/preset · show less',
    '{',
    '  "type": "permission/preset",',
    '  "seq": 0,',
    '  "time": 0,',
    '  "data": {',
    '    "preset": "workspace-write"',
    '  }',
    '}',
  ])
})

test('an approval asked and its decision are each one line, naming the tool and the outcome', async () => {
  const facts: Fact[] = [
    { kind: 'turn', seq: 1, time: 1, turn: 1, phase: 'start' },
    askedFact(2, 2, 'a1', 'bash', 'writes outside the workspace'),
    decidedFact(3, 3, 'a1', 'allowed-once'),
    { kind: 'turn', seq: 4, time: 4, turn: 1, phase: 'end', ending: 'completed' },
  ]
  const { lines } = await trajectoryOver(facts)
  assert.deepEqual(titles(lines()), [
    'turn 1',
    '1 turn 1 begins',
    '2 ⚑ bash asks',
    '3 ⚑ decision allowed-once',
    '4 turn 1 ended · completed',
  ])
})

test('a command\'s run and its done are each one line, the run the line as the person typed it, the done the outcome in dsh\'s words', async () => {
  const facts: Fact[] = [
    { kind: 'turn', seq: 1, time: 1, turn: 1, phase: 'start' },
    runFact(2, 2, 'cmd-1a2b3c4d-1', 'compact', ' --keep 2'),
    doneFact(3, 3, 'cmd-1a2b3c4d-1', 'success', 'compacted'),
    runFact(4, 4, 'cmd-1a2b3c4d-2', 'skill'),
    doneFact(5, 5, 'cmd-1a2b3c4d-2', 'error', 'no such skill'),
    { kind: 'turn', seq: 6, time: 6, turn: 1, phase: 'end', ending: 'completed' },
  ]
  const { lines } = await trajectoryOver(facts)
  assert.deepEqual(titles(lines()), [
    'turn 1',
    '1 turn 1 begins',
    '2 /compact --keep 2',
    '3 done success',
    '4 /skill',
    '5 done error',
    '6 turn 1 ended · completed',
  ])
})

test('the plugin places the trajectory, opened with ctrl+o, and every event draws one line: its kind and a few words, a quiet one included', async () => {
  const { placed, lines } = await trajectoryOver(session())
  assert.equal(placed?.key, 'ctrl+o')
  assert.deepEqual(titles(lines()), [
    'before turn 1',
    '0 permission/preset',
    '',
    'turn 1',
    '1 turn 1 begins',
    '2 step 1 begins',
    '3 › fix the build',
    '4 answer by deepseek-official/deepseek-flash',
    '5 call read',
    '6 ● result of read',
    '7 step 1 ends',
    '8 turn 1 ended · completed',
    '9 ? test/marker',
  ])
})
