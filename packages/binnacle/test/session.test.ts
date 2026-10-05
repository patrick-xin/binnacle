import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mount } from './support/mount.ts'
import { agents, SELECTION } from './support/agents.ts'
import { persistence } from './support/sessions.ts'

const settled = () => new Promise((resolve) => setImmediate(resolve))

test("with no session named, binnacle opens a new session on dsh's default model, in the working directory", async () => {
  const dsh = agents()
  await mount({ provide: dsh.provide })
  await settled()
  assert.deepEqual(
    dsh.created.map(({ sessionId, meta, agentOptions }) => ({ id: /^session-[\da-f-]{36}$/.test(sessionId), meta, agentOptions })),
    [{ id: true, meta: { cwd: process.cwd() }, agentOptions: SELECTION }],
  )
})

test('a session that --session names is read from the store, read-only, and no agent is opened', async () => {
  const dsh = agents()
  const store = persistence([{ id: 'session-stored', createdAt: 1, events: [] }])
  const { ctx } = await mount({
    args: ['--session', 'session-stored'],
    provide: (each) => {
      dsh.provide(each)
      each.provide('sessionPersistence', store)
    },
  })
  await settled()
  assert.deepEqual([store.opened, dsh.created, ctx.get('binnacleSession')?.agent], [['session-stored'], [], undefined])
})

test('a session that --session names and the store cannot read is printed, with why, and binnacle exits 1', async () => {
  const store = persistence([])
  const { exits, printed, ready, fiber } = await mount({
    args: ['--session', 'session-gone'],
    provide: (ctx) => ctx.provide('sessionPersistence', store),
  })
  ready()
  await settled()
  // The launcher unloads the tree on an exit, and the terminal is given back.
  await fiber.dispose()
  assert.deepEqual([exits, printed], [[1], ['stderr: binnacle: could not read session-gone: no session session-gone\n']])
})
