/**
 * The session the host opens: the command grant over dsh's own commands.
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
