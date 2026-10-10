import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import { bindScopeParent, scopeTarget } from '@deepseek-ai/dsh-scope'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import { UserQuestionError } from '@deepseek-ai/dsh-user-questions'
import type { AskUserQuestionAnswer, AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions'
import * as composer from '../../src/plugins/composer/index.ts'
import * as requests from '../../src/plugins/requests/index.ts'
import * as view from '../../src/plugins/requests-view/index.ts'
import { REQUEST_LAYOUT, keyOf, pick } from '../../src/plugins/requests-view/index.ts'
import type { Request } from '../../src/index.ts'
import { agents } from '../support/agents.ts'
import { mount } from '../support/mount.ts'

async function chat(options: { columns?: number; rows?: number; before?: (ctx: Context) => PromiseLike<unknown> } = {}) {
  const dsh = agents()
  const mounted = await mount({ columns: options.columns ?? 40, rows: options.rows ?? 10, provide: dsh.provide })
  mounted.ready()
  await mounted.ctx.plugin(composer)
  await mounted.ctx.plugin(requests)
  const plugin = await mounted.ctx.plugin(view)
  await options.before?.(mounted.ctx)
  await new Promise((resolve) => setImmediate(resolve))
  const rows = async (): Promise<string[]> => {
    await new Promise((resolve) => setImmediate(resolve))
    return (await mounted.terminal.read()).rows
  }
  // A key is typed after the Request is drawn, as a person's key comes after the screen shows it.
  const typed = async (...keys: string[]): Promise<string[]> => {
    await new Promise((resolve) => setImmediate(resolve))
    for (const key of keys) {
      mounted.terminal.type(key)
      await new Promise((resolve) => setImmediate(resolve))
    }
    return rows()
  }
  return { ...mounted, dsh, plugin, rows, typed }
}

const approve = (
  ctx: Context,
  dsh: ReturnType<typeof agents>,
  request: { agent?: object; toolName?: string; callId?: string; reason?: string } = {},
) => {
  const agent = request.agent ?? dsh.agent
  return ctx.waterfall(
    scopeTarget(agent, agent) as never,
    'approval/request',
    { ...request, agent, toolName: request.toolName ?? 'bash' } as never,
    () => Promise.resolve('unavailable' as ApprovalOutcome),
  ) as Promise<ApprovalOutcome>
}

const ask = (ctx: Context, dsh: ReturnType<typeof agents>, questions: readonly AskUserQuestionItem[]) =>
  ctx.waterfall(
    scopeTarget(dsh.agent, dsh.agent) as never,
    'user-questions/request',
    { signal: undefined, questions, agent: dsh.agent } as never,
    () => Promise.reject(new UserQuestionError('no user-questions answerer accepted the request', 'NO_PROVIDER')),
  ) as Promise<AskUserQuestionAnswer>

const DOWN = '\x1b[B'
const UP = '\x1b[A'
const ENTER = '\r'
const ESC = '\x1b'
const PAGE_UP = '\x1b[5~'
const PAGE_DOWN = '\x1b[6~'
const clickAt = (y: number) => `\x1b[<0;3;${y + 1}M`
const wheelDownAt = (y: number) => `\x1b[<65;1;${y + 1}M`
const RULE = '─'.repeat(40)
const ruleWith = (title: string): string => `── ${title} ${'─'.repeat(40 - title.length - 4)}`
const COMPOSER = ['', '', '', '', '', '', '', RULE, ' ', RULE]

const pending = (promise: Promise<unknown>): Promise<unknown> => Promise.race([promise, Promise.resolve('still pending')])
const codeOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    (answer) => answer,
    (error: unknown) => (error instanceof UserQuestionError ? error.code : error),
  )
// A lone escape is told from the start of a sequence once nothing follows it.
const escaped = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 80))

