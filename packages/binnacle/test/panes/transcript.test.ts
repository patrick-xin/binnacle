import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripTerminalSequences } from '@earendil-works/pi-tui'
import { MessageId, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { adapt } from '../../src/facts/adapt.ts'
import type { Fact } from '../../src/facts/adapt.ts'
import type { View, Views } from '../../src/api.ts'
import { TranscriptPane } from '../../src/panes/transcript.ts'
import type { PaneReports } from '../../src/panes/transcript.ts'
import { prompt as promptFact, call as callFact, returned as returnedFact } from '../support/facts.ts'
import { called } from '../support/events.ts'
import { pointer } from '../support/pointer.ts'

const prompt = promptFact(1, 1, 'fix the build')

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

test('a click on a fold opens it, and the pane claims the click', () => {
  const pane = new TranscriptPane(() => {})
  pane.push(prompt)
  pane.push(context)
  assert.deepEqual(shown(pane), ['› fix the build', '⋯ added by goal', '… 2 more lines'])
  assert.deepEqual(pane.handleMouse(pointer('click', 2)), { handled: true })
  assert.deepEqual(shown(pane), ['› fix the build', '⋯ added by goal', 'a', 'b'])
})

test('stepping in from the composer focuses the nearest thing that offers something, drawn as its accent row', () => {
  const pane = new TranscriptPane(() => {})
  pane.push(prompt)
  pane.push(context)
  assert.deepEqual(shown(pane), ['› fix the build', '⋯ added by goal', '… 2 more lines'])
  assert.equal(pane.focused, false)
  assert.equal(pane.handleKey({ kind: 'key', binding: 'focus.previous' }), true)
  assert.equal(pane.focused, true)
  assert.deepEqual(shown(pane), ['› fix the build', '⋯ added by goal', '▸ show 2 more lines'])
})

test('while something has focus, tab moves to the next thing and shift+tab to the previous, wrapping', () => {
  const pane = new TranscriptPane(() => {})
  pane.push(prompt)
  pane.push(context)
  pane.push({ ...context, seq: 3, time: 3 })
  shown(pane)
  pane.handleKey({ kind: 'key', binding: 'focus.previous' })
  assert.deepEqual(shown(pane).slice(1), ['⋯ added by goal', '… 2 more lines', '⋯ added by goal', '▸ show 2 more lines'])
  pane.handleKey({ kind: 'key', binding: 'focus.previous' })
  assert.deepEqual(shown(pane).slice(1), ['⋯ added by goal', '▸ show 2 more lines', '⋯ added by goal', '… 2 more lines'])
  pane.handleKey({ kind: 'key', binding: 'focus.next' })
  pane.handleKey({ kind: 'key', binding: 'focus.next' })
  assert.deepEqual(shown(pane).slice(1), ['⋯ added by goal', '▸ show 2 more lines', '⋯ added by goal', '… 2 more lines'])
})

test('enter does what the focused thing offers first: it opens a cut fold, and folds an open one again', () => {
  const pane = new TranscriptPane(() => {})
  pane.push(prompt)
  pane.push(context)
  shown(pane)
  pane.handleKey({ kind: 'key', binding: 'focus.previous' })
  pane.handleKey({ kind: 'key', binding: 'primary' })
  assert.deepEqual(shown(pane), ['› fix the build', '⋯ added by goal', 'a', 'b', '▸ fold it away'])
  pane.handleKey({ kind: 'key', binding: 'primary' })
  assert.deepEqual(shown(pane), ['› fix the build', '⋯ added by goal', '▸ show 2 more lines'])
})

test('escape gives the keyboard back to the composer: focus is dropped, and its row with it', () => {
  const pane = new TranscriptPane(() => {})
  pane.push(prompt)
  pane.push(context)
  shown(pane)
  pane.handleKey({ kind: 'key', binding: 'focus.previous' })
  assert.equal(pane.handleKey({ kind: 'key', binding: 'focus.out' }), true)
  assert.equal(pane.focused, false)
  assert.deepEqual(shown(pane), ['› fix the build', '⋯ added by goal', '… 2 more lines'])
})

test('a key bound to an affordance the focused thing does not offer is not answered', () => {
  const pane = new TranscriptPane(() => {})
  pane.push(prompt)
  pane.push(context)
  shown(pane)
  pane.handleKey({ kind: 'key', binding: 'focus.previous' })
  assert.equal(pane.handleKey({ kind: 'key', binding: 'copy' }), false)
  assert.equal(pane.focused, true)
  assert.deepEqual(shown(pane), ['› fix the build', '⋯ added by goal', '▸ show 2 more lines'])
})

test('a focus that lands on something reports the rows it covers, to be brought into view, and opening what is focused reports nothing', () => {
  const inView: [number, number][] = []
  const reports: PaneReports = { inView: (top, height) => { inView.push([top, height]) } }
  const pane = new TranscriptPane(() => {}, () => new Map(), reports)
  pane.push(prompt)
  pane.push(context)
  pane.push({ ...context, seq: 3, time: 3 })
  shown(pane)
  pane.handleKey({ kind: 'key', binding: 'focus.previous' })
  assert.deepEqual(inView, [[4, 1]])
  pane.handleKey({ kind: 'key', binding: 'focus.previous' })
  assert.deepEqual(inView, [[4, 1], [2, 1]])
  pane.handleKey({ kind: 'key', binding: 'primary' })
  assert.deepEqual(inView, [[4, 1], [2, 1]])
})

test('on the main screen, focus below what was printed stays drawn there, and focus that reaches a printed entry asks for fullscreen', () => {
  const fullscreen: [number, number][] = []
  const pane = new TranscriptPane(() => {}, () => new Map(), { fullscreen: (top, height) => { fullscreen.push([top, height]) } })
  pane.drawOn('regular')
  pane.push(sent(1, 'one'))
  pane.push(call)
  pane.push(result)
  pane.push(waiting)
  pane.push(below)
  assert.deepEqual(shown(pane), ['› one', '● read {}', 'w', 'x', 'y', '… 1 more line', '● stat {}', '  running…', '⋯ added by goal', '… 2 more lines'])
  pane.handleKey({ kind: 'key', binding: 'focus.previous' })
  assert.deepEqual(fullscreen, [])
  assert.deepEqual(shown(pane).slice(6), ['● stat {}', '  running…', '⋯ added by goal', '▸ show 2 more lines'])
  pane.handleKey({ kind: 'key', binding: 'focus.previous' })
  assert.deepEqual(fullscreen, [[2, 4]])
})

test('switching to the main screen drops focus that sits on a printed entry, and the printed rows are as they were', () => {
  const pane = new TranscriptPane(() => {})
  pane.drawOn('regular')
  pane.push(sent(1, 'one'))
  pane.push(call)
  pane.push(result)
  pane.push(waiting)
  pane.push(below)
  shown(pane)
  pane.drawOn('fullscreen')
  pane.handleKey({ kind: 'key', binding: 'focus.previous' })
  pane.handleKey({ kind: 'key', binding: 'focus.previous' })
  assert.equal(pane.focused, true)
  pane.drawOn('regular')
  assert.equal(pane.focused, false)
  assert.deepEqual(shown(pane), ['› one', '● read {}', 'w', 'x', 'y', '… 1 more line', '● stat {}', '  running…', '⋯ added by goal', '… 2 more lines'])
})

test('when what is focused settles into the printed rows, focus is dropped rather than a printed row changed', () => {
  const pane = new TranscriptPane(() => {})
  pane.drawOn('regular')
  pane.push(sent(1, 'one'))
  pane.push(call)
  pane.push(result)
  pane.push(waiting)
  pane.push(below)
  shown(pane)
  pane.handleKey({ kind: 'key', binding: 'focus.previous' })
  const done: Fact = { kind: 'result', seq: 6, time: 6, turn: 1, step: 1, callId: 'c2', failed: false, blocks: [{ kind: 'text', text: 'done' }], meta: undefined }
  pane.push(done)
  assert.equal(pane.focused, true)
  assert.deepEqual(shown(pane), ['› one', '● read {}', 'w', 'x', 'y', '… 1 more line', '● stat {}', 'done', '⋯ added by goal', '… 2 more lines'])
  assert.equal(pane.focused, false)
})

/**
 * A prompt the person sent.
 * @param seq - its place in the log.
 * @param text - what they wrote.
 * @returns the fact.
 */
const sent = (seq: number, text: string): Fact => promptFact(seq, seq, text)

/**
 * An author's view of prompts that counts how often binnacle calls it: each
 * prompt's text, folded to its first line.
 * @returns the views to hand a pane, and the calls so far.
 */
function counting(): { views: Views, calls: () => number } {
  let calls = 0
  const view: View = (entry) => {
    calls++
    const text = entry.kind === 'prompt' ? entry.fact.blocks.map(block => block.kind === 'unread' ? '' : block.text).join('\n') : ''
    return { kind: 'fold', id: `mine:${entry.kind === 'prompt' ? entry.fact.seq : 0}`, rows: 1, child: { kind: 'text', text } }
  }
  return { views: new Map([['prompt', [view]]]), calls: () => calls }
}

/**
 * An author's view that folds every prompt under one name, whatever entry it draws: each prompt's text, folded to its first line.
 */
const foldedAlike: View = (entry) => ({
  kind: 'fold',
  id: 'mine',
  rows: 1,
  child: { kind: 'text', text: entry.kind === 'prompt' ? entry.fact.blocks.map(block => block.kind === 'unread' ? '' : block.text).join('\n') : '' },
})

/** Views holding the one author's view that folds every prompt alike. */
const alike: Views = new Map([['prompt', [foldedAlike]]])

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

test('a fold a person opened stays open when the adapters change and the log is read again', () => {
  const pane = new TranscriptPane(() => {}, () => alike)
  pane.push(sent(1, 'one\nmore'))
  pane.push(sent(2, 'two\nmore'))
  assert.deepEqual(shown(pane), ['one', '… 1 more line', 'two', '… 1 more line'])
  assert.deepEqual(pane.handleMouse(pointer('click', 3)), { handled: true })
  assert.deepEqual(shown(pane), ['one', '… 1 more line', 'two', 'more'])
  pane.reset([sent(1, 'one\nmore'), sent(2, 'two\nmore')])
  assert.deepEqual(shown(pane), ['one', '… 1 more line', 'two', 'more'])
})

test('a fold a person opened stays open across a switch of screens', () => {
  const pane = new TranscriptPane(() => {}, () => alike)
  pane.push(sent(1, 'one\nmore'))
  pane.push(sent(2, 'two\nmore'))
  assert.deepEqual(pane.handleMouse(pointer('click', 3)), { handled: true })
  pane.drawOn('regular')
  assert.deepEqual(shown(pane), ['one', '… 1 more line', 'two', 'more'])
  pane.drawOn('fullscreen')
  assert.deepEqual(shown(pane), ['one', '… 1 more line', 'two', 'more'])
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
const call = callFact(1, 1, 'c1', 'read', '{}')

/** A second call, still waiting for its result. */
const waiting: Fact = callFact(4, 4, 'c2', 'stat', '{}')

/** A fold that lands after the waiting call, below what the main screen printed. */
const below: Fact = { kind: 'context', seq: 5, time: 5, source: 'goal', blocks: [{ kind: 'text', text: 'a\nb' }] }

/** A fold a person can open, after the call. */
const goal: Fact = { ...context, seq: 2, time: 2 }

/** The call's result, arriving once the fold is on screen: more lines than the call's `running…`. */
const result = returnedFact(3, 3, 'c1', 'w\nx\ny\nz')

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
const asked = called(1, 'read')

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
  const views: Views = new Map([['tool', [view]]])
  const pane = new TranscriptPane(() => {}, () => views)
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

/** An author's view that draws binnacle's drawing of an entry in a card. */
const carded: View = (_, next) => ({ kind: 'card', title: 'yours', child: next() })

test('a click on a card\'s border is left to pi-tui, and one inside it reaches what the card holds', () => {
  const views: Views = new Map([['context', [carded]]])
  const pane = new TranscriptPane(() => {}, () => views)
  pane.push(context)
  assert.deepEqual(shown(pane), ['╭─ yours ──────────────────────────────╮', '│ ⋯ added by goal                      │', '│ … 2 more lines                       │', '╰──────────────────────────────────────╯'])
  assert.equal(pane.handleMouse(pointer('click', 2, 0)), undefined)
  assert.deepEqual(pane.handleMouse(pointer('click', 2, 2)), { handled: true })
  assert.deepEqual(shown(pane).slice(1, 4), ['│ ⋯ added by goal                      │', '│ a                                    │', '│ b                                    │'])
})

/**
 * A view that draws every entry of its key as one word.
 * @param word - what it draws.
 * @returns the view.
 */
const drawing = (word: string): View => () => ({ kind: 'text', text: word })

test('on the main screen, what is printed stays as printed; a call still waiting, and what follows it, is drawn anew below until its result arrives', () => {
  const views = new Map<string, readonly View[]>()
  const pane = new TranscriptPane(() => {}, () => views)
  pane.drawOn('regular')
  pane.push(sent(1, 'one'))
  pane.push(call)
  pane.push(sent(3, 'three'))
  assert.deepEqual(shown(pane), ['› one', '● read {}', '  running…', '› three'])
  views.set('prompt', [drawing('mine')])
  assert.deepEqual(shown(pane), ['› one', '● read {}', '  running…', 'mine'])
  pane.push({ ...result, seq: 4, time: 4 })
  assert.deepEqual(shown(pane), ['› one', '● read {}', 'w', 'x', 'y', '… 1 more line', 'mine'])
  views.set('prompt', [drawing('yours')])
  assert.deepEqual(shown(pane), ['› one', '● read {}', 'w', 'x', 'y', '… 1 more line', 'mine'])
})

test('on the main screen, a visit to the alternate screen leaves what was printed, and a resize prints it again as it now draws', () => {
  const views = new Map<string, readonly View[]>()
  const pane = new TranscriptPane(() => {}, () => views)
  pane.drawOn('regular')
  pane.push(sent(1, 'one'))
  assert.deepEqual(shown(pane), ['› one'])
  views.set('prompt', [drawing('mine')])
  pane.drawOn('fullscreen')
  assert.deepEqual(shown(pane), ['mine'])
  pane.drawOn('regular')
  assert.deepEqual(shown(pane), ['› one'])
  assert.deepEqual(pane.render(30).map(line => stripTerminalSequences(line).trimEnd()), ['mine'])
})

test('on the main screen, reading the log again or pi-tui invalidating the pane prints everything again, as it now draws', () => {
  const views = new Map<string, readonly View[]>()
  const pane = new TranscriptPane(() => {}, () => views)
  pane.drawOn('regular')
  pane.push(sent(1, 'one'))
  shown(pane)
  views.set('prompt', [drawing('mine')])
  pane.reset([sent(1, 'one')])
  assert.deepEqual(shown(pane), ['mine'])
  views.set('prompt', [drawing('yours')])
  pane.invalidate()
  assert.deepEqual(shown(pane), ['yours'])
})

/**
 * A pane on the screen asked for, holding a turn whose one call is still unanswered.
 * @param on - the screen it draws on.
 * @returns the pane, mid-turn.
 */
const unanswered = (on: 'fullscreen' | 'regular'): TranscriptPane => {
  const pane = new TranscriptPane(() => {})
  pane.drawOn(on)
  pane.push({ kind: 'turn', seq: 1, time: 1, turn: 1, phase: 'start' })
  pane.push(sent(2, 'one'))
  pane.push({ ...call, seq: 3 })
  return pane
}

test('a call its turn left without a result is drawn that way on both screens', () => {
  const ended: Fact = { kind: 'turn', seq: 4, time: 4, turn: 1, phase: 'end', ending: 'aborted' }
  const fullscreen = unanswered('fullscreen')
  assert.deepEqual(shown(fullscreen), ['› one', '● read {}', '  running…'])
  fullscreen.push(ended)
  assert.deepEqual(shown(fullscreen), ['› one', '● read {}', '  the turn ended without it: aborted'])
  const regular = unanswered('regular')
  assert.deepEqual(shown(regular), ['› one', '● read {}', '  running…'])
  regular.push(ended)
  assert.deepEqual(shown(regular), ['› one', '● read {}', '  the turn ended without it: aborted'])
})
