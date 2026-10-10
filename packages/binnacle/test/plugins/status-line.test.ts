import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import type { Binnacle } from '../../src/api.ts'
import * as statusLine from '../../src/plugins/status-line/index.ts'
import { STATUS_LAYOUT } from '../../src/plugins/status-line/index.ts'
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

async function booted(columns: number, author: (binnacle: Binnacle) => void = () => {}) {
  const dsh = agents()
  const mounted = await mount({ columns, rows: 2, provide: dsh.provide })
  mounted.ready()
  await mounted.ctx.plugin(statusLine)
  await mounted.ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (ctx: Context) => {
      author(ctx.binnacle)
    },
  })
  await settled()
  return { ...mounted, dsh }
}

test("the status line is the Layout `status`, the separated row `STATUS_LAYOUT` in the Chat: an author inserts a segment after `status.model`, and it is joined by ' · '", async () => {
  const { terminal } = await booted(40, (binnacle) => {
    binnacle.edit('status', { insert: { place: 'cwd' }, after: 'status.model' })
    binnacle.place('cwd', { lines: () => ['binnacle'] })
  })
  const inserted = (await terminal.read()).rows
  const built = await booted(40, (binnacle) => {
    binnacle.layout('status', { ...STATUS_LAYOUT, row: STATUS_LAYOUT.row.toReversed() })
  })
  assert.deepEqual(
    [inserted, (await built.terminal.read()).rows],
    [
      ['', 'idle · deepseek-v4 · binnacle'],
      ['', 'deepseek-v4 · idle'],
    ],
  )
})

test("each segment draws through the Look by its Place's name, given its value: setting `status.state` draws `running` in the accent colour, and only that segment changes", async () => {
  const { ctx, dsh, terminal } = await booted(40, (binnacle) => {
    binnacle.look<(value: string) => string>(
      'status.state',
      (beneath) => (value) => (value === 'running' ? binnacle.paint('accent', value) : beneath(value)),
    )
  })
  const idle = [await terminal.colourAt(0, 1), (await terminal.read()).rows]
  dsh.status(ctx, 'running')
  const running = [await terminal.colourAt(0, 1), await terminal.colourAt(10, 1), (await terminal.read()).rows]
  assert.deepEqual(
    [idle, running],
    [
      ['default', ['', 'idle · deepseek-v4']],
      [6, 'default', ['', 'running · deepseek-v4']],
    ],
  )
})

test('a status line wider than the terminal is cut at its end with `…`, and never wraps; too narrow for `…`, it draws empty', async () => {
  const { terminal } = await booted(10)
  const narrow = await booted(2, (binnacle) => binnacle.theme({ glyphs: { more: '...' } }))
  assert.deepEqual(
    [(await terminal.read()).rows, (await narrow.terminal.read()).rows],
    [
      ['', 'idle · de…'],
      ['', ''],
    ],
  )
})

test("the agent's status and model are made plain before they are drawn", async () => {
  const { ctx, dsh, terminal } = await booted(40)
  dsh.agent.options = { provider: 'deepseek', model: '\x1b[31mdeep\x07seek' }
  dsh.status(ctx, 'running')
  assert.deepEqual([(await terminal.read()).rows, await terminal.colourAt(10, 1)], [['', 'running · deepseek'], 'default'])
})