test("a question shows its header and '1 of 3' as a Title, then the question and its detail, then its options as a List with 'Type an answer', and 'Done' where more than one can be chosen; enter or a click picks", async () => {
  const { ctx, dsh, rows, typed, terminal } = await chat({ rows: 12 })
  const answer = ask(ctx, dsh, [
    {
      id: 'q1',
      header: 'Lint',
      question: 'What should the check do?',
      detail: 'The check runs on each file.',
      options: [
        { label: 'Lint', description: 'Runs the linter.' },
        { label: 'Format', description: 'Formats the files.' },
      ],
    },
    { id: 'q2', question: 'Which files?', multiSelect: true, options: [{ label: 'All' }] },
    { id: 'q3', header: 'Last', question: 'Sure?', options: [{ label: 'Yes' }, { label: 'No' }] },
  ])
  assert.deepEqual(await rows(), [
    '',
    '',
    '',
    '',
    '',
    ruleWith('Lint (1 of 3)'),
    'What should the check do?',
    'The check runs on each file.',
    '› Lint — Runs the linter.',
    '  Format — Formats the files.',
    '  Type an answer',
    RULE,
  ])
  assert.deepEqual((await typed(DOWN, ENTER)).slice(-6), [
    ruleWith('2 of 3'),
    'Which files?',
    '› [ ] All',
    '  Type an answer',
    '  Done',
    RULE,
  ])
  await typed(DOWN, DOWN, ENTER)
  const shown = await rows()
  assert.deepEqual(shown.slice(-6), [ruleWith('Last (3 of 3)'), 'Sure?', '› Yes', '  No', '  Type an answer', RULE])
  terminal.type(clickAt(shown.indexOf('Sure?')))
  assert.equal(await pending(answer), 'still pending')
  terminal.type(clickAt(shown.indexOf('  No')))
  assert.deepEqual(await answer, {
    answers: [
      { id: 'q1', selected: ['Format'] },
      { id: 'q2', selected: [] },
      { id: 'q3', selected: ['No'] },
    ],
  })
})

test("in a question that allows more than one, a pick toggles the option's box, 'Done' goes on, and the answers of every question go back together after the last", async () => {
  const { ctx, dsh, rows, typed, terminal } = await chat()
  const answer = ask(ctx, dsh, [
    { id: 'q1', header: 'Checks', question: 'Which?', multiSelect: true, options: [{ label: 'Lint' }, { label: 'Format' }] },
    { id: 'q2', header: 'More', question: 'And?', multiSelect: true, options: [{ label: 'Test' }] },
  ])
  assert.deepEqual((await typed(ENTER)).slice(-5), ['› [x] Lint', '  [ ] Format', '  Type an answer', '  Done', RULE])
  terminal.type(clickAt((await rows()).indexOf('  [ ] Format')))
  assert.deepEqual((await rows()).slice(-5), ['  [x] Lint', '› [x] Format', '  Type an answer', '  Done', RULE])
  assert.deepEqual((await typed(ENTER)).slice(-5), ['  [x] Lint', '› [ ] Format', '  Type an answer', '  Done', RULE])
  assert.deepEqual((await typed(DOWN, DOWN, ENTER)).slice(-5), ['And?', '› [ ] Test', '  Type an answer', '  Done', RULE])
  assert.equal(await pending(answer), 'still pending')
  await typed(ENTER, DOWN, DOWN, ENTER)
  assert.deepEqual(await answer, {
    answers: [
      { id: 'q1', selected: ['Lint'] },
      { id: 'q2', selected: ['Test'] },
    ],
  })
})

test("'Type an answer' opens a Line in the Request, and enter writes what was typed, trimmed, and goes on as a pick does, in a question that allows one or more than one", async () => {
  const { ctx, dsh, rows, typed } = await chat()
  const answer = ask(ctx, dsh, [
    { id: 'q1', header: 'Name', question: 'What?', options: [{ label: 'A' }, { label: 'B' }] },
    { id: 'q2', header: 'Checks', question: 'Which?', multiSelect: true, options: [{ label: 'Lint' }, { label: 'Format' }] },
  ])
  await typed(DOWN, DOWN, ENTER)
  assert.deepEqual((await rows()).slice(-3), ['What?', '›  ', RULE])
  assert.deepEqual((await typed(' ', 'x', ' ', ENTER)).slice(-7), [
    ruleWith('Checks (2 of 2)'),
    'Which?',
    '› [ ] Lint',
    '  [ ] Format',
    '  Type an answer',
    '  Done',
    RULE,
  ])
  await typed(ENTER, DOWN, DOWN, ENTER, 'b', 'o', 't', 'h', ENTER)
  assert.deepEqual(await answer, {
    answers: [
      { id: 'q1', selected: [], custom: 'x' },
      { id: 'q2', selected: ['Lint'], custom: 'both' },
    ],
  })
})

