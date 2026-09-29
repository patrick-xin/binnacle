import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { openSession } from '../../src/host/session.ts'

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
