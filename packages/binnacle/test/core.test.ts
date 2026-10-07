import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import type { Handle } from '../src/api.ts'
import { mount } from './support/mount.ts'

const probe = (lines: readonly string[]) => ({
  name: 'probe',
  inject: ['binnacle'],
  apply: (plugin: Context) => {
    plugin.binnacle.place('transcript', { lines: () => lines })
  },
})

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

test('a Part placed in the transcript is drawn line by line, each line wrapped at the width', async () => {
  const { ctx, terminal, ready } = await mount({ columns: 20, rows: 6 })
  ready()
  await ctx.plugin(probe(['first', 'a line too long for twenty columns', 'last']))
  assert.deepEqual((await terminal.read()).rows, ['first', 'a line too long for', 'twenty columns', 'last', '', ''])
})

test('a line keeps its colour and style, and loses every other control sequence', async () => {
  const { ctx, terminal, ready } = await mount({ columns: 40, rows: 3 })
  ready()
  const before = terminal.written.length
  await ctx.plugin(probe(['plain \x1b[31mred\x1b[0m \x1b]0;title\x07 bell\x07 back\bspace\r end\x1b[2J']))
  const { rows } = await terminal.read()
  assert.deepEqual(
    [rows, await terminal.colourAt(0, 0), await terminal.colourAt(6, 0), await terminal.colourAt(10, 0)],
    [['plain red  bell backspace end', '', ''], 'default', 1, 'default'],
  )
  for (const control of ['\x1b]0;', '\x07', '\x1b[2J'])
    assert.ok(!terminal.written.slice(before).includes(control), JSON.stringify(control))
})

const WHEEL_UP = '\x1b[<64;5;2M'
const WHEEL_DOWN = '\x1b[<65;5;2M'