test('an empty typed answer is not written, and the Line stays', async () => {
  const { ctx, dsh, rows, typed } = await chat()
  const answer = ask(ctx, dsh, [{ id: 'q1', question: 'What is it called?', options: [{ label: 'A' }] }])
  await typed(DOWN, ENTER, ' ', ' ', ENTER)
  assert.deepEqual((await rows()).slice(-3), ['What is it called?', '›    ', RULE])
  assert.deepEqual(
    [await pending(answer), ctx.binnacleRequests.shown?.kind === 'question' && ctx.binnacleRequests.shown.drafts[0]],
    ['still pending', { selected: [], custom: undefined }],
  )
})

test('the Line takes the Focus when the person opens it from the Choices, and the Choices take it back when esc closes it, while a Place above the Request takes keys', async () => {
  const above: string[] = []
  const { ctx, dsh, rows, typed } = await chat({
    before: (context) =>
      context.plugin({
        name: 'above',
        inject: ['binnacle'],
        apply: (author: Context) => {
          author.binnacle.place('transcript', {
            lines: () => [''],
            key: (data) => {
              above.push(data)
              return true
            },
          })
        },
      }),
  })
  const answer = ask(ctx, dsh, [{ id: 'q1', question: 'Colour?', options: [{ label: 'Red' }, { label: 'Blue' }] }])
  await rows()
  assert.deepEqual((await typed(DOWN, DOWN, ENTER, 'G')).slice(-3), ['Colour?', '› G ', RULE])
  await typed(ESC)
  await escaped()
  await typed(UP, ENTER)
  assert.deepEqual(above, [])
  assert.deepEqual(await answer, { answers: [{ id: 'q1', selected: ['Blue'] }] })
})

test("esc on the Line goes back to the Choices, with the Line's text and the selected options kept", async () => {
  const { ctx, dsh, rows, typed } = await chat()
  const answer = ask(ctx, dsh, [
    { id: 'q1', header: 'Checks', question: 'Which?', multiSelect: true, options: [{ label: 'Lint' }, { label: 'Format' }] },
  ])
  await typed(ENTER, DOWN, DOWN, ENTER, 'b', 'o', 't', 'h', ESC)
  await escaped()
  assert.deepEqual((await rows()).slice(-5), ['  [x] Lint', '  [ ] Format', '› Type an answer', '  Done', RULE])
  assert.deepEqual((await typed(ENTER)).slice(-3), ['Which?', '› both ', RULE])
  assert.equal(await pending(answer), 'still pending')
})

test('a question with no options opens the Line at once, whether it allows one or more, and esc there dismisses the whole Request', async () => {
  const { ctx, dsh, rows, typed } = await chat()
  const one = codeOf(ask(ctx, dsh, [{ id: 'q1', header: 'Name', question: 'What is it called?' }]))
  assert.deepEqual((await rows()).slice(-4), [ruleWith('Name'), 'What is it called?', '›  ', RULE])
  await typed('x', ESC)
  await escaped()
  assert.equal(await one, 'ASK_CANCELLED')
  const more = ask(ctx, dsh, [{ id: 'q2', question: 'Which?', multiSelect: true }])
  assert.deepEqual((await rows()).slice(-3), ['Which?', '›  ', RULE])
  await typed('y', ENTER)
  assert.deepEqual(await more, { answers: [{ id: 'q2', selected: [], custom: 'y' }] })
})

test("an approval shows its tool, why it asks and its arguments, capped at 12 lines, with 'Allow once' and 'Reject'; a subagent's approval names the subagent", async () => {
  const { ctx, dsh, rows, typed, terminal } = await chat({ rows: 19 })
  const raw = JSON.stringify({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10, k: 11, l: 12, m: 13, n: 14, o: 15 })
  dsh.commit(ctx, { seq: 1, type: 'tool/call', time: 0, data: { turn: 1, step: 1, callId: 'call-1', name: 'bash', arguments: raw } })
  const outcome = approve(ctx, dsh, { callId: 'call-1', reason: 'It runs outside the sandbox.' })
  assert.deepEqual((await rows()).slice(1), [
    ruleWith('bash needs approval'),
    'It runs outside the sandbox.',
    '{',
    '  "a": 1,',
    '  "b": 2,',
    '  "c": 3,',
    '  "d": 4,',
    '  "e": 5,',
    '  "f": 6,',
    '  "g": 7,',
    '  "h": 8,',
    '  "i": 9,',
    '  "j": 10,',
    '  "k": 11,',
    '… and 5 more lines',
    '› Allow once',
    '  Reject',
    RULE,
  ])
  await typed(DOWN, ENTER)
  assert.equal(await outcome, 'rejected')
  const child = { id: 'session-child' }
  bindScopeParent(child, dsh.agent)
  const asked = approve(ctx, dsh, { agent: child })
  const shown = await rows()
  assert.deepEqual(shown.slice(-4), [ruleWith('bash needs approval (session-child)'), '› Allow once', '  Reject', RULE])
  terminal.type(clickAt(shown.indexOf('› Allow once')))
  assert.equal(await asked, 'allowed-once')
})

