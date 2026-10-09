import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import { bindScopeParent, scopeTarget } from '@deepseek-ai/dsh-scope'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import { UserQuestionError } from '@deepseek-ai/dsh-user-questions'
import type { AskUserQuestionAnswer, AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions'
import type { ApprovalRequest, QuestionRequest, Request } from '../../src/api.ts'
import * as requests from '../../src/plugins/requests/index.ts'
import { agents } from '../support/agents.ts'
import { mount } from '../support/mount.ts'
import { persistence } from '../support/sessions.ts'

async function chat(options: { provide?: (ctx: Context) => void; args?: string[]; attached?: boolean } = {}) {
  const dsh = agents()
  const mounted = await mount({ args: options.args ?? [], provide: options.provide ?? dsh.provide })
  mounted.ready()
  const model = await mounted.ctx.plugin(requests)
  await new Promise((resolve) => setImmediate(resolve))
  const standing = mounted.ctx.binnacleRequests
  const detach = options.attached === false ? () => {} : standing.attach()
  return { ...mounted, dsh, model, standing, detach }
}

const approve = (
  ctx: Context,
  dsh: ReturnType<typeof agents>,
  request: { toolName?: string; signal?: AbortSignal; agent?: object } = {},
) => {
  const agent = request.agent ?? dsh.agent
  return ctx.waterfall(
    scopeTarget(agent, agent) as never,
    'approval/request',
    { ...request, agent, toolName: request.toolName ?? 'bash' } as never,
    () => Promise.resolve('unavailable' as ApprovalOutcome),
  ) as Promise<ApprovalOutcome>
}

const ask = (ctx: Context, dsh: ReturnType<typeof agents>, questions: readonly AskUserQuestionItem[], signal?: AbortSignal) =>
  ctx.waterfall(
    scopeTarget(dsh.agent, dsh.agent) as never,
    'user-questions/request',
    { signal, questions, agent: dsh.agent } as never,
    () => Promise.reject(new UserQuestionError('no user-questions answerer accepted the request', 'NO_PROVIDER')),
  ) as Promise<AskUserQuestionAnswer>

const pending = async (promise: Promise<unknown>): Promise<unknown> => Promise.race([promise, Promise.resolve('still pending')])

const codeOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    (answer) => answer,
    (error: unknown) => (error instanceof UserQuestionError ? error.code : error),
  )

const question = (shown: Request | undefined): QuestionRequest => {
  assert.equal(shown?.kind, 'question')
  return shown as QuestionRequest
}

const approval = (shown: Request | undefined): ApprovalRequest => {
  assert.equal(shown?.kind, 'approval')
  return shown as ApprovalRequest
}

test('a second Request waits until the first is answered, in the order they came', async () => {
  const { ctx, dsh, standing } = await chat()
  const first = approve(ctx, dsh, { toolName: 'bash' })
  const second = ask(ctx, dsh, [{ id: 'q1', question: 'Two?' }])
  assert.deepEqual([approval(standing.shown).tool, standing.standing], ['bash', 2])
  approval(standing.shown).choose('allowed-once')
  approval(standing.shown).submit()
  assert.equal(await first, 'allowed-once')
  assert.deepEqual([question(standing.shown).questions[0]!.question, standing.standing], ['Two?', 1])
  assert.equal(await pending(second), 'still pending')
})

test('a Request dsh withdraws goes, whether it is on view or waits', async () => {
  const { ctx, dsh, standing } = await chat()
  const onView = new AbortController()
  const waits = new AbortController()
  const shown = approve(ctx, dsh, { toolName: 'bash', signal: onView.signal })
  const waiting = codeOf(ask(ctx, dsh, [{ id: 'q1', question: 'Two?' }], waits.signal))
  const last = approve(ctx, dsh, { toolName: 'cargo' })
  waits.abort()
  assert.equal(await waiting, 'ASK_ABORTED')
  assert.deepEqual([approval(standing.shown).tool, standing.standing], ['bash', 2])
  onView.abort()
  assert.equal(await shown, 'cancelled')
  assert.deepEqual([approval(standing.shown).tool, standing.standing], ['cargo', 1])
  assert.equal(await pending(last), 'still pending')
})

