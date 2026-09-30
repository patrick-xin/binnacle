import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Fact } from '../../src/facts/adapt.ts'
import { answering, settled, transcript } from '../../src/models/transcript.ts'
import { prompt as promptFact, call as callFact, returned as returnedFact, asked as askedFact, decided as decidedFact, run as runFact, done as doneFact, started as startedFact, summarized as summarizedFact, ended as endedFact } from '../support/facts.ts'

const prompt = promptFact(2, 10, 'fix the build')
const answer: Fact = { kind: 'answer', seq: 4, time: 20, turn: 1, step: 1, provider: 'deepseek', model: 'deepseek-v4', interrupted: false, blocks: [{ kind: 'text', text: 'Done.' }] }

test('a turn holds what happened in it, in log order, and why it ended; steps are not entries', () => {
  const facts: Fact[] = [
    { kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' },
    prompt,
    { kind: 'step', seq: 3, time: 15, turn: 1, step: 1, phase: 'start' },
    answer,
    { kind: 'step', seq: 5, time: 25, turn: 1, step: 1, phase: 'end' },
    { kind: 'turn', seq: 6, time: 30, turn: 1, phase: 'end', ending: 'completed' },
  ]
  assert.deepEqual(transcript(facts), {
    turns: [{ turn: 1, entries: [{ kind: 'prompt', fact: prompt }, { kind: 'answer', fact: answer }], ending: 'completed' }],
  })
})

const call = callFact(5, 21, 'c1', 'bash', '{"command":"pnpm build"}')
const result = returnedFact(7, 40, 'c1', 'ok')

test('a call and its result are one tool entry, where the call was asked', () => {
  const facts: Fact[] = [
    { kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' },
    prompt,
    answer,
    call,
    { kind: 'step', seq: 6, time: 30, turn: 1, step: 1, phase: 'end' },
    result,
  ]
  assert.deepEqual(transcript(facts).turns[0]?.entries, [
    { kind: 'prompt', fact: prompt },
    { kind: 'answer', fact: answer },
    { kind: 'tool', call, result },
  ])
})

test('an approval asked and its decision are one entry, where it was asked, as a call and its result are', () => {
  const facts: Fact[] = [
    { kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' },
    prompt,
    askedFact(5, 22, 'a1', 'bash', 'writes outside the workspace'),
    decidedFact(6, 24, 'a1', 'allowed-once'),
  ]
  assert.deepEqual(transcript(facts).turns[0]?.entries, [
    { kind: 'prompt', fact: prompt },
    { kind: 'approval', asked: askedFact(5, 22, 'a1', 'bash', 'writes outside the workspace'), decided: decidedFact(6, 24, 'a1', 'allowed-once') },
  ])
})

test('a command run and its done are one entry, where it ran, as a call and its result are', () => {
  const facts: Fact[] = [
    { kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' },
    prompt,
    runFact(5, 22, 'cmd-1a2b3c4d-1', 'compact', ' --keep 2'),
    doneFact(6, 24, 'cmd-1a2b3c4d-1', 'success', 'compacted: 12 messages folded to a summary'),
  ]
  assert.deepEqual(transcript(facts).turns[0]?.entries, [
    { kind: 'prompt', fact: prompt },
    { kind: 'command', run: runFact(5, 22, 'cmd-1a2b3c4d-1', 'compact', ' --keep 2'), done: doneFact(6, 24, 'cmd-1a2b3c4d-1', 'success', 'compacted: 12 messages folded to a summary') },
  ])
})

test('a compaction\'s start, summary and end are one entry, where it started, as a call and its result are paired', () => {
  const facts: Fact[] = [
    { kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' },
    prompt,
    startedFact(20, 100, 'cmp-1'),
    summarizedFact(21, 110, 'cmp-1', 3, 18_300, 'The person asked to fix the build, and it did.'),
    endedFact(22, 120, 'cmp-1'),
  ]
  assert.deepEqual(transcript(facts).turns[0]?.entries, [
    { kind: 'prompt', fact: prompt },
    {
      kind: 'compaction',
      start: startedFact(20, 100, 'cmp-1'),
      summary: summarizedFact(21, 110, 'cmp-1', 3, 18_300, 'The person asked to fix the build, and it did.'),
      end: endedFact(22, 120, 'cmp-1'),
    },
  ])
})

test('a result whose call is not in its turn is kept on its own, never dropped', () => {
  const facts: Fact[] = [{ kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' }, result]
  assert.deepEqual(transcript(facts).turns[0]?.entries, [{ kind: 'result', fact: result }])
})

test('a decision whose ask is not in its turn is kept on its own, never dropped, as a result without its call is', () => {
  const orphan = decidedFact(3, 30, 'a9', 'rejected')
  const facts: Fact[] = [{ kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' }, orphan]
  assert.deepEqual(transcript(facts).turns[0]?.entries, [{ kind: 'decided', fact: orphan }])
})

test('a done whose run is not in its turn is kept on its own, never dropped, as a decision whose ask is not is', () => {
  const orphan = doneFact(3, 30, 'cmd-1a2b3c4d-9', 'error', 'no such skill')
  const facts: Fact[] = [{ kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' }, orphan]
  assert.deepEqual(transcript(facts).turns[0]?.entries, [{ kind: 'done', fact: orphan }])
})

test('what the log holds before its first turn opens the transcript, in a turn numbered null', () => {
  const seeded: Fact = { kind: 'context', seq: 0, time: 1, source: 'agent-instructions', blocks: [{ kind: 'text', text: 'AGENTS.md' }] }
  const facts: Fact[] = [seeded, { kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' }, prompt]
  assert.deepEqual(transcript(facts).turns, [
    { turn: null, entries: [{ kind: 'context', fact: seeded }] },
    { turn: 1, entries: [{ kind: 'prompt', fact: prompt }] },
  ])
})

test('a turn still running has no ending, and a call still running has no result', () => {
  const facts: Fact[] = [{ kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' }, prompt, call]
  assert.deepEqual(transcript(facts).turns, [{ turn: 1, entries: [{ kind: 'prompt', fact: prompt }, { kind: 'tool', call }] }])
})

test('a turn\'s end marks its calls left without results, with how the turn ended', () => {
  const facts: Fact[] = [
    { kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' },
    prompt,
    call,
    { kind: 'turn', seq: 6, time: 30, turn: 1, phase: 'end', ending: 'aborted' },
  ]
  assert.deepEqual(transcript(facts).turns[0]?.entries, [
    { kind: 'prompt', fact: prompt },
    { kind: 'tool', call, left: 'aborted' },
  ])
})

test('a result arriving for a left call answers it, and the mark is gone', () => {
  const facts: Fact[] = [
    { kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' },
    call,
    { kind: 'turn', seq: 6, time: 30, turn: 1, phase: 'end', ending: 'aborted' },
    result,
  ]
  assert.deepEqual(transcript(facts).turns[0]?.entries, [{ kind: 'tool', call, result }])
})

/** A turn starting. */
const start = (seq: number, turn: number): Fact => ({ kind: 'turn', seq, time: seq, turn, phase: 'start' })

/** The call, asked again under another id. */
const asked = (seq: number, callId: string): Fact => callFact(seq, 21, callId, 'bash', '{"command":"pnpm build"}')

/** The result, for a call of another id. */
const returned = (seq: number, callId: string): Fact => returnedFact(seq, 40, callId, 'ok')

test('what has settled is every entry, oldest first, up to a call still waiting for its result in a turn still running', () => {
  const interrupted: Fact = { kind: 'turn', seq: 4, time: 4, turn: 1, phase: 'end', ending: 'aborted' }
  const facts: Fact[] = [start(1, 1), prompt, asked(3, 'c1'), interrupted, start(5, 2), prompt, answer, asked(8, 'c2'), asked(9, 'c3'), returned(10, 'c3')]
  // Turn 1 ended with c1 still waiting, so both its entries have settled. In turn 2, c2 waits: the prompt and the answer before it have settled; c2 and c3 after it have not.
  assert.equal(settled(transcript(facts)), 4)
  assert.equal(settled(transcript([...facts, returned(11, 'c2')])), 6)
  assert.equal(settled(transcript([...facts, { kind: 'turn', seq: 11, time: 11, turn: 2, phase: 'end', ending: 'aborted' }])), 6)
  assert.equal(settled(transcript([asked(1, 'c0')])), 0)
})

test('an approval still waiting for its decision holds back settling, as a call still waiting for its result does', () => {
  const facts: Fact[] = [start(1, 1), prompt, askedFact(3, 21, 'a1', 'bash', 'writes outside the workspace'), answer]
  // The approval waits between the prompt and the answer: it and the answer after it have not settled, for the decision will change the entry.
  assert.equal(settled(transcript(facts)), 1)
  assert.equal(settled(transcript([...facts, decidedFact(5, 24, 'a1', 'allowed-once')])), 3)
})

test('a command still running holds back settling, as an approval still waiting for its decision does', () => {
  const facts: Fact[] = [start(1, 1), prompt, runFact(3, 21, 'cmd-1a2b3c4d-1', 'compact'), answer]
  // The command waits between the prompt and the answer: it and the answer after it have not settled, for the done will change the entry.
  assert.equal(settled(transcript(facts)), 1)
  assert.equal(settled(transcript([...facts, doneFact(5, 24, 'cmd-1a2b3c4d-1', 'success', 'compacted')])), 3)
})

test('a command still running holds back settling in a turn that has ended, for dsh logs commands with no turn around them', () => {
  const facts: Fact[] = [
    start(1, 1),
    prompt,
    { kind: 'turn', seq: 3, time: 3, turn: 1, phase: 'end', ending: 'completed' },
    runFact(4, 40, 'cmd-1a2b3c4d-1', 'compact'),
  ]
  // The command ran while the session idled, past its last turn's end: it has not settled, for its done will change the entry.
  assert.equal(settled(transcript(facts)), 1)
  assert.equal(settled(transcript([...facts, doneFact(5, 50, 'cmd-1a2b3c4d-1', 'success', 'compacted')])), 2)
})

test('a compaction still running holds back settling, wherever dsh logged it, for dsh logs one between turns', () => {
  const facts: Fact[] = [
    start(1, 1),
    prompt,
    { kind: 'turn', seq: 3, time: 3, turn: 1, phase: 'end', ending: 'completed' },
    startedFact(4, 40, 'cmp-1'),
  ]
  // The compaction ran while the session idled, past its last turn's end, as a manual /compact does: it has not settled,
  // for its end — the summary it lands or the error it names — is still to come and will change the entry.
  assert.equal(settled(transcript(facts)), 1)
  assert.equal(settled(transcript([...facts, summarizedFact(5, 50, 'cmp-1', 3, 300, 'summarized')])), 1)
  assert.equal(settled(transcript([...facts, endedFact(6, 60, 'cmp-1')])), 2)
})

test('a summary or end whose compaction is not in its turn is kept on its own, never dropped, as a done whose run is not is', () => {
  const half = summarizedFact(3, 30, 'cmp-9', 3, 300, 'half a log')
  const facts: Fact[] = [{ kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' }, half]
  assert.deepEqual(transcript(facts).turns[0]?.entries, [{ kind: 'summary', fact: half }])
  const failed = endedFact(4, 40, 'cmp-8', 'summary: the provider refused the call')
  assert.deepEqual(transcript([{ kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' }, failed]).turns[0]?.entries, [{ kind: 'end', fact: failed }])
})

test('a replacement leaves what it shadowed standing: the entries before a compaction keep their places, and a call keeps the result it had', () => {
  const pruned: Fact = { kind: 'quiet', seq: 8, time: 45, type: 'tool/result', record: {} }
  const checkpoint: Fact = { kind: 'quiet', seq: 12, time: 65, type: 'user/message', record: {} }
  const facts: Fact[] = [
    start(1, 1),
    prompt,
    call,
    result,
    pruned,
    startedFact(9, 50, 'cmp-1'),
    summarizedFact(10, 60, 'cmp-1', 3, 300, 'The person asked to fix the build, and it did.'),
    checkpoint,
    endedFact(13, 70, 'cmp-1'),
  ]
  assert.deepEqual(transcript(facts).turns[0]?.entries, [
    { kind: 'prompt', fact: prompt },
    { kind: 'tool', call, result },
    { kind: 'quiet', fact: pruned },
    {
      kind: 'compaction',
      start: startedFact(9, 50, 'cmp-1'),
      summary: summarizedFact(10, 60, 'cmp-1', 3, 300, 'The person asked to fix the build, and it did.'),
      end: endedFact(13, 70, 'cmp-1'),
    },
    { kind: 'quiet', fact: checkpoint },
  ])
})

test('nothing the log holds is dropped: every fact but a turn\'s and a step\'s is held by exactly one entry, paired or alone', () => {
  const machinery: Fact[] = [
    { kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' },
    { kind: 'step', seq: 3, time: 15, turn: 1, step: 1, phase: 'start' },
    { kind: 'step', seq: 8, time: 25, turn: 1, step: 1, phase: 'end' },
    { kind: 'turn', seq: 13, time: 30, turn: 1, phase: 'end', ending: 'completed' },
  ]
  const held: Fact[] = [
    prompt,
    { kind: 'context', seq: 5, time: 18, source: 'goal', blocks: [{ kind: 'text', text: 'ship it' }] },
    answer,
    call,
    askedFact(9, 26, 'a1', 'bash', 'writes outside the workspace'),
    decidedFact(10, 27, 'a1', 'allowed-once'),
    // A decision whose ask is not in the log: kept on its own, never dropped.
    decidedFact(11, 28, 'a9', 'rejected'),
    startedFact(14, 31, 'cmp-1'),
    summarizedFact(15, 32, 'cmp-1', 3, 300, 'The person asked to fix the build, and it did.'),
    endedFact(16, 33, 'cmp-1'),
    // An end whose compaction is not in the log: kept on its own, never dropped.
    endedFact(17, 34, 'cmp-9'),
    { kind: 'authored', seq: 6, time: 19, name: 'seeded', data: { from: 'fork' } },
    { kind: 'unknown', seq: 7, time: 20, type: 'test/marker', record: {} },
    { kind: 'quiet', seq: 12, time: 29, type: 'session/title', record: {} },
  ]
  const drawn: Fact[] = []
  for (const turn of transcript([...machinery, ...held]).turns) {
    for (const entry of turn.entries) {
      if (entry.kind === 'tool') drawn.push(entry.call, ...entry.result === undefined ? [] : [entry.result])
      else if (entry.kind === 'approval') drawn.push(entry.asked, ...entry.decided === undefined ? [] : [entry.decided])
      else if (entry.kind === 'command') drawn.push(entry.run, ...entry.done === undefined ? [] : [entry.done])
      else if (entry.kind === 'compaction') drawn.push(entry.start, ...entry.summary === undefined ? [] : [entry.summary], ...entry.end === undefined ? [] : [entry.end])
      else if (entry.kind === 'retry') drawn.push(entry.retry, ...entry.started === undefined ? [] : [entry.started])
      else if (entry.kind === 'workflow') drawn.push(entry.run, ...entry.members.flatMap(member => [member.start, ...member.end === undefined ? [] : [member.end]]), ...entry.end === undefined ? [] : [entry.end])
      else if (entry.kind !== 'streaming') drawn.push(entry.fact)
    }
  }
  // Entries hold their facts in log order, so what they hold reads back as the log does, turn and step facts excepted: the model spends those naming the turns themselves.
  assert.deepEqual(drawn, held)
})

test('a prompt in a turn that already holds one steered it; the turn\'s first prompt, and one before any turn, did not', () => {
  const steer = promptFact(8, 30, 'use pnpm')
  const facts: Fact[] = [
    promptFact(1, 1, 'before any turn'),
    { kind: 'turn', seq: 2, time: 5, turn: 1, phase: 'start' },
    { kind: 'quiet', seq: 3, time: 6, type: 'agent/inbox/spliced', record: {} } as Fact,
    promptFact(4, 10, 'fix the build'),
    call,
    steer,
  ]
  assert.deepEqual(transcript(facts).turns.map(turn => turn.entries.filter(entry => entry.kind === 'prompt')), [
    [{ kind: 'prompt', fact: promptFact(1, 1, 'before any turn') }],
    [{ kind: 'prompt', fact: promptFact(4, 10, 'fix the build') }, { kind: 'prompt', fact: steer, steer: true }],
  ])
})

const streamed = { turn: 1, step: 1, blocks: [{ kind: 'text', text: 'Do' }] } as const

test('an answer streaming stands at the end of its turn, after what the log holds', () => {
  const facts: Fact[] = [{ kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' }, prompt]
  assert.deepEqual(answering(transcript(facts), streamed), {
    turns: [{ turn: 1, entries: [{ kind: 'prompt', fact: prompt }, { kind: 'streaming', answer: streamed }] }],
  })
})

test('once the log holds the answer of its turn and step, the answer streamed is drawn no more', () => {
  const facts: Fact[] = [{ kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' }, prompt, answer]
  assert.deepEqual(answering(transcript(facts), streamed), transcript(facts))
})

test('an answer streaming is not settled: the log has yet to hold it', () => {
  const facts: Fact[] = [{ kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' }, prompt]
  assert.equal(settled(answering(transcript(facts), streamed)), 1)
})

const retry = (seq: number, attempt: number): Extract<Fact, { readonly kind: 'retry' }> => ({ kind: 'retry', seq, time: seq, retryId: 'r1' as never, turn: 1, step: 1, attempt, of: 3, at: seq + 1_000, failure: 'rate limited' })
const retried = (seq: number, attempt: number): Extract<Fact, { readonly kind: 'retried' }> => ({ kind: 'retried', seq, time: seq, retryId: 'r1' as never, attempt })

test('a chain of retries is one entry where its first was scheduled, holding its latest attempt and whether that one started', () => {
  const opened: Fact = { kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' }
  assert.deepEqual(transcript([opened, prompt, retry(3, 1), retried(4, 1), retry(5, 2)]).turns[0]?.entries, [{ kind: 'prompt', fact: prompt }, { kind: 'retry', retry: retry(5, 2) }])
  assert.deepEqual(transcript([opened, prompt, retry(3, 1), retried(4, 1), retry(5, 2), retried(6, 2)]).turns[0]?.entries.at(-1), { kind: 'retry', retry: retry(5, 2), started: retried(6, 2) })
})

test('a retry still scheduled when its turn ends is left, saying how the turn ended, and waits to settle only while the turn runs', () => {
  const opened: Fact = { kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' }
  const running = transcript([opened, prompt, retry(3, 1)])
  assert.equal(settled(running), 1)
  const ended = transcript([opened, prompt, retry(3, 1), { kind: 'turn', seq: 4, time: 9, turn: 1, phase: 'end', ending: 'aborted' }])
  assert.deepEqual(ended.turns[0]?.entries.at(-1), { kind: 'retry', retry: retry(3, 1), left: 'aborted' })
  assert.equal(settled(ended), 2)
})

test('the start of an attempt older than its chain\'s latest changes nothing: the chain stays one entry, its latest still scheduled', () => {
  const opened: Fact = { kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' }
  assert.deepEqual(transcript([opened, prompt, retry(3, 1), retry(4, 2), retried(5, 1)]).turns[0]?.entries, [{ kind: 'prompt', fact: prompt }, { kind: 'retry', retry: retry(4, 2) }])
})

const run = { kind: 'workflow', seq: 3, time: 3, runId: 'wf-1' as never, name: 'review' } as const
const lint = { kind: 'member', seq: 4, time: 4, runId: 'wf-1' as never, member: 0, label: 'lint' } as const
const linted = { kind: 'member-end', seq: 5, time: 5, runId: 'wf-1' as never, member: 0, outcome: 'completed' } as const
const stopped = { kind: 'workflow-end', seq: 6, time: 6, runId: 'wf-1' as never, stopped: 'completed' } as const

test('a workflow run is one entry where it opened, holding each member with its settling, and how the run stopped', () => {
  const opened: Fact = { kind: 'turn', seq: 1, time: 1, turn: 1, phase: 'start' }
  assert.deepEqual(transcript([opened, prompt, run, lint, linted, stopped]).turns[0]?.entries.at(-1), { kind: 'workflow', run, members: [{ start: lint, end: linted }], end: stopped })
})

test('a workflow run still going waits to settle while its turn runs, and one its turn ended is left, saying how', () => {
  const opened: Fact = { kind: 'turn', seq: 1, time: 1, turn: 1, phase: 'start' }
  assert.equal(settled(transcript([opened, prompt, run, lint])), 1)
  const ended = transcript([opened, prompt, run, lint, { kind: 'turn', seq: 9, time: 9, turn: 1, phase: 'end', ending: 'aborted' }])
  assert.deepEqual(ended.turns[0]?.entries.at(-1), { kind: 'workflow', run, members: [{ start: lint }], left: 'aborted' })
})