test('esc on the Choices rejects an approval, or dismisses a question, and the agent learns it; it does not interrupt the turn', async () => {
  const { ctx, dsh, rows, typed } = await chat()
  const outcome = approve(ctx, dsh)
  await typed(ESC)
  await escaped()
  assert.equal(await outcome, 'rejected')
  const answer = codeOf(ask(ctx, dsh, [{ id: 'q1', question: 'Which?', options: [{ label: 'Lint' }] }]))
  await typed(ESC)
  await escaped()
  assert.deepEqual([await answer, dsh.cancels, await rows()], ['ASK_CANCELLED', [], COMPOSER])
})

test('a plan review draws the plan as its detail, with the Choice that approves it first', async () => {
  const { ctx, dsh, rows, typed } = await chat()
  const answer = ask(ctx, dsh, [
    {
      id: 'plan-review',
      header: 'Plan review',
      question: 'Approve this plan?',
      detail: '# Fix the lint\n\nRun the linter.',
      options: [
        { label: 'Keep planning', description: 'Stay here.' },
        { label: 'Approve', description: 'Carry it out.' },
      ],
      intent: { kind: 'plan-review', approve: 'Approve' },
    },
  ])
  assert.deepEqual((await rows()).slice(-9), [
    ruleWith('Plan review'),
    'Approve this plan?',
    '# Fix the lint',
    '',
    'Run the linter.',
    '› Approve — Carry it out.',
    '  Keep planning — Stay here.',
    '  Type an answer',
    RULE,
  ])
  await typed(ENTER)
  assert.deepEqual(await answer, { answers: [{ id: 'plan-review', selected: ['Approve'] }] })
})

test('a Request that comes takes the Focus, and the composer comes back, with its draft, once no Request stands', async () => {
  const { ctx, dsh, typed } = await chat()
  await typed('h', 'i')
  const first = approve(ctx, dsh)
  const second = approve(ctx, dsh, { toolName: 'cargo' })
  assert.deepEqual((await typed('x', ENTER)).slice(-4), [ruleWith('cargo needs approval'), '› Allow once', '  Reject', RULE])
  await typed(ENTER)
  assert.deepEqual([await first, await second], ['allowed-once', 'allowed-once'])
  assert.deepEqual((await typed('!')).slice(-3), [RULE, 'hi! ', RULE])
})

test("a tall Request's question and detail scroll in `request.body`, with the wheel there and with page up and page down from the Choices and the Line, stopping at the first and the last line, and the Choices and the Line stay in view beneath it", async () => {
  const { ctx, dsh, rows, typed, terminal } = await chat({ rows: 8 })
  const detail = Array.from({ length: 12 }, (_, index) => `detail ${index + 1}`)
  const answer = ask(ctx, dsh, [
    { id: 'q1', header: 'Checks', question: 'Which?', detail: detail.join('\n'), options: [{ label: 'Lint' }, { label: 'Format' }] },
  ])
  const body = async (): Promise<string[]> => (await rows()).slice(1, 4)
  const seen = [await body()]
  await typed(PAGE_UP)
  seen.push(await body())
  await typed(PAGE_UP, PAGE_UP, PAGE_UP, PAGE_UP)
  seen.push(await body())
  terminal.type(wheelDownAt(2))
  seen.push(await body())
  await typed(PAGE_DOWN, PAGE_DOWN, PAGE_DOWN, PAGE_DOWN, PAGE_DOWN)
  seen.push(await body())
  await typed(DOWN, DOWN, ENTER, PAGE_UP)
  seen.push((await rows()).slice(1, 6))
  assert.deepEqual(seen, [
    ['detail 10', 'detail 11', 'detail 12'],
    ['detail 7', 'detail 8', 'detail 9'],
    ['Which?', 'detail 1', 'detail 2'],
    ['detail 3', 'detail 4', 'detail 5'],
    ['detail 10', 'detail 11', 'detail 12'],
    ['detail 3', 'detail 4', 'detail 5', 'detail 6', 'detail 7'],
  ])
  assert.deepEqual((await rows()).slice(-2), ['›  ', RULE])
  await typed('x', ENTER)
  assert.deepEqual(await answer, { answers: [{ id: 'q1', selected: [], custom: 'x' }] })
})