test("when the model's row unloads, an approval that still stands fails closed, and a question is dismissed", async () => {
  const { ctx, dsh, model } = await chat()
  const tool = approve(ctx, dsh)
  const asked = codeOf(ask(ctx, dsh, [{ id: 'q1', question: 'One?' }]))
  await model.dispose()
  assert.deepEqual([await tool, await asked], ['unavailable', 'ASK_CANCELLED'])
})

test('a stored session has no Requests: each goes on to dsh, which fails it closed', async () => {
  const store = persistence([{ id: 'session-stored', createdAt: 1, events: [] }])
  const { ctx, dsh, standing } = await chat({
    provide: (context) => context.provide('sessionPersistence', store),
    args: ['--session', 'session-stored'],
  })
  const tool = approve(ctx, dsh, { agent: { id: 'session-anyone' } })
  assert.deepEqual([await tool, standing.standing], ['unavailable', 0])
})

test("with no view attached, a Request goes on to dsh's own fallback, which fails it closed", async () => {
  const { ctx, dsh, standing } = await chat({ attached: false })
  const tool = approve(ctx, dsh)
  const asked = codeOf(ask(ctx, dsh, [{ id: 'q1', question: 'One?' }]))
  assert.deepEqual([await tool, await asked, standing.standing], ['unavailable', 'NO_PROVIDER', 0])
})

test('a Request that stands when the last view detaches fails closed as on unload, and stands while another view is attached', async () => {
  const { ctx, dsh, standing, detach } = await chat()
  const other = standing.attach()
  const tool = approve(ctx, dsh)
  const asked = codeOf(ask(ctx, dsh, [{ id: 'q1', question: 'One?' }]))
  other()
  other()
  assert.deepEqual([await pending(tool), standing.standing], ['still pending', 2])
  detach()
  assert.deepEqual([await tool, await asked, standing.standing], ['unavailable', 'ASK_CANCELLED', 0])
})

test('a Request that has gone, withdrawn, answered, dismissed or failed, ignores every call made on it after', async () => {
  const { ctx, dsh, standing, detach } = await chat()
  const withdrawn = new AbortController()
  const gone = codeOf(ask(ctx, dsh, [{ id: 'q1', question: 'One?', options: [{ label: 'A' }] }], withdrawn.signal))
  const asked = question(standing.shown)
  withdrawn.abort()
  assert.equal(await gone, 'ASK_ABORTED')
  const tool = approve(ctx, dsh)
  const answered = approval(standing.shown)
  answered.dismiss()
  assert.equal(await tool, 'rejected')
  const next = approve(ctx, dsh, { toolName: 'cargo' })
  await new Promise((resolve) => setImmediate(resolve))
  let told = 0
  standing.watch(() => told++)
  asked.toggle('A')
  asked.write('typed')
  asked.type(true)
  asked.submit()
  asked.dismiss()
  answered.choose('allowed-once')
  answered.submit()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(
    [asked.drafts[0], asked.typing, answered.chosen, told, approval(standing.shown).tool],
    [{ selected: [], custom: undefined }, false, undefined, 0, 'cargo'],
  )
  detach()
  assert.equal(await next, 'unavailable')
})

test('ctx.binnacleRequests gives the Request on view, how many stand, and a watch that runs after a change, never while it is made', async () => {
  const { ctx, dsh, standing } = await chat()
  const seen: string[] = []
  const stop = standing.watch(() => seen.push(`${standing.shown?.kind} ${standing.standing}`))
  approve(ctx, dsh)
  ask(ctx, dsh, [{ id: 'q1', question: 'One?' }])
  assert.deepEqual([seen, standing.standing], [[], 2])
  await new Promise((resolve) => setImmediate(resolve))
  stop()
  approval(standing.shown).dismiss()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual([seen, standing.shown?.kind], [['approval 2'], 'question'])
})

