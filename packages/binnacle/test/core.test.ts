import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import { mount } from './support/mount.ts'

test('binnacle takes the alternate screen, raw mode and the mouse when dsh is ready, and gives them back when it unloads', async () => {
  const { terminal, ready, fiber } = await mount()
  assert.equal((await terminal.read()).screen, 'normal')
  ready()
  assert.deepEqual(await terminal.read().then(({ screen, mouse }) => ({ screen, mouse, raw: terminal.raw })), {
    screen: 'alternate',
    mouse: 'vt200',
    raw: true,
  })
  await fiber.dispose()
  assert.deepEqual(await terminal.read().then(({ screen, mouse }) => ({ screen, mouse, raw: terminal.raw })), {
    screen: 'normal',
    mouse: 'none',
    raw: false,
  })
})

test('a screen that a plugin shows is drawn line by line, each line wrapped at the width', async () => {
  const { ctx, terminal, ready } = await mount({ columns: 20, rows: 6 })
  ready()
  await ctx.plugin({
    name: 'probe',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.show({ lines: () => ['first', 'a line too long for twenty columns', 'last'] })
    },
  })
  assert.deepEqual((await terminal.read()).rows, ['first', 'a line too long for', 'twenty columns', 'last', '', ''])
})