test('when the Choices are taller than the room, the question and its detail stay in view above them, and the Choices scroll to the marked one', async () => {
  const { ctx, dsh, rows, typed } = await chat({ rows: 10 })
  const options = Array.from({ length: 12 }, (_, index) => ({ label: `option ${index + 1}`, description: 'a description that wraps here' }))
  ask(ctx, dsh, [{ id: 'q1', header: 'Pick', question: 'Which one?', detail: 'This cannot be undone.', options }])
  const first = await rows()
  assert.deepEqual(first.slice(0, 4), [ruleWith('Pick'), 'Which one?', 'This cannot be undone.', '› option 1 — a description that wraps'])
  assert.equal(first.at(-1), RULE)
  const last = await typed(UP)
  assert.deepEqual(last.slice(0, 3), [ruleWith('Pick'), 'Which one?', 'This cannot be undone.'])
  assert.deepEqual(last.slice(-2), ['› Type an answer', RULE])
})

test('every other key does nothing while the Choices have the Focus: it neither types, interrupts, clears, quits, suspends nor moves the Focus', async () => {
  const { ctx, dsh, typed, exits, process } = await chat()
  const outcome = approve(ctx, dsh)
  const shown = await typed('x', '\x03', '\x03', '\x1a', '\x1b[Z')
  assert.deepEqual(
    [shown.slice(-4), exits, dsh.cancels, process.stopCount, await pending(outcome)],
    [[ruleWith('bash needs approval'), '› Allow once', '  Reject', RULE], [], [], 0, 'still pending'],
  )
  assert.equal(await (await typed(ENTER), outcome), 'allowed-once')
})

test("the List's own page keys are not bound in `request.choices`, and an approval's arguments scroll as a question's detail does", async () => {
  const { ctx, dsh, rows, typed } = await chat({ rows: 6 })
  dsh.commit(ctx, {
    seq: 1,
    type: 'tool/call',
    time: 0,
    data: { turn: 1, step: 1, callId: 'call-1', name: 'bash', arguments: '{"a":1,"b":2,"c":3}' },
  })
  approve(ctx, dsh, { callId: 'call-1' })
  assert.deepEqual(await rows(), [ruleWith('bash needs approval'), '  "c": 3', '}', '› Allow once', '  Reject', RULE])
  assert.deepEqual(await typed(PAGE_UP), [ruleWith('bash needs approval'), '  "a": 1,', '  "b": 2,', '› Allow once', '  Reject', RULE])
  assert.deepEqual([ctx.binnacle.keysOf('request.choices.pageUp'), ctx.binnacle.keysOf('request.choices.pageDown')], [[], []])
})

test('every way the default view sends runs the action `requests.send`, so a plugin that sets it changes what sending does, such as a preview first', async () => {
  const sent: string[] = []
  const { ctx, dsh, typed } = await chat({
    before: (context) =>
      context.plugin({
        name: 'preview',
        inject: ['binnacle', 'binnacleRequests'],
        apply: (author: Context) => {
          author.binnacle.action('requests.send', {
            run: (_at, beneath) => {
              sent.push(String(author.binnacleRequests?.shown?.kind))
              beneath()
            },
          })
        },
      }),
  })
  const approval = approve(ctx, dsh)
  await typed(ENTER)
  assert.equal(await approval, 'allowed-once')
  const multi = ask(ctx, dsh, [{ id: 'q1', question: 'Which?', multiSelect: true, options: [{ label: 'A' }] }])
  await typed(ENTER, DOWN, DOWN, ENTER)
  assert.deepEqual(await multi, { answers: [{ id: 'q1', selected: ['A'] }] })
  const typedAnswer = ask(ctx, dsh, [{ id: 'q2', question: 'What?' }])
  await typed('z', ENTER)
  assert.deepEqual(await typedAnswer, { answers: [{ id: 'q2', selected: [], custom: 'z' }] })
  assert.deepEqual(sent, ['approval', 'question', 'question'])
})