test("a question's draft changes with toggle, write, go and type, and sends nothing until submit, which sends every question's draft", async () => {
  const { ctx, dsh, standing } = await chat()
  const answer = ask(ctx, dsh, [
    { id: 'one', question: 'One?', options: [{ label: 'A' }, { label: 'B' }] },
    { id: 'many', question: 'Many?', multiSelect: true, options: [{ label: 'X' }, { label: 'Y' }] },
    { id: 'typed', question: 'Typed?' },
  ])
  const asked = question(standing.shown)
  asked.toggle('A')
  asked.toggle('B')
  asked.go(1)
  asked.toggle('X')
  asked.toggle('Y')
  asked.toggle('X')
  asked.type(true)
  asked.write('  and Z  ')
  asked.go(2)
  const typing = asked.typing
  asked.write('   ')
  assert.deepEqual([await pending(answer), asked.index, typing], ['still pending', 2, true])
  asked.go(0)
  asked.write('my own')
  asked.submit()
  assert.deepEqual(await answer, {
    answers: [
      { id: 'one', selected: [], custom: 'my own' },
      { id: 'many', selected: ['Y'], custom: 'and Z' },
      { id: 'typed', selected: [] },
    ],
  })
})

test('in a question that allows one, a toggle is the only answer: it takes back the typed answer, and the same toggle unselects it', async () => {
  const { ctx, dsh, standing } = await chat()
  const answer = ask(ctx, dsh, [{ id: 'one', question: 'One?', options: [{ label: 'A' }, { label: 'B' }] }])
  const asked = question(standing.shown)
  asked.write('typed')
  asked.toggle('A')
  const one = structuredClone(asked.drafts[0])
  asked.toggle('A')
  const none = structuredClone(asked.drafts[0])
  asked.toggle('B')
  asked.submit()
  assert.deepEqual(
    [one, none, await answer],
    [{ selected: ['A'], custom: undefined }, { selected: [], custom: undefined }, { answers: [{ id: 'one', selected: ['B'] }] }],
  )
})

test("a question's Choices are its options, then a typed answer, then done where more than one can be chosen; an option keeps its label as the agent offered it, and its text is plain", async () => {
  const { ctx, dsh, standing } = await chat()
  const red = '\x1b[31mLint\x1b[0m'
  const answer = ask(ctx, dsh, [
    {
      id: 'many',
      header: '\x1b[1mChecks',
      question: 'Which?',
      multiSelect: true,
      options: [{ label: red, description: 'Runs \x1b[2mit' }],
    },
    { id: 'none', question: 'Why?' },
  ])
  const asked = question(standing.shown)
  assert.deepEqual(asked.questions[0]!.choices, [
    { kind: 'option', label: red, text: 'Lint', description: 'Runs it' },
    { kind: 'other' },
    { kind: 'done' },
  ])
  assert.deepEqual([asked.questions[0]!.header, asked.questions[1]!.choices, asked.typing], ['Checks', [], false])
  asked.toggle(red)
  asked.go(1)
  assert.equal(asked.typing, true)
  asked.submit()
  assert.deepEqual(await answer, {
    answers: [
      { id: 'many', selected: [red] },
      { id: 'none', selected: [] },
    ],
  })
})

test("an approval's choose changes its draft and sends nothing; submit sends the outcome chosen, and with none chosen, nothing", async () => {
  const { ctx, dsh, standing } = await chat()
  const tool = approve(ctx, dsh)
  const asked = approval(standing.shown)
  asked.submit()
  asked.choose('allowed-once')
  asked.choose('rejected')
  assert.deepEqual([await pending(tool), asked.chosen, asked.choices], ['still pending', 'rejected', ['allowed-once', 'rejected']])
  asked.submit()
  assert.equal(await tool, 'rejected')
})

test('dismiss answers dsh: an approval is rejected, and a question is dismissed with ASK_CANCELLED', async () => {
  const { ctx, dsh, standing } = await chat()
  const tool = approve(ctx, dsh)
  const asked = codeOf(ask(ctx, dsh, [{ id: 'q1', question: 'One?' }]))
  approval(standing.shown).dismiss()
  question(standing.shown).dismiss()
  assert.deepEqual([await tool, await asked], ['rejected', 'ASK_CANCELLED'])
})

test("an approval for an agent under the Chat's names that agent, and one for the Chat's own agent names none", async () => {
  const { ctx, dsh, standing } = await chat()
  const child = { id: 'session-child' }
  bindScopeParent(child, dsh.agent)
  approve(ctx, dsh)
  approve(ctx, dsh, { agent: child })
  const own = approval(standing.shown)
  own.dismiss()
  assert.deepEqual([own.agent, approval(standing.shown).agent], [undefined, 'session-child'])
})