test('a Part longer than its Place starts at its end, and the wheel scrolls it three rows a notch, stopping at each end', async () => {
  const { ctx, terminal, ready } = await mount({ columns: 20, rows: 4 })
  ready()
  await ctx.plugin(probe(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']))
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

test('a Part drawn again writes only the rows that changed', async () => {
  const { ctx, terminal, ready } = await mount({ columns: 20, rows: 4 })
  ready()
  const lines = ['alpha', 'beta', 'gamma']
  let handle: Handle | undefined
  await ctx.plugin({
    name: 'probe',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      handle = plugin.binnacle.place('transcript', { lines: () => lines })
    },
  })
  const before = terminal.written.length
  lines[1] = 'BETA'
  handle?.redraw()
  const after = terminal.written.slice(before)
  assert.deepEqual((await terminal.read()).rows, ['alpha', 'BETA', 'gamma', ''])
  assert.ok(after.includes('BETA'))
  assert.ok(!after.includes('alpha') && !after.includes('gamma'), JSON.stringify(after))
})

test('a terminal that changes size has its Parts drawn again at the new width', async () => {
  const { ctx, terminal, ready } = await mount({ columns: 30, rows: 4 })
  ready()
  await ctx.plugin(probe(['one two three four five', 'six']))
  terminal.resize(12, 4)
  assert.deepEqual((await terminal.read()).rows, ['one two', 'three four', 'five', 'six'])
})

test('ctrl+z gives the terminal back and stops binnacle, and a resume takes the terminal again and draws the whole Screen', async () => {
  const { ctx, terminal, process, ready } = await mount({ columns: 20, rows: 3 })
  ready()
  await ctx.plugin(probe(['shown']))
  terminal.type('\x1a')
  assert.deepEqual(await terminal.read().then(({ screen }) => ({ screen, raw: terminal.raw, stopCount: process.stopCount })), {
    screen: 'normal',
    raw: false,
    stopCount: 1,
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
  assert.deepEqual(await terminal.read().then(({ screen }) => ({ screen, raw: terminal.raw, stopCount: process.stopCount })), {
    screen: 'normal',
    raw: false,
    stopCount: 1,
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

test('text other code writes while binnacle draws stays off the Screen, and is printed once the terminal is given back', async () => {
  const { terminal, stdout, stderr, printed, ready, fiber } = await mount({ columns: 20, rows: 3 })
  stdout.write('before\n')
  ready()
  stdout.write('stray out\n')
  stderr.write('stray err\n')
  assert.deepEqual(await terminal.read().then(({ rows }) => ({ rows, printed: [...printed] })), {
    rows: ['', '', ''],
    printed: ['stdout: before\n'],
  })
  await fiber.dispose()
  assert.deepEqual(printed, ['stdout: before\n', 'stdout: stray out\n', 'stderr: stray err\n'])
})

test('a plugin that unloads, as on a reload, takes its Part with it, and the core keeps the terminal for the plugin loaded again', async () => {
  const { ctx, terminal, ready } = await mount({ columns: 20, rows: 2 })
  ready()
  const first = ctx.plugin(probe(['first']))
  await first
  await first.dispose()
  const gone = await terminal.read()
  await ctx.plugin(probe(['again']))
  assert.deepEqual([gone.screen, gone.rows, (await terminal.read()).rows], ['alternate', ['', ''], ['again', '']])
})

test('--help prints how to start binnacle, and exits without taking the terminal', async () => {
  const { terminal, out, exits, ready } = await mount({ args: ['--help'] })
  ready()
  assert.match(out.join(''), /^Usage: dsh --profile binnacle \[options\]/)
  assert.match(out.join(''), /--session <id>/)
  assert.deepEqual([exits, (await terminal.read()).screen], [[0], 'normal'])
})

test('a plugin reads the actions of the Gesture Table that a key is bound to, in each form a terminal sends it', async () => {
  const { ctx } = await mount()
  const read: string[][] = []
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      for (const key of ['\x03', '\x1b[99;5u', '\x1b[27;5;99~', 'x']) read.push([...plugin.binnacle.gestures.actionsOf(key)])
    },
  })
  assert.deepEqual(read, [['binnacle.clear'], ['binnacle.clear'], ['binnacle.clear'], []])
})

test("gestures.actionsOf('wheelup') names binnacle.scroll.up, and the wheel scrolls the Place under the pointer, as it does today", async () => {
  const { ctx, terminal, ready } = await mount({ columns: 20, rows: 4 })
  ready()
  await ctx.plugin(probe(['1', '2', '3', '4', '5', '6', '7', '8']))
  const actions = ctx.binnacle.gestures.actionsOf('wheelup')
  terminal.type(WHEEL_UP)
  assert.deepEqual([actions, (await terminal.read()).rows], [['binnacle.scroll.up'], ['2', '3', '4', '5']])
})

test("a Part is asked for its lines once at a width, until it redraws: another Part's redraw does not ask it again", async () => {
  const { ctx, ready } = await mount({ columns: 20, rows: 4 })
  ready()
  let asked = 0
  let status: Handle | undefined
  let transcript: Handle | undefined
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      transcript = plugin.binnacle.place('transcript', {
        lines: () => {
          asked++
          return ['a line']
        },
      })
      status = plugin.binnacle.place('status', { lines: () => ['status'] })
    },
  })
  const placed = asked
  status?.redraw()
  status?.redraw()
  const afterOthers = asked
  transcript?.redraw()
  assert.deepEqual([placed > 0, afterOthers - placed, asked - afterOthers > 0], [true, 0, true])
})

test('while a person reads scrolled up, rows added at the end leave what they read in place; at the end, the Part follows them', async () => {
  const { ctx, terminal, ready } = await mount({ columns: 20, rows: 4 })
  ready()
  const lines = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
  let transcript: Handle | undefined
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      transcript = plugin.binnacle.place('transcript', { lines: () => lines })
    },
  })
  terminal.type(WHEEL_UP)
  lines.push('11', '12')
  transcript?.redraw()
  const scrolledUp = (await terminal.read()).rows
  terminal.type(WHEEL_DOWN)
  terminal.type(WHEEL_DOWN)
  lines.push('13')
  transcript?.redraw()
  assert.deepEqual(
    [scrolledUp, (await terminal.read()).rows],
    [
      ['4', '5', '6', '7'],
      ['10', '11', '12', '13'],
    ],
  )
})

test('ctrl+c pressed twice within half a second quits; once, or twice further apart, does not', async () => {
  const { terminal, ready, exits, clock } = await mount()
  ready()
  const pressed = (at: number) => {
    clock.now = at
    terminal.type('\x03')
    return [...exits]
  }
  assert.deepEqual([pressed(0), pressed(600), pressed(900)], [[], [], [0]])
})
