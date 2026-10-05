import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import type { Shown } from '../src/api.ts'
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

test('a line with terminal control sequences in it is drawn as its plain text', async () => {
  const { ctx, terminal, ready } = await mount({ columns: 40, rows: 3 })
  ready()
  const before = terminal.written.length
  await ctx.plugin({
    name: 'probe',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.show({ lines: () => ['plain \x1b[31mred\x1b[0m \x1b]0;title\x07 bell\x07 back\bspace\r end\x1b[2J'] })
    },
  })
  const { rows } = await terminal.read()
  assert.deepEqual(rows, ['plain red  bell backspace end', '', ''])
  for (const control of ['\x1b]0;', '\x07', '\x1b[31m', '\x1b[2J'])
    assert.ok(!terminal.written.slice(before).includes(control), JSON.stringify(control))
})

const WHEEL_UP = '\x1b[<64;5;2M'
const WHEEL_DOWN = '\x1b[<65;5;2M'

test('a screen longer than the terminal starts at its end, and the wheel scrolls it three rows a notch, stopping at each end', async () => {
  const { ctx, terminal, ready } = await mount({ columns: 20, rows: 4 })
  ready()
  await ctx.plugin({
    name: 'probe',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.show({ lines: () => ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] })
    },
  })
  const seen: string[][] = [(await terminal.read()).rows]
  for (const notch of [WHEEL_UP, WHEEL_UP, WHEEL_UP, WHEEL_DOWN, WHEEL_DOWN, WHEEL_DOWN]) {
    terminal.type(notch)
    seen.push((await terminal.read()).rows)
  }
  assert.deepEqual(seen, [
    ['7', '8', '9', '10'],
    ['4', '5', '6', '7'],
    ['1', '2', '3', '4'],
    ['1', '2', '3', '4'],
    ['4', '5', '6', '7'],
    ['7', '8', '9', '10'],
    ['7', '8', '9', '10'],
  ])
})

test('a screen drawn again writes only the rows that changed', async () => {
  const { ctx, terminal, ready } = await mount({ columns: 20, rows: 4 })
  ready()
  const lines = ['alpha', 'beta', 'gamma']
  let shown: Shown | undefined
  await ctx.plugin({
    name: 'probe',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      shown = plugin.binnacle.show({ lines: () => lines })
    },
  })
  const before = terminal.written.length
  lines[1] = 'BETA'
  shown?.redraw()
  const after = terminal.written.slice(before)
  assert.deepEqual((await terminal.read()).rows, ['alpha', 'BETA', 'gamma', ''])
  assert.ok(after.includes('BETA'))
  assert.ok(!after.includes('alpha') && !after.includes('gamma'), JSON.stringify(after))
})

test('a terminal that changes size has the screen drawn again at its new width', async () => {
  const { ctx, terminal, ready } = await mount({ columns: 30, rows: 4 })
  ready()
  await ctx.plugin({
    name: 'probe',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.show({ lines: () => ['one two three four five', 'six'] })
    },
  })
  terminal.resize(12, 4)
  assert.deepEqual((await terminal.read()).rows, ['one two', 'three four', 'five', 'six'])
})

test('ctrl+c asks dsh to exit, with code 0', async () => {
  const { terminal, ready, exits } = await mount()
  ready()
  terminal.type('\x03')
  assert.deepEqual(exits, [0])
})

test('ctrl+z gives the terminal back and stops binnacle, and a resume takes the terminal again and draws the whole screen', async () => {
  const { ctx, terminal, process, ready } = await mount({ columns: 20, rows: 3 })
  ready()
  await ctx.plugin({
    name: 'probe',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.show({ lines: () => ['shown'] })
    },
  })
  terminal.type('\x1a')
  assert.deepEqual(await terminal.read().then(({ screen }) => ({ screen, raw: terminal.raw, stops: process.stops })), {
    screen: 'normal',
    raw: false,
    stops: 1,
  })
  process.emit('SIGCONT')
  assert.deepEqual(await terminal.read().then(({ screen, rows }) => ({ screen, rows, raw: terminal.raw })), {
    screen: 'alternate',
    rows: ['shown', '', ''],
    raw: true,
  })
})

test('a stop signal from outside gives the terminal back before binnacle stops', async () => {
  const { terminal, process, ready } = await mount()
  ready()
  process.emit('SIGTSTP')
  assert.deepEqual(await terminal.read().then(({ screen }) => ({ screen, raw: terminal.raw, stops: process.stops })), {
    screen: 'normal',
    raw: false,
    stops: 1,
  })
})

test('a process that exits while binnacle holds the terminal, as on a crash, gives the terminal back', async () => {
  const { terminal, process, ready } = await mount()
  ready()
  process.emit('exit')
  assert.deepEqual(await terminal.read().then(({ screen, mouse }) => ({ screen, mouse, raw: terminal.raw })), {
    screen: 'normal',
    mouse: 'none',
    raw: false,
  })
})
