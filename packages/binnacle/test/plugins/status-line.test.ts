import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as statusLine from '../../src/plugins/status-line/index.ts'
import { mount } from '../support/mount.ts'
import { agents } from '../support/agents.ts'
import { persistence } from '../support/sessions.ts'

const settled = () => new Promise((resolve) => setImmediate(resolve))

test("the status line shows whether the agent runs, and its model, as the agent's status changes", async () => {
  const dsh = agents()
  const { ctx, ready, terminal } = await mount({ columns: 30, rows: 2, provide: dsh.provide })
  ready()
  await ctx.plugin(statusLine)
  await settled()
  const idle = (await terminal.read()).rows
  dsh.status(ctx, 'running')
  assert.deepEqual(
    [idle, (await terminal.read()).rows],
    [
      ['', 'idle · deepseek-v4'],
      ['', 'running · deepseek-v4'],
    ],
  )
})

test('on a stored session, the status line says that it is read only, and which session it is', async () => {
  const store = persistence([{ id: 'session-stored', createdAt: 1, events: [] }])
  const { ctx, ready, terminal } = await mount({
    args: ['--session', 'session-stored'],
    columns: 30,
    rows: 2,
    provide: (each) => each.provide('sessionPersistence', store),
  })
  ready()
  await ctx.plugin(statusLine)
  await settled()
  assert.deepEqual((await terminal.read()).rows, ['', 'read only · session-stored'])
})
