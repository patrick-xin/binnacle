import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import { createModel } from '../src/index.ts'
import type { Model } from '../src/index.ts'
import { mount } from './support/mount.ts'

const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

test("a model's watchers learn of a change after it is made, once for the changes made together, never while it is made", async () => {
  const model = createModel({ count: 0 })
  const told: number[] = []
  model.watch(() => {
    told.push(model.state.count)
    if (model.state.count === 2) model.set((state) => void (state.count = 3))
  })
  model.set((state) => {
    state.count = 1
    model.set((inner) => void (inner.count += 1))
    told.push(-1)
  })
  const whileMade = [...told]
  await settled()
  assert.deepEqual([whileMade, told], [[-1], [-1, 2, 3]])
})

test('a Part that lists its models is drawn again after each of them changes', async () => {
  const { ctx, terminal, ready } = await mount({ columns: 20, rows: 3 })
  ready()
  const greeting = createModel({ text: 'hello' })
  const name = createModel({ text: 'world' })
  await ctx.plugin({
    name: 'greeter',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.place('transcript', {
        models: [greeting, name],
        lines: () => [`${greeting.state.text} ${name.state.text}`],
      })
    },
  })
  const seen = [(await terminal.read()).rows[0]]
  greeting.set((state) => void (state.text = 'goodbye'))
  await settled()
  seen.push((await terminal.read()).rows[0])
  name.set((state) => void (state.text = 'moon'))
  await settled()
  seen.push((await terminal.read()).rows[0])
  assert.deepEqual(seen, ['hello world', 'goodbye world', 'goodbye moon'])
})

test('a model named with binnacle.model is found by its name with binnacle.modelOf, until the plugin that named it unloads', async () => {
  const { ctx } = await mount()
  const model = createModel({ mark: 0 })
  const fiber = ctx.plugin({
    name: 'namer',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.model('picker', model)
    },
  })
  await fiber
  const found: (Model<{ mark: number }> | undefined)[] = [ctx.binnacle.modelOf('picker'), ctx.binnacle.modelOf('other')]
  await fiber.dispose()
  found.push(ctx.binnacle.modelOf('picker'))
  assert.deepEqual(found, [model, undefined, undefined])
})

test('a watcher that stops and watches again in its own call is told once for one change', async () => {
  const model = createModel({ count: 0 })
  let calls = 0
  let stop: (() => void) | undefined
  const changed = (): void => {
    calls += 1
    stop?.()
    if (calls < 3) stop = model.watch(changed)
  }
  stop = model.watch(changed)
  model.set((state) => void (state.count = 1))
  await settled()
  assert.equal(calls, 1)
})

test('a Model named twice by one name goes only with the plugin whose naming unloads, and the one beneath it is found again', async () => {
  const { ctx } = await mount()
  const shared = createModel({ who: 'shared' })
  const middle = createModel({ who: 'middle' })
  const namer = (name: string, model: Model<{ who: string }>) =>
    ctx.plugin({
      name,
      inject: ['binnacle'],
      apply: (plugin: Context) => {
        plugin.binnacle.model('item', model)
      },
    })
  await namer('first', shared)
  await namer('second', middle)
  const third = namer('third', shared)
  await third
  await third.dispose()
  assert.equal(ctx.binnacle.modelOf<{ who: string }>('item')?.state.who, 'middle')
})
