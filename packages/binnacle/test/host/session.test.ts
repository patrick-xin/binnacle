/**
 * The session the host opens: the dsh calls a sent line and an interrupt make, and the command grant over dsh's own commands.
 *
 * The agents and their sessions are faked, as the host's tests fake them,
 * but the commands are dsh's own `CommandRuntime`, mounted for real: the
 * grant's contract — it resolves whether a command ran, whatever the command
 * returned — is held against what dsh's executor really does, not a
 * restatement of it.
 * @module binnacle/test/host/session
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import commands from '@deepseek-ai/dsh-commands'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { openSession } from '../../src/host/session.ts'
import type { OpenedSession } from '../../src/host/session.ts'

/** The events dsh's executor logs, as it logs them: through the agent's session. */
const logged: SessionEvent[] = []
let seq = 0

/** The agents the host opens a session through, faked: each holds one idle agent whose session records what dsh appends. */
const agents = {
  async create(): Promise<{ readonly agent: object, readonly dispose: () => Promise<void> }> {
    const agent = {
      session: {
        snapshotEvents: (): readonly SessionEvent[] => [],
        append: (type: string, data: unknown): SessionEvent => {
          const event = { type, seq: seq++, time: 0, data } as SessionEvent
          logged.push(event)
          return event
        },
      },
      steer: (_text: string): void => {},
      status: 'idle',
      cancel: (): void => {},
    }
    return { agent, dispose: async () => {} }
  },
}

/**
 * Open a session over dsh's own commands, on the default model.
 * @returns the open session, and dsh's command registry.
 */
async function opened(): Promise<{ readonly session: OpenedSession, readonly registry: Context['commands'] }> {
  const ctx = new Context()
  await ctx.plugin(commands)
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4' }) } as never)
  ctx.provide('agents', agents as never)
  return { session: await openSession(ctx), registry: ctx.commands }
}

test('a command whose handler threw still ran: dsh logs its failure as its done, and the grant resolves true', async () => {
  const { session, registry } = await opened()
  registry.register({ name: 'boom', description: 'goes bang', handler: () => { throw new Error('kaput') } })
  assert.equal(await session.command('/boom now'), true)
  assert.deepEqual(logged.map(event => event.type), ['command/run', 'command/done'])
  const done = logged.at(-1)
  assert.ok(done !== undefined && done.type === 'command/done')
  // dsh pairs the done with its run by an id it minted; what the grant hands a person is the pair, not the id.
  const { commandId: _commandId, ...failure } = done.data as { readonly commandId: unknown, readonly kind: unknown, readonly text: unknown }
  assert.deepEqual(failure, { kind: 'error', text: 'kaput' })
})

test('a line naming no command resolves false, and nothing is logged', async () => {
  const { session } = await opened()
  logged.length = 0
  assert.equal(await session.command('/nothing here'), false)
  assert.deepEqual(logged, [])
})

/** Every way a line can reach the agent, as dsh names the call, with what it was handed. */
interface Sent {
  readonly method: 'steer' | 'followup' | 'inject'
  readonly message: UserMessage
}

test('a line sent steers the agent with the person\'s message; interrupt cancels as the user, keeping the inbox', async () => {
  const ctx = new Context()
  const sent: Sent[] = []
  const cancels: { readonly cause: unknown, readonly options: unknown }[] = []
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4' }) } as never)
  ctx.provide('agents', {
    create: async () => ({
      agent: {
        session: {},
        get status() { return 'idle' as const },
        steer: (message: UserMessage) => { sent.push({ method: 'steer', message }) },
        followup: (message: UserMessage) => { sent.push({ method: 'followup', message }) },
        inject: (message: UserMessage) => { sent.push({ method: 'inject', message }) },
        cancel: (cause: unknown, options: unknown) => { cancels.push({ cause, options }) },
      },
      dispose: async () => {},
    }),
  } as never)
  const session = await openSession(ctx)
  session.send('use pnpm')
  session.interrupt()
  // The line reaches the agent once, by steer — a follow-up would wait the turn out — as a user message of the
  // person's text; its id is dsh's own, minted fresh, so only its presence is asserted.
  assert.equal(sent.length, 1)
  const line = sent[0]
  assert.ok(line !== undefined, 'the line was sent once')
  assert.equal(line.method, 'steer')
  assert.equal(line.message.role, 'user')
  assert.deepEqual(line.message.content, [{ type: 'text', text: 'use pnpm' }])
  assert.deepEqual(line.message.source, { kind: 'user' })
  assert.equal(typeof line.message.id, 'string')
  assert.deepEqual(cancels, [{ cause: { kind: 'user' }, options: { keepInbox: true } }])
})

test('where the session stands names the agents it delegated to: each one\'s label and mode, whether it works, and when its open turn began', async () => {
  const ctx = new Context()
  const parent = { requestHeader: () => undefined }
  const childSession = {}
  // The projections dsh's registry answers, by the session asked about: the parent's catalog of its children, and a
  // child's timing, whose open turn began at 1500.
  const values = new Map<object, Record<string, unknown>>([
    [parent, { subagentCatalog: [{ id: 'child-1', createdAt: 10, mode: 'continuable', label: 'tests' }, { id: 'child-2', createdAt: 20, mode: 'one-shot' }] }],
    [childSession, { subagentTiming: { settledMs: 0, active: { since: 1500, through: 1600 } } }],
  ])
  ctx.provide('sessionProjections', {
    snapshot: (session: object, keys: readonly string[]) => ({ values: Object.fromEntries(keys.flatMap(key => { const value = values.get(session)?.[key]; return value === undefined ? [] : [[key, value]] })) }),
  } as never)
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4' }) } as never)
  ctx.provide('commands', {} as never)
  // Only the first child is live, and working; the second, a one-shot child, has finished and left the registry.
  const live = new Map<string, object>([['child-1', { status: 'running', session: childSession }]])
  ctx.provide('agents', {
    create: async () => ({ agent: { session: parent, status: 'idle' }, dispose: async () => {} }),
    get: (id: string) => live.get(id),
  } as never)
  const session = await openSession(ctx)
  assert.deepEqual(session.standing().agents, [
    { id: 'child-1', label: 'tests', mode: 'continuable', working: true, since: 1500 },
    { id: 'child-2', mode: 'one-shot', working: false },
  ])
})

test('where the session stands is heard again as an agent it delegated to flips, or logs, and not as another session logs', async () => {
  const ctx = new Context()
  const parent = { id: 'parent' }
  const child = { id: 'child-1' }
  const stranger = { id: 'elsewhere' }
  ctx.provide('sessionProjections', { snapshot: () => ({ values: {} }) } as never)
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4' }) } as never)
  ctx.provide('commands', {} as never)
  ctx.provide('agents', {
    create: async () => ({ agent: { session: parent, status: 'idle' }, dispose: async () => {} }),
    get: () => undefined,
    isOwnedBy: (id: string) => id === 'child-1',
  } as never)
  const session = await openSession(ctx)
  let heard = 0
  session.onStanding(() => { heard++ })
  // dsh emits these on the agent's scope carrier; the root hears them as it hears every agent's, so the root emits here.
  const emit = ctx.emit.bind(ctx) as (name: string, ...args: unknown[]) => void
  emit('agent/status', { agent: { session: child }, status: 'running' })
  assert.equal(heard, 1, 'a child\'s status flipping is heard')
  emit('session/event', child, { type: 'turn/start' })
  assert.equal(heard, 2, 'a child logging is heard')
  emit('session/event', stranger, { type: 'turn/start' })
  assert.equal(heard, 2, 'another session logging is not')
})
