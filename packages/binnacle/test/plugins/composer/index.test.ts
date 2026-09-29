/**
 * The Composer: what a submitted line does, at the registration it places.
 *
 * The plugin is applied over the real registration service in a Cordis
 * context, as an author's would be, and its placement's `submit` is called
 * with the session's grants opened and closed as the test decides — for the
 * composer's line is async where a session is not: a command settles after
 * the submit returned, and the session may be gone by then.
 * @module binnacle/test/plugins/composer
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { RegistrationService } from '../../../src/host/registrations.ts'
import { composer } from '../../../src/plugins/composer/index.ts'

test('a line naming no command whose session closes under it sends nothing and rejects nothing', async () => {
  const ctx = new Context()
  const registrations = new RegistrationService(ctx)
  await ctx.plugin(composer)
  const placed = registrations.placed('composer').at(-1)
  assert.ok(placed?.kind === 'composer')

  // The session the grants are open on: its command settles only when the test says, and its send refuses as one closed.
  const gate: { resolve?: (ran: boolean) => void } = {}
  const sent: string[] = []
  const close = registrations.open({
    send: (text) => { sent.push(text); throw new Error('binnacle.send: no session is open') },
    command: () => new Promise<boolean>(resolve => { gate.resolve = resolve }),
    agent: {} as Agent,
  })

  // What the process holds against a plugin that leaves a rejection unhandled: heard here, so the test can name it.
  const unhandled: unknown[] = []
  const heard = (reason: unknown): void => { unhandled.push(reason) }
  process.on('unhandledRejection', heard)
  try {
    placed.submit('/nothing here')
    close()
    gate.resolve?.(false)
    await new Promise(resolve => setTimeout(resolve, 20))
  } finally {
    process.off('unhandledRejection', heard)
  }
  assert.deepEqual(unhandled, [])
  assert.deepEqual(sent, [])
})
