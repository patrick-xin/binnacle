import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import type { ClockState, TurnState } from '../src/api.ts'
import * as statusLine from '../src/plugins/status-line/index.ts'
import type { SegmentLook } from '../src/plugins/status-line/index.ts'
import { agents } from './support/agents.ts'
import { mount } from './support/mount.ts'
import { persistence } from './support/sessions.ts'

const settled = () => new Promise((resolve) => setImmediate(resolve))

async function opened(columns = 30, rows = 2) {
  const dsh = agents()
  const mounted = await mount({ columns, rows, provide: dsh.provide })
  mounted.ready()
  await settled()
  const turn = () => mounted.ctx.binnacle.modelOf<TurnState>('turn').state?.startedAt
  return { ...mounted, dsh, turn }
}

const turnStart = (seq: number, time: number, turn: number) => ({ seq, type: 'turn/start', time, data: { turn } })
const turnEnd = (seq: number, time: number, turn: number) => ({ seq, type: 'turn/end', time, data: { turn, reason: 'completed' } })

test("the model `turn` holds when the turn that runs started, from dsh's `turn/start`, a queued turn's too, and nothing while the agent is idle", async () => {
  const { ctx, dsh, clock, turn } = await opened()
  const idle = turn()
  await clock.pass(1000)
  dsh.status(ctx, 'running')
  const running = turn()
  dsh.commit(ctx, turnStart(1, 1500, 1))
  const started = turn()
  dsh.commit(ctx, turnEnd(2, 8000, 1))
  const ended = turn()
  dsh.commit(ctx, turnStart(3, 9000, 2))
  const queued = turn()
  dsh.status(ctx, 'idle')
  assert.deepEqual([idle, running, started, ended, queued, turn()], [undefined, 1000, 1500, 1500, 9000, undefined])
})

test("a plugin that loads while a turn runs reads that turn's `startedAt`, and a stored session's is `undefined`", async () => {
  const { ctx, dsh } = await opened()
  dsh.status(ctx, 'running')
  dsh.commit(ctx, turnStart(1, 4200, 1))
  let read: number | undefined
  await ctx.plugin({
    name: 'late',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      read = plugin.binnacle.modelOf<TurnState>('turn').state?.startedAt
    },
  })
  const store = persistence([{ id: 'session-stored', createdAt: 1, events: [turnStart(1, 100, 1)] }])
  const stored = await mount({ args: ['--session', 'session-stored'], provide: (each) => each.provide('sessionPersistence', store) })
  stored.ready()
  await settled()
  assert.deepEqual([read, stored.ctx.binnacle.modelOf<TurnState>('turn').state?.startedAt], [4200, undefined])
})

test("a session that opens while a turn runs takes that turn's start from its events", async () => {
  const dsh = agents()
  const mounted = await mount({
    provide: (ctx) => {
      const fake: Record<string, { create: (options: never) => Promise<unknown> }> = {}
      dsh.provide({ provide: (name: string, value: never) => (fake[name] = value) } as never)
      ctx.provide('agentDefaultModel', fake.agentDefaultModel as never)
      // The session commits its first events while it is made, as a session that a turn had begun on does.
      ctx.provide('agents', {
        create: async (options: never) => {
          const made = await fake.agents!.create(options)
          dsh.agent.status = 'running'
          dsh.commit(ctx, turnStart(1, 777, 1))
          return made
        },
      } as never)
    },
  })
  mounted.ready()
  await settled()
  assert.equal(mounted.ctx.binnacle.modelOf<TurnState>('turn').state?.startedAt, 777)
})

// AUTHORING.md's example: how long the turn has run, after the state.
const elapsed = {
  name: 'elapsed',
  inject: ['binnacle'],
  apply: (ctx: Context) => {
    const turn = ctx.binnacle.modelOf<TurnState>('turn')
    const clock = ctx.binnacle.modelOf<ClockState>('clock')
    ctx.binnacle.look<SegmentLook>(
      'status.state',
      (beneath) => (value) => {
        const startedAt = turn.state?.startedAt
        if (startedAt === undefined) return beneath(value)
        const seconds = Math.max(0, Math.floor(((clock.state?.now ?? startedAt) - startedAt) / 1000))
        return `${beneath(value)} ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
      },
      { models: [turn, clock] },
    )
  },
}

test("AUTHORING.md's status line shows how long the turn has run after the state, and nothing while the agent is idle or after the turn ends", async () => {
  const { ctx, dsh, clock, terminal } = await opened(30, 2)
  await ctx.plugin(statusLine)
  await ctx.plugin(elapsed)
  await settled()
  const idle = (await terminal.read()).rows[1]
  dsh.status(ctx, 'running')
  dsh.commit(ctx, turnStart(1, clock.now, 1))
  await clock.pass(65_000)
  const running = (await terminal.read()).rows[1]
  dsh.commit(ctx, turnStart(2, clock.now - 3_665_000, 2))
  await clock.pass(1000)
  const long = (await terminal.read()).rows[1]
  dsh.commit(ctx, turnEnd(3, clock.now, 2))
  dsh.status(ctx, 'idle')
  await settled()
  assert.deepEqual(
    [idle, running, long, (await terminal.read()).rows[1]],
    ['idle · deepseek-v4', 'running 1:05 · deepseek-v4', 'running 61:06 · deepseek-v4', 'idle · deepseek-v4'],
  )
})

test("AUTHORING.md's elapsed time is `0:00` while the clock is earlier than the turn's start", async () => {
  const { ctx, dsh, clock, terminal } = await opened(30, 2)
  await ctx.plugin(statusLine)
  await ctx.plugin(elapsed)
  dsh.status(ctx, 'running')
  dsh.commit(ctx, turnStart(1, clock.now + 5000, 1))
  await settled()
  assert.equal((await terminal.read()).rows[1], 'running 0:00 · deepseek-v4')
})