test('a plugin that sends later keeps its Request and sends only it, and two plugins that each set `requests.send` both act', async () => {
  const later: (() => void)[] = []
  const acted: string[] = []
  const { ctx, dsh, typed } = await chat({
    before: async (context) => {
      await context.plugin({
        name: 'answer-every-question',
        inject: ['binnacle', 'binnacleRequests'],
        apply: (author: Context) => {
          author.binnacle.action('requests.send', {
            run: (_at, beneath) => {
              acted.push('every')
              beneath()
            },
          })
        },
      })
      await context.plugin({
        name: 'preview',
        inject: ['binnacle', 'binnacleRequests'],
        apply: (author: Context) => {
          author.binnacle.action('requests.send', {
            run: (_at, beneath) => {
              acted.push('preview')
              const kept = author.binnacleRequests.shown
              later.push(() => {
                if (author.binnacleRequests.shown === kept) beneath()
              })
            },
          })
        },
      })
    },
  })
  const first = approve(ctx, dsh, { toolName: 'bash' })
  const second = approve(ctx, dsh, { toolName: 'cargo' })
  await typed(ENTER)
  assert.equal(await pending(first), 'still pending')
  ;(ctx.binnacleRequests.shown as Request).dismiss()
  assert.equal(await first, 'rejected')
  later.shift()!()
  assert.equal(await pending(second), 'still pending')
  await typed(DOWN, ENTER)
  later.shift()!()
  assert.deepEqual([await second, acted], ['rejected', ['preview', 'preview', 'every']])
})

test("the default view is the Layout `request`, drawn in the Chat with the composer `unless: 'request'`, and an author builds on `REQUEST_LAYOUT` to add one Place", async () => {
  const { ctx, dsh, rows } = await chat({
    rows: 6,
    before: (context) =>
      context.plugin({
        name: 'tabs',
        inject: ['binnacle', 'binnacleRequests'],
        apply: (author: Context) => {
          author.binnacle.layout('request', { ...REQUEST_LAYOUT, column: [{ place: 'request.tabs' }, ...REQUEST_LAYOUT.column] })
          author.binnacle.place('request.tabs', {
            models: [author.binnacleRequests],
            lines: () => (author.binnacleRequests.shown === undefined ? [] : [`tab ${keyOf(author.binnacleRequests.shown)}`]),
          })
        },
      }),
  })
  approve(ctx, dsh)
  const shown = await rows()
  assert.match(shown[1]!, /^tab \d+:0$/)
  assert.deepEqual(shown.slice(2), [ruleWith('bash needs approval'), '› Allow once', '  Reject', RULE])
  pick(ctx.binnacle, ctx.binnacleRequests.shown!, 1)
  assert.deepEqual((await rows()).slice(-3), [RULE, ' ', RULE])
})

test('a plugin that focuses its own Place while `requests.send` runs keeps the Focus when the Line closes, and another Request that comes takes it', async () => {
  const keys: string[] = []
  const { ctx, dsh, typed } = await chat({
    rows: 12,
    before: (context) =>
      context.plugin({
        name: 'preview',
        inject: ['binnacle', 'binnacleRequests'],
        apply: (author: Context) => {
          const model = author.binnacleRequests
          author.binnacle.layout('request', { ...REQUEST_LAYOUT, column: [...REQUEST_LAYOUT.column, { place: 'request.preview' }] })
          author.binnacle.place('request.preview', {
            models: [model],
            lines: () => (model.shown === undefined ? [] : ['preview']),
            key: (data) => {
              keys.push(data)
              if (data === ENTER) model.shown?.submit()
              return true
            },
          })
          author.binnacle.action('requests.send', {
            run: (_at, beneath) => {
              const shown = model.shown
              if (shown?.kind !== 'question') return beneath()
              author.binnacle.focus('request.preview')
              shown.type(false)
            },
          })
        },
      }),
  })
  const answer = ask(ctx, dsh, [{ id: 'q1', question: 'What?', options: [{ label: 'A' }] }])
  const next = approve(ctx, dsh)
  await typed(DOWN, ENTER, 'z', ENTER, 'k', ENTER)
  assert.deepEqual(keys, ['k', ENTER])
  assert.deepEqual(await answer, { answers: [{ id: 'q1', selected: [], custom: 'z' }] })
  await typed(DOWN, ENTER)
  assert.deepEqual(keys, ['k', ENTER])
  assert.equal(await next, 'rejected')
})
