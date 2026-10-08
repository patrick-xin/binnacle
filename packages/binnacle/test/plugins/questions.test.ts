import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import { bindScopeParent, scopeTarget } from '@deepseek-ai/dsh-scope'
import { UserQuestionError } from '@deepseek-ai/dsh-user-questions'
import type { AskUserQuestionAnswer, AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions'
import * as approvals from '../../src/plugins/approvals/index.ts'
import * as composer from '../../src/plugins/composer/index.ts'
import * as questions from '../../src/plugins/questions/index.ts'
import { agents } from '../support/agents.ts'
import { mount } from '../support/mount.ts'
import { persistence } from '../support/sessions.ts'

async function chat(
  options: { columns?: number; rows?: number; provide?: (ctx: Context) => void; args?: string[]; withApprovals?: boolean } = {},
) {
  const dsh = agents()
  const mounted = await mount({
    args: options.args ?? [],
    columns: options.columns ?? 40,
    rows: options.rows ?? 10,
    provide: options.provide ?? dsh.provide,
  })
  mounted.ready()
  await mounted.ctx.plugin(composer)
  const plugin = await mounted.ctx.plugin(questions)
  const approvalPlugin = options.withApprovals === true ? await mounted.ctx.plugin(approvals) : undefined
  // The session opens after the core loads; let it settle.
  await new Promise((resolve) => setImmediate(resolve))
  const rows = async (): Promise<string[]> => {
    await new Promise((resolve) => setImmediate(resolve))
    return (await mounted.terminal.read()).rows
  }
  const typed = async (...keys: string[]): Promise<string[]> => {
    for (const key of keys) mounted.terminal.type(key)
    return rows()
  }
  return { ...mounted, dsh, plugin, approvalPlugin, rows, typed }
}

interface Ask {
  agent?: object
  questions: readonly AskUserQuestionItem[]
  signal?: AbortSignal
}

// As dsh's UserQuestionService dispatches it: through the agent's scope, with the fallback that no answerer took it.
const ask = (ctx: Context, dsh: ReturnType<typeof agents>, request: Ask): Promise<AskUserQuestionAnswer> => {
  const agent = request.agent ?? dsh.agent
  return ctx.waterfall(
    scopeTarget(agent, agent) as never,
    'user-questions/request',
    { signal: undefined, ...request, agent } as never,
    () => Promise.reject(new UserQuestionError('no user-questions answerer accepted the request', 'NO_PROVIDER')),
  ) as Promise<AskUserQuestionAnswer>
}

const RULE = '─'.repeat(40)
const ruleWith = (title: string): string => title + '─'.repeat(40 - title.length)

test("when the agent asks a question, a Request takes the composer's Place: the header as its title, the question, its detail, and each option as a Choice with its description", async () => {
  const { ctx, dsh, rows } = await chat()
  const answer = ask(ctx, dsh, {
    questions: [
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
    ],
  })
  assert.deepEqual(await rows(), [
    '',
    '',
    '',
    ruleWith('── Lint ──'),
    'What should the check do?',
    'The check runs on each file.',
    '› Lint — Runs the linter.',
    '  Format — Formats the files.',
    '  Type an answer',
    RULE,
  ])
  assert.equal(await Promise.race([answer, Promise.resolve('still pending')]), 'still pending')
})

test('enter picks the marked Choice and the answer goes back to the agent, and up and down move the mark, from the last Choice to the first', async () => {
  const { ctx, dsh, typed } = await chat()
  await typed('h', 'e')
  const answer = ask(ctx, dsh, {
    questions: [{ id: 'q1', header: 'Lint', question: 'Which?', options: [{ label: 'Lint' }, { label: 'Format' }] }],
  })
  assert.deepEqual((await typed('\x1b[A')).slice(-4), ['  Lint', '  Format', '› Type an answer', RULE])
  assert.deepEqual((await typed('\x1b[B')).slice(-4), ['› Lint', '  Format', '  Type an answer', RULE])
  assert.deepEqual((await typed('\x1b[B')).slice(-4), ['  Lint', '› Format', '  Type an answer', RULE])
  assert.deepEqual(await (await typed('\r'), answer), { answers: [{ id: 'q1', selected: ['Format'] }] })
  assert.deepEqual(await typed('!'), ['', '', '', '', '', '', '', RULE, 'he! ', RULE])
})

test('a click on a Choice picks it, and a click on another line of the Request does nothing', async () => {
  const { ctx, dsh, terminal, rows } = await chat()
  const answer = ask(ctx, dsh, {
    questions: [{ id: 'q1', header: 'Lint', question: 'Which?', options: [{ label: 'Lint' }, { label: 'Format' }] }],
  })
  const shown = await rows()
  const formatAt = shown.findIndex((row) => row === '  Format')
  const titleAt = shown.findIndex((row) => row.includes('── Lint ──'))
  terminal.type(`\x1b[<0;1;${titleAt + 1}M`)
  assert.equal(await Promise.race([answer, Promise.resolve('still pending')]), 'still pending')
  terminal.type(`\x1b[<0;1;${formatAt + 1}M`)
  assert.deepEqual(await answer, { answers: [{ id: 'q1', selected: ['Format'] }] })
})

test("in a question that allows more than one Choice, enter or a click selects or unselects the Choice and moves the mark there, and 'Done' sends what is selected, or the question as skipped with nothing selected", async () => {
  const { ctx, dsh, terminal, typed, rows } = await chat()
  const answer = ask(ctx, dsh, {
    questions: [{ id: 'q1', header: 'Checks', question: 'Which?', multiSelect: true, options: [{ label: 'Lint' }, { label: 'Format' }] }],
  })
  assert.deepEqual((await typed('\r')).slice(-5), ['› [x] Lint', '  [ ] Format', '  Type an answer', '  Done', RULE])
  const formatAt = (await rows()).findIndex((row) => row === '› [x] Lint') + 1
  terminal.type(`\x1b[<0;1;${formatAt + 1}M`)
  assert.deepEqual((await rows()).slice(-5), ['  [x] Lint', '› [x] Format', '  Type an answer', '  Done', RULE])
  await typed('\r')
  assert.deepEqual((await rows()).slice(-5), ['  [x] Lint', '› [ ] Format', '  Type an answer', '  Done', RULE])
  await typed('\x1b[B', '\x1b[B', '\r')
  assert.deepEqual(await answer, { answers: [{ id: 'q1', selected: ['Lint'] }] })
  const skipped = ask(ctx, dsh, {
    questions: [{ id: 'q2', header: 'Checks', question: 'Which?', multiSelect: true, options: [{ label: 'Lint' }, { label: 'Format' }] }],
  })
  await typed('\x1b[B', '\x1b[B', '\x1b[B', '\r')
  assert.deepEqual(await skipped, { answers: [{ id: 'q2', selected: [] }] })
})

test("the Choice 'Type an answer' opens a line in the box: enter sends what was typed, and esc goes back to the Choices with the line's text and the selected Choices kept", async () => {
  const { ctx, dsh, rows, typed } = await chat()
  const answer = ask(ctx, dsh, {
    questions: [{ id: 'q1', header: 'Checks', question: 'Which?', multiSelect: true, options: [{ label: 'Lint' }, { label: 'Format' }] }],
  })
  await typed('\r')
  await typed('\x1b[B', '\x1b[B', '\r')
  assert.deepEqual((await rows()).slice(-3), ['Which?', '> '.padEnd(40), RULE])
  await typed('b', 'o', 't', 'h')
  await typed('\x1b')
  // A lone escape is told from the start of a sequence once nothing follows it.
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.deepEqual((await rows()).slice(-5), ['  [x] Lint', '  [ ] Format', '› Type an answer', '  Done', RULE])
  await typed('\r')
  assert.deepEqual((await rows()).slice(-3), ['Which?', '> both'.padEnd(40), RULE])
  await typed('\r')
  assert.deepEqual(await answer, { answers: [{ id: 'q1', selected: ['Lint'], custom: 'both' }] })
  const single = ask(ctx, dsh, {
    questions: [{ id: 'q2', header: 'Name', question: 'What?', options: [{ label: 'A' }, { label: 'B' }] }],
  })
  await typed('\x1b[B', '\x1b[B', '\r', 'c', 'u', 's', 't', 'o', 'm', '\r')
  assert.deepEqual(await single, { answers: [{ id: 'q2', selected: [], custom: 'custom' }] })
})

test('a question with no options opens the line at once, and esc there dismisses the whole Request', async () => {
  const { ctx, dsh, rows, typed } = await chat()
  const answer = ask(ctx, dsh, { questions: [{ id: 'q1', header: 'Name', question: 'What is it called?' }] })
  const settled = answer.catch((error: unknown) => error)
  assert.deepEqual((await rows()).slice(-3), ['What is it called?', '> '.padEnd(40), RULE])
  await typed('x')
  await typed('\x1b')
  // A lone escape is told from the start of a sequence once nothing follows it.
  await new Promise((resolve) => setTimeout(resolve, 80))
  const error = await settled
  assert.ok(error instanceof UserQuestionError && error.code === 'ASK_CANCELLED')
  assert.deepEqual(await rows(), ['', '', '', '', '', '', '', RULE, ' ', RULE])
})

test('a typed answer that is empty, or only blanks, is not sent, and the line stays open; what is sent is trimmed at both ends', async () => {
  const { ctx, dsh, rows, typed } = await chat()
  const answer = ask(ctx, dsh, { questions: [{ id: 'q1', question: 'What is it called?' }] })
  await typed('\r')
  assert.deepEqual((await rows()).slice(-3), ['What is it called?', '> '.padEnd(40), RULE])
  assert.equal(await Promise.race([answer, Promise.resolve('still pending')]), 'still pending')
  await typed(' ', ' ', '\r')
  assert.deepEqual((await rows()).slice(-3), ['What is it called?', '>   '.padEnd(40), RULE])
  assert.equal(await Promise.race([answer, Promise.resolve('still pending')]), 'still pending')
  await typed(' ', 'x', ' ', '\r')
  assert.deepEqual(await answer, { answers: [{ id: 'q1', selected: [], custom: 'x' }] })
})

test('in a Request taller than its Place the marked Choice stays in view, page up and page down move through the question and its detail, and any other key goes back to the mark', async () => {
  const { ctx, dsh, rows, typed } = await chat({ columns: 40, rows: 8 })
  const detail = Array.from({ length: 12 }, (_, index) => `detail line ${index + 1}`)
  const answer = ask(ctx, dsh, {
    questions: [
      {
        id: 'q1',
        header: 'Checks',
        question: 'Which check runs on each file?',
        detail: detail.join('\n'),
        options: [{ label: 'Lint' }, { label: 'Format' }],
      },
    ],
  })
  assert.deepEqual(await rows(), [
    'detail line 9',
    'detail line 10',
    'detail line 11',
    'detail line 12',
    '› Lint',
    '  Format',
    '  Type an answer',
    '─'.repeat(40),
  ])
  await typed('\x1b[5~')
  assert.deepEqual(await rows(), [
    'detail line 3',
    'detail line 4',
    'detail line 5',
    'detail line 6',
    'detail line 7',
    'detail line 8',
    'detail line 9',
    'detail line 10',
  ])
  await typed('\x1b[6~')
  assert.deepEqual((await rows()).at(-1), '─'.repeat(40))
  assert.deepEqual((await rows()).includes('› Lint'), true)
  await typed('\x1b[B')
  assert.deepEqual((await rows()).includes('› Format'), true)
  await typed('\r')
  assert.deepEqual(await answer, { answers: [{ id: 'q1', selected: ['Format'] }] })
})

test("when a Request holds several questions they come one after another, with '1 of 3' in the title, and their answers go back together", async () => {
  const { ctx, dsh, rows, typed } = await chat()
  const answer = ask(ctx, dsh, {
    questions: [
      { id: 'q1', header: 'First', question: 'One?', options: [{ label: 'A' }, { label: 'B' }] },
      { id: 'q2', question: 'Two?', options: [{ label: 'C' }] },
      { id: 'q3', header: 'Third', question: 'Three?' },
    ],
  })
  assert.deepEqual((await rows()).slice(-6), [ruleWith('── First (1 of 3) ──'), 'One?', '› A', '  B', '  Type an answer', RULE])
  await typed('\r')
  assert.deepEqual((await rows()).slice(-5), [ruleWith('── 2 of 3 ──'), 'Two?', '› C', '  Type an answer', RULE])
  await typed('\x1b[B', '\r', 'c', '\r')
  assert.deepEqual((await rows()).slice(-3), ['Three?', '> '.padEnd(40), RULE])
  await typed('d', '\r')
  assert.deepEqual(await answer, {
    answers: [
      { id: 'q1', selected: ['A'] },
      { id: 'q2', selected: [], custom: 'c' },
      { id: 'q3', selected: [], custom: 'd' },
    ],
  })
})

test('esc on the Choices dismisses the whole Request, the agent learns that the person dismissed it, and the turn is not interrupted', async () => {
  const {
    ctx,
    dsh,
    dsh: { cancels },
    rows,
    typed,
  } = await chat()
  const answer = ask(ctx, dsh, { questions: [{ id: 'q1', header: 'Lint', question: 'Which?', options: [{ label: 'Lint' }] }] })
  const settled = answer.catch((error: unknown) => error)
  await typed('\x1b')
  // A lone escape is told from the start of a sequence once nothing follows it.
  await new Promise((resolve) => setTimeout(resolve, 80))
  const error = await settled
  assert.ok(error instanceof UserQuestionError && error.code === 'ASK_CANCELLED')
  assert.deepEqual(cancels, [])
  assert.deepEqual(await rows(), ['', '', '', '', '', '', '', RULE, ' ', RULE])
})

test("the answer carries each Choice's label as the agent offered it, and only the drawn text is made plain", async () => {
  const { ctx, dsh, rows, typed } = await chat()
  const offered = '\x1b[31mApprove\x1b[0m'
  const answer = ask(ctx, dsh, {
    questions: [
      {
        id: 'q1',
        header: 'Review',
        question: 'Approve this plan?',
        detail: 'the plan',
        options: [{ label: offered }],
        intent: { kind: 'plan-review', approve: offered },
      },
    ],
  })
  assert.deepEqual((await rows()).slice(-4), ['the plan', '› Approve', '  Type an answer', RULE])
  await typed('\r')
  assert.deepEqual(await answer, { answers: [{ id: 'q1', selected: [offered] }] })
  const multi = ask(ctx, dsh, {
    questions: [
      {
        id: 'q2',
        header: 'Checks',
        question: 'Which?',
        multiSelect: true,
        options: [{ label: '\x1b[31mLint\x1b[0m' }, { label: 'Format' }],
      },
    ],
  })
  assert.deepEqual((await rows()).slice(-5), ['› [ ] Lint', '  [ ] Format', '  Type an answer', '  Done', RULE])
  await typed('\r', '\x1b[B', '\x1b[B', '\x1b[B', '\r')
  assert.deepEqual(await multi, { answers: [{ id: 'q2', selected: ['\x1b[31mLint\x1b[0m'] }] })
})

test("page down past the end stops at the Request's last line, so a page up moves back up through the detail, with the Choices shown and with the typed line open", async () => {
  const detail = Array.from({ length: 25 }, (_, index) => `detail line ${index + 1}`)
  const { ctx, dsh, rows, typed } = await chat({ columns: 40, rows: 8 })
  const withChoices = ask(ctx, dsh, {
    questions: [
      { id: 'q1', header: 'Checks', question: 'Which?', detail: detail.join('\n'), options: [{ label: 'Lint' }, { label: 'Format' }] },
    ],
  })
  await typed('\x1b[6~', '\x1b[6~', '\x1b[6~', '\x1b[6~', '\x1b[6~', '\x1b[5~')
  assert.deepEqual(await rows(), [
    'detail line 19',
    'detail line 20',
    'detail line 21',
    'detail line 22',
    'detail line 23',
    'detail line 24',
    'detail line 25',
    '› Lint',
  ])
  await typed('\r')
  assert.deepEqual(await withChoices, { answers: [{ id: 'q1', selected: ['Lint'] }] })
  const withLine = ask(ctx, dsh, { questions: [{ id: 'q2', header: 'Name', question: 'What?', detail: detail.join('\n') }] })
  await typed('\x1b[6~', '\x1b[6~', '\x1b[6~', '\x1b[6~', '\x1b[6~', '\x1b[5~')
  assert.deepEqual(await rows(), [
    'detail line 17',
    'detail line 18',
    'detail line 19',
    'detail line 20',
    'detail line 21',
    'detail line 22',
    'detail line 23',
    'detail line 24',
  ])
  await typed('x', '\r')
  assert.deepEqual(await withLine, { answers: [{ id: 'q2', selected: [], custom: 'x' }] })
})

test('enter after paging returns to the marked Choice: a multi-select toggle and the opened typed line stay in view', async () => {
  const detail = Array.from({ length: 25 }, (_, index) => `detail line ${index + 1}`)
  const { ctx, dsh, rows, typed } = await chat({ columns: 40, rows: 8 })
  const multi = ask(ctx, dsh, {
    questions: [
      {
        id: 'q1',
        header: 'Checks',
        question: 'Which?',
        multiSelect: true,
        detail: detail.join('\n'),
        options: [{ label: 'Lint' }, { label: 'Format' }],
      },
    ],
  })
  await typed('\x1b[5~', '\r')
  assert.deepEqual((await rows()).at(-5), '› [x] Lint')
  await typed('\x1b[B', '\x1b[B', '\x1b[B', '\r')
  assert.deepEqual(await multi, { answers: [{ id: 'q1', selected: ['Lint'] }] })
  const typedLine = ask(ctx, dsh, {
    questions: [{ id: 'q2', header: 'Name', question: 'What?', detail: detail.join('\n'), options: [{ label: 'A' }, { label: 'B' }] }],
  })
  await typed('\x1b[B', '\x1b[B', '\x1b[5~', '\r')
  assert.deepEqual((await rows()).at(-2), '> '.padEnd(40))
  await typed('y', '\r')
  assert.deepEqual(await typedLine, { answers: [{ id: 'q2', selected: [], custom: 'y' }] })
})

test('in a plan review the plan is the detail as plain text, and the Choice that approves it is first', async () => {
  const { ctx, dsh, rows, typed } = await chat()
  const answer = ask(ctx, dsh, {
    questions: [
      {
        id: 'plan-review',
        header: 'Plan review',
        question: 'Approve this plan and leave plan mode?',
        detail: '# Fix the lint\n\nRun the linter on each file.',
        options: [
          { label: 'Keep planning', description: 'Stay here.' },
          { label: 'Approve', description: 'Carry the plan out.' },
        ],
        intent: { kind: 'plan-review', approve: 'Approve' },
      },
    ],
  })
  assert.deepEqual((await rows()).slice(-8), [
    'Approve this plan and leave plan mode?',
    '# Fix the lint',
    '',
    'Run the linter on each file.',
    '› Approve — Carry the plan out.',
    '  Keep planning — Stay here.',
    '  Type an answer',
    RULE,
  ])
  assert.deepEqual(await (await typed('\r'), answer), {
    answers: [{ id: 'plan-review', selected: ['Approve'] }],
  })
})

test('when dsh withdraws a Request it goes with ASK_ABORTED, whether it is shown or waits in the queue, and the next Request is shown', async () => {
  const { ctx, dsh, rows } = await chat()
  const first = new AbortController()
  const second = new AbortController()
  const shown = ask(ctx, dsh, { questions: [{ id: 'a', header: 'First', question: 'One?' }], signal: first.signal })
  const waiting = ask(ctx, dsh, { questions: [{ id: 'b', header: 'Second', question: 'Two?' }], signal: second.signal })
  const settledShown = shown.catch((error: unknown) => error)
  const settledWaiting = waiting.catch((error: unknown) => error)
  assert.deepEqual(
    (await rows()).some((row) => row.includes('── First ──')),
    true,
  )
  second.abort()
  const waitingError = await settledWaiting
  assert.ok(waitingError instanceof UserQuestionError && waitingError.code === 'ASK_ABORTED')
  assert.deepEqual(
    (await rows()).some((row) => row.includes('── First ──')),
    true,
  )
  first.abort()
  const shownError = await settledShown
  assert.ok(shownError instanceof UserQuestionError && shownError.code === 'ASK_ABORTED')
  assert.deepEqual(await rows(), ['', '', '', '', '', '', '', RULE, ' ', RULE])
})

test('a Request whose signal aborted before the waterfall dispatches it is answered ASK_ABORTED, never shown, and does not block the next', async () => {
  const { ctx, dsh, rows, typed } = await chat()
  const withdrawn = new AbortController()
  withdrawn.abort()
  const gone = ask(ctx, dsh, { questions: [{ id: 'a', header: 'First', question: 'One?' }], signal: withdrawn.signal })
  const settled = gone.catch((error: unknown) => error)
  assert.deepEqual(await rows(), ['', '', '', '', '', '', '', RULE, ' ', RULE])
  const error = await settled
  assert.ok(error instanceof UserQuestionError && error.code === 'ASK_ABORTED')
  const next = ask(ctx, dsh, { questions: [{ id: 'b', header: 'Second', question: 'Two?' }] })
  assert.deepEqual(
    (await rows()).some((row) => row.includes('── Second ──')),
    true,
  )
  await typed('\r', 'y', 'e', 's', '\r')
  assert.deepEqual(await next, { answers: [{ id: 'b', selected: [], custom: 'yes' }] })
})

test('a question and an approval share one queue: a Request waits until the one before it is answered, whichever plugin asked it', async () => {
  const { ctx, dsh, rows, typed } = await chat({ withApprovals: true })
  dsh.commit(ctx, {
    seq: 1,
    type: 'tool/call',
    time: 0,
    data: { turn: 1, step: 1, callId: 'call-1', name: 'bash', arguments: '{}' },
  })
  const approval = ctx.waterfall(
    scopeTarget(dsh.agent, dsh.agent) as never,
    'approval/request',
    { agent: dsh.agent, toolName: 'bash', callId: 'call-1' } as never,
    () => Promise.resolve('unavailable' as ApprovalOutcome),
  ) as Promise<ApprovalOutcome>
  const question = ask(ctx, dsh, { questions: [{ id: 'q1', header: 'Second', question: 'Two?' }] })
  assert.deepEqual(
    [(await rows()).some((row) => row.includes('needs approval')), (await rows()).some((row) => row.includes('── Second ──'))],
    [true, false],
  )
  await typed('\r')
  assert.equal(await approval, 'allowed-once')
  assert.deepEqual(
    [(await rows()).some((row) => row.includes('needs approval')), (await rows()).some((row) => row.includes('── Second ──'))],
    [false, true],
  )
  assert.equal(await Promise.race([question, Promise.resolve('still pending')]), 'still pending')
  await typed('n', 'o', '\r')
  assert.deepEqual(await question, { answers: [{ id: 'q1', selected: [], custom: 'no' }] })
})

test('a second question waits until the first is answered, and questions are shown in the order they came', async () => {
  const { ctx, dsh, rows, typed } = await chat()
  const first = ask(ctx, dsh, { questions: [{ id: 'a', header: 'First', question: 'One?' }] })
  const second = ask(ctx, dsh, { questions: [{ id: 'b', header: 'Second', question: 'Two?' }] })
  assert.deepEqual(
    [(await rows()).some((row) => row.includes('── First ──')), (await rows()).some((row) => row.includes('── Second ──'))],
    [true, false],
  )
  await typed('1', '\r')
  assert.deepEqual(await first, { answers: [{ id: 'a', selected: [], custom: '1' }] })
  assert.deepEqual(
    [(await rows()).some((row) => row.includes('── First ──')), (await rows()).some((row) => row.includes('── Second ──'))],
    [false, true],
  )
  assert.equal(await Promise.race([second, Promise.resolve('still pending')]), 'still pending')
})

test("when one plugin of the shared queue unloads, its Requests go and the other plugin's Request is shown", async () => {
  const { ctx, dsh, approvalPlugin, rows, typed } = await chat({ withApprovals: true })
  dsh.commit(ctx, {
    seq: 1,
    type: 'tool/call',
    time: 0,
    data: { turn: 1, step: 1, callId: 'call-1', name: 'bash', arguments: '{}' },
  })
  const approval = ctx.waterfall(
    scopeTarget(dsh.agent, dsh.agent) as never,
    'approval/request',
    { agent: dsh.agent, toolName: 'bash', callId: 'call-1' } as never,
    () => Promise.resolve('unavailable' as ApprovalOutcome),
  ) as Promise<ApprovalOutcome>
  const question = ask(ctx, dsh, { questions: [{ id: 'q1', header: 'Second', question: 'Two?' }] })
  assert.deepEqual(
    (await rows()).some((row) => row.includes('needs approval')),
    true,
  )
  await approvalPlugin!.dispose()
  assert.equal(await approval, 'unavailable')
  assert.deepEqual(
    (await rows()).some((row) => row.includes('── Second ──')),
    true,
  )
  await typed('n', 'o', '\r')
  assert.deepEqual(await question, { answers: [{ id: 'q1', selected: [], custom: 'no' }] })
})

test('when the plugin unloads, each Request that still stands is dismissed with ASK_CANCELLED', async () => {
  const { ctx, dsh, plugin, rows } = await chat()
  const shown = ask(ctx, dsh, { questions: [{ id: 'a', header: 'First', question: 'One?' }] })
  const waiting = ask(ctx, dsh, { questions: [{ id: 'b', header: 'Second', question: 'Two?' }] })
  const settledShown = shown.catch((error: unknown) => error)
  const settledWaiting = waiting.catch((error: unknown) => error)
  await plugin.dispose()
  for (const settled of [await settledShown, await settledWaiting]) {
    assert.ok(settled instanceof UserQuestionError && settled.code === 'ASK_CANCELLED')
  }
  assert.deepEqual(await rows(), ['', '', '', '', '', '', '', RULE, ' ', RULE])
})

test("a Request for an agent under the Chat's is answered; one for an agent that is not the Chat's and not under it is not answered", async () => {
  const { ctx, dsh, rows, typed } = await chat()
  const child = { id: 'session-child' }
  bindScopeParent(child, dsh.agent)
  const asked = ask(ctx, dsh, { agent: child, questions: [{ id: 'a', header: 'Child', question: 'One?' }] })
  assert.deepEqual(
    (await rows()).some((row) => row.includes('── Child ──')),
    true,
  )
  await typed('y', 'e', 's', '\r')
  assert.deepEqual(await asked, { answers: [{ id: 'a', selected: [], custom: 'yes' }] })
  const other = ask(ctx, dsh, { agent: { id: 'session-other' }, questions: [{ id: 'b', header: 'Other', question: 'Two?' }] })
  await assert.rejects(other, (error: unknown) => error instanceof UserQuestionError && error.code === 'NO_PROVIDER')
  assert.deepEqual(await rows(), ['', '', '', '', '', '', '', RULE, ' ', RULE])
})

test('on a stored session the plugin registers nothing, and a Request finds no answerer', async () => {
  const store = persistence([{ id: 'session-stored', createdAt: 1, events: [] }])
  const { ctx, dsh, rows } = await chat({
    provide: (context) => context.provide('sessionPersistence', store),
    args: ['--session', 'session-stored'],
  })
  const outcome = ask(ctx, dsh, { agent: { id: 'session-anyone' }, questions: [{ id: 'a', header: 'Any', question: 'One?' }] })
  await assert.rejects(outcome, (error: unknown) => error instanceof UserQuestionError && error.code === 'NO_PROVIDER')
  assert.deepEqual(await rows(), ['', '', '', '', '', '', '', RULE, ' ', RULE])
})
