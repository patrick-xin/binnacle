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

test('where the session stands is heard again as the agent\'s status flips, which dsh says only after the turn\'s last event is logged', async () => {
  const ctx = new Context()
  const agentCtx = new Context()
  const agent = { session: {} }
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4' }) } as never)
  ctx.provide('agents', {
    create: async (options: { readonly setup: (agentCtx: Context) => void }) => {
      options.setup(agentCtx)
      return { agent, dispose: async () => {} }
    },
  } as never)
  const session = await openSession(ctx)
  let heard = 0
  const stop = session.onStanding(() => { heard++ })
  agentCtx.emit('agent/status', { agent: agent as never, status: 'idle' })
  assert.equal(heard, 1)
  stop()
  agentCtx.emit('agent/status', { agent: agent as never, status: 'running' })
  assert.equal(heard, 1)
})

test('following a session hears what it logged before, then what it logs after, each once and in order, and nothing of another session', async () => {
  const ctx = new Context()
  const earlier = { type: 'turn/start', seq: 1, time: 0, data: {} } as unknown as SessionEvent
  const later = { type: 'turn/end', seq: 2, time: 0, data: {} } as unknown as SessionEvent
  const log = { snapshotEvents: (): readonly SessionEvent[] => [earlier] }
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4' }) } as never)
  ctx.provide('agents', { create: async () => ({ agent: { session: log }, dispose: async () => {} }) } as never)
  const session = await openSession(ctx)
  const heard: SessionEvent[] = []
  session.follow((event) => { heard.push(event) })
  ctx.emit('session/event', log as never, later)
  ctx.emit('session/event', {} as never, earlier)
  assert.deepEqual(heard, [earlier, later])
})

test('following a session misses nothing logged while what was logged before is being heard, and hears each event once', async () => {
  const ctx = new Context()
  const first = { type: 'turn/start', seq: 1, time: 0, data: {} } as unknown as SessionEvent
  const during = { type: 'turn/end', seq: 2, time: 0, data: {} } as unknown as SessionEvent
  const log = { snapshotEvents: (): readonly SessionEvent[] => [first] }
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4' }) } as never)
  ctx.provide('agents', { create: async () => ({ agent: { session: log }, dispose: async () => {} }) } as never)
  const session = await openSession(ctx)
  const heard: SessionEvent[] = []
  session.follow((event) => {
    heard.push(event)
    // What a listener does on hearing the first event logs the next, before the replay is over.
    if (event === first) ctx.emit('session/event', log as never, during)
  })
  assert.deepEqual(heard, [first, during])
})

test('an event both in the log as it is read and on the feed is heard once', async () => {
  const ctx = new Context()
  const first = { type: 'turn/start', seq: 1, time: 0, data: {} } as unknown as SessionEvent
  // dsh announces an event as it appends it, so one appended as the log is read reaches the listener twice over.
  const log = {
    snapshotEvents: (): readonly SessionEvent[] => {
      ctx.emit('session/event', log as never, first)
      return [first]
    },
  }
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4' }) } as never)
  ctx.provide('agents', { create: async () => ({ agent: { session: log }, dispose: async () => {} }) } as never)
  const session = await openSession(ctx)
  const heard: SessionEvent[] = []
  session.follow((event) => { heard.push(event) })
  assert.deepEqual(heard, [first])
})

test('the answer streaming is heard for the session\'s own agent, and never for another', async () => {
  const ctx = new Context()
  const agent = { session: { snapshotEvents: (): readonly SessionEvent[] => [] } }
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4' }) } as never)
  ctx.provide('agents', { create: async () => ({ agent, dispose: async () => {} }) } as never)
  const session = await openSession(ctx)
  const heard: unknown[] = []
  const stop = session.onStream((frame) => { heard.push(frame) })
  const own = { type: 'start', attemptId: 'a1', revision: 1, turn: 1, step: 1 }
  ctx.emit('agent/assistant-stream', { agent: agent as never, frame: own as never })
  ctx.emit('agent/assistant-stream', { agent: { session: {} } as never, frame: { ...own, attemptId: 'a2' } as never })
  stop()
  ctx.emit('agent/assistant-stream', { agent: agent as never, frame: { ...own, attemptId: 'a3' } as never })
  assert.deepEqual(heard, [own])
})
