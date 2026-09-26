import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripTerminalSequences } from '@earendil-works/pi-tui'
import type { TuiMouseEvent } from '@earendil-works/pi-tui'
import { MessageId, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { adapt } from '../src/facts/adapt.ts'
import type { Fact } from '../src/facts/adapt.ts'
import type { View } from '../src/api.ts'
import { TranscriptPane } from '../src/panes/transcript.ts'

const prompt: Fact = { kind: 'prompt', seq: 1, time: 1, blocks: [{ kind: 'text', text: 'fix the build' }] }

/**
 * What a pane shows at a width.
 * @param pane - the pane.
 * @returns its lines, plain.
 */
const shown = (pane: TranscriptPane): string[] => pane.render(40).map(line => stripTerminalSequences(line).trimEnd())

test('the pane draws the facts pushed into it, and asks for a frame each time', () => {
  let asked = 0
  const pane = new TranscriptPane(() => { asked++ })
  pane.push(prompt)
  assert.deepEqual(shown(pane), ['› fix the build'])
  assert.equal(asked, 1)
})

const context: Fact = { kind: 'context', seq: 2, time: 2, source: 'goal', blocks: [{ kind: 'text', text: 'a\nb' }] }

/**
 * A pointer event on a row of the pane, as pi-tui's containers deliver it.
 * @param type - what the pointer did.
 * @param y - the row, in the pane's own lines.
 * @returns the event.
 */
const pointer = (type: TuiMouseEvent['type'], y: number): TuiMouseEvent => ({
  type, button: type === 'wheel' || type === 'move' ? 'none' : 'left', x: 0, y, screenX: 0, screenY: y, width: 40, height: 3,
  shift: false, alt: false, ctrl: false, ...type === 'wheel' ? { wheelDelta: -1 } : {},
})

test('a click on a fold opens it, and the pane claims the click', () => {
  const pane = new TranscriptPane(() => {})
  pane.push(prompt)
  pane.push(context)
  assert.deepEqual(shown(pane), ['› fix the build', '⋯ added by goal', '… 2 more lines'])
  assert.deepEqual(pane.handleMouse(pointer('click', 2)), { handled: true })
  assert.deepEqual(shown(pane), ['› fix the build', '⋯ added by goal', 'a', 'b'])
})

/**
 * A prompt the person sent.
 * @param seq - its place in the log.
 * @param text - what they wrote.
 * @returns the fact.
 */
const sent = (seq: number, text: string): Fact => ({ kind: 'prompt', seq, time: seq, blocks: [{ kind: 'text', text }] })

/**
 * An author's view of prompts that counts how often binnacle calls it: each
 * prompt's text, folded to its first line.
 * @returns the views to hand a pane, and the calls so far.
 */
function counting(): { views: Map<string, View>, calls: () => number } {
  let calls = 0
  const view: View = (entry) => {
    calls++
    const text = entry.kind === 'prompt' ? entry.fact.blocks.map(block => block.kind === 'unread' ? '' : block.text).join('\n') : ''
    return { kind: 'fold', id: `mine:${entry.kind === 'prompt' ? entry.fact.seq : 0}`, rows: 1, child: { kind: 'text', text } }
  }
  return { views: new Map([['prompt', view]]), calls: () => calls }
}

test('a view is called once for each entry, however many frames draw it', () => {
  const { views, calls } = counting()
  const pane = new TranscriptPane(() => {}, () => views)
  pane.push(sent(1, 'one'))
  pane.push(sent(2, 'two'))
  shown(pane)
  shown(pane)
  shown(pane)
  assert.equal(calls(), 2)
  pane.push(sent(3, 'three'))
  assert.deepEqual(shown(pane), ['one', 'two', 'three'])
  assert.equal(calls(), 3)
})

test('opening a fold draws its entry again, laid out anew, without calling its view', () => {
  const { views, calls } = counting()
  const pane = new TranscriptPane(() => {}, () => views)
  pane.push(sent(1, 'one\nmore'))
  pane.push(sent(2, 'two\nmore'))
  assert.deepEqual(shown(pane), ['one', '… 1 more line', 'two', '… 1 more line'])
  assert.deepEqual(pane.handleMouse(pointer('click', 1)), { handled: true })
  assert.deepEqual(shown(pane), ['one', 'more', 'two', '… 1 more line'])
  assert.deepEqual(pane.handleMouse(pointer('click', 0)), { handled: true })
  assert.deepEqual(shown(pane), ['one', '… 1 more line', 'two', '… 1 more line'])
  assert.equal(calls(), 2)
})

test('a resize lays every entry out at the new width, without calling its view', () => {
  const { views, calls } = counting()
  const pane = new TranscriptPane(() => {}, () => views)
  pane.push(sent(1, 'fix the build and the tests'))
  assert.deepEqual(shown(pane), ['fix the build and the tests'])
  assert.deepEqual(pane.render(16).map(line => stripTerminalSequences(line).trimEnd()), ['fix the build', '… 1 more line'])
  assert.equal(calls(), 1)
})

test('invalidating the pane calls every view again, as pi-tui asks when the theme changes', () => {
  const { views, calls } = counting()
  const pane = new TranscriptPane(() => {}, () => views)
  pane.push(sent(1, 'one'))
  shown(pane)
  pane.invalidate()
  shown(pane)
  assert.equal(calls(), 2)
})

/** A tool call, asked in turn 1. */
const call: Fact = { kind: 'call', seq: 1, time: 1, turn: 1, step: 1, callId: 'c1', name: 'read', arguments: '{}' }

/** A fold a person can open, after the call. */
const goal: Fact = { ...context, seq: 2, time: 2 }

/** The call's result, arriving once the fold is on screen: more lines than the call's `running…`. */
const result: Fact = { kind: 'result', seq: 3, time: 3, turn: 1, step: 1, callId: 'c1', failed: false, blocks: [{ kind: 'text', text: 'w\nx\ny\nz' }], meta: undefined }

test('a result draws its call again, with it', () => {
  const pane = new TranscriptPane(() => {})
  pane.push(call)
  assert.deepEqual(shown(pane), ['● read {}', '  running…'])
  pane.push(result)
  assert.deepEqual(shown(pane), ['● read {}', 'w', 'x', 'y', '… 1 more line'])
})

test('a click answers the screen last drawn, the one the person pointed at, though a fact has arrived since', () => {
  const pane = new TranscriptPane(() => {})
  pane.push(call)
  pane.push(goal)
  assert.deepEqual(shown(pane), ['● read {}', '  running…', '⋯ added by goal', '… 2 more lines'])
  pane.push(result)
  assert.deepEqual(pane.handleMouse(pointer('click', 3)), { handled: true })
  assert.deepEqual(shown(pane), ['● read {}', 'w', 'x', 'y', '… 1 more line', '⋯ added by goal', 'a', 'b'])
})

test('a click at a width nothing was drawn at is answered at that width', () => {
  const pane = new TranscriptPane(() => {})
  pane.push(prompt)
  pane.push(context)
  assert.deepEqual(pane.handleMouse(pointer('click', 2)), { handled: true })
  assert.deepEqual(shown(pane), ['› fix the build', '⋯ added by goal', 'a', 'b'])
})

/** A tool call as dsh logs it. */
const asked: SessionEvent<'tool/call'> = { type: 'tool/call', seq: SessionSeq(1), time: 1, data: { turn: 1, step: 1, callId: ToolCallId('c1'), name: 'read', arguments: '{}' } }

/** Its result as dsh logs it. */
const answered: SessionEvent<'tool/result'> = {
  type: 'tool/result', seq: SessionSeq(2), time: 2, surfaceOp: 'append',
  data: { turn: 1, step: 1, message: { role: 'tool', id: MessageId('m1'), source: { kind: 'tool', callId: ToolCallId('c1') }, toolCallId: ToolCallId('c1'), isError: false, content: [{ type: 'text', text: 'done' }] } },
}

/**
 * A pane whose author's view of tool calls does something to the entry it is handed, then draws it.
 * @param tamper - what the view does to its entry.
 * @returns the pane, the call already pushed and drawn.
 */
function tampered(tamper: (entry: Extract<Parameters<View>[0], { kind: 'tool' }>) => void): TranscriptPane {
  const view: View = (entry) => {
    if (entry.kind === 'tool') tamper(entry)
    return { kind: 'text', text: 'drawn by an author' }
  }
  const pane = new TranscriptPane(() => {}, () => new Map([['tool', view]]))
  pane.push(adapt(asked))
  shown(pane)
  return pane
}

test('a view that changes the entry it was handed is fenced, and the transcript goes on', () => {
  const pane = tampered((entry) => { Object.assign(entry, { call: undefined }) })
  pane.push(adapt(answered))
  const lines = shown(pane)
  assert.deepEqual(lines.slice(0, 2), ['● read {}', 'done'])
  assert.match(lines[2] ?? '', /^✗ binnacle\.view\(tool\) threw: /)
})

test('a view that changes the fact in its entry is fenced, and the transcript goes on', () => {
  const pane = tampered((entry) => { Object.defineProperty(entry.call, 'callId', { get: () => { throw new Error('no call') } }) })
  pane.push(adapt(answered))
  const lines = shown(pane)
  assert.deepEqual(lines.slice(0, 2), ['● read {}', 'done'])
  assert.match(lines[2] ?? '', /^✗ binnacle\.view\(tool\) threw: /)
})

test('a click on what offers nothing, a wheel, a drag and hovering are left to pi-tui', () => {
  const pane = new TranscriptPane(() => {})
  pane.push(prompt)
  pane.push(context)
  shown(pane)
  for (const event of [pointer('click', 0), pointer('wheel', 2), pointer('drag', 2), pointer('move', 2)]) {
    assert.equal(pane.handleMouse(event), undefined, event.type)
  }
})
