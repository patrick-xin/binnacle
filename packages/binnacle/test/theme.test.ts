import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import type { Binnacle, ThemeLayer, Tone } from '../src/api.ts'
import type { TerminalColorMode } from '../src/terminal/colors.ts'
import { mount } from './support/mount.ts'

async function drawn(columns: number, rows: number, author: (binnacle: Binnacle) => void, colorMode?: TerminalColorMode) {
  const mounted = await mount({ columns, rows, ...(colorMode === undefined ? {} : { colorMode }) })
  mounted.ready()
  await mounted.ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (ctx: Context) => {
      author(ctx.binnacle)
    },
  })
  return mounted
}

function themer(ctx: Context, layer: ThemeLayer) {
  return ctx.plugin({
    name: 'themer',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.theme(layer)
    },
  })
}

const TONES: readonly Tone[] = ['text', 'accent', 'muted', 'dim', 'success', 'warning', 'error', 'border', 'borderAccent', 'borderMuted']

test('a theme layer changes everything drawn with the tokens it names, and the tokens it does not name stay as they were', async () => {
  const { ctx, terminal } = await drawn(12, 3, (binnacle) => {
    binnacle.layout('chat', { place: 'a', border: true })
    binnacle.place('a', { lines: () => [binnacle.paint('accent', `${binnacle.tokens.glyphs.mark}a`) + binnacle.paint('muted', 'b')] })
  })
  const before = { rows: (await terminal.read()).rows, styles: await Promise.all([terminal.styleAt(1, 1), terminal.styleAt(3, 1)]) }
  await themer(ctx, { colors: { accent: 'magenta' }, glyphs: { mark: '>' } })
  const after = {
    rows: (await terminal.read()).rows,
    styles: await Promise.all([terminal.styleAt(1, 1), terminal.styleAt(3, 1), terminal.styleAt(0, 0)]),
  }
  const plain = { bold: false, italic: false, underline: false }
  assert.deepEqual(
    [before.rows[1], before.styles.map(({ colour }) => colour), after],
    [
      '│›ab       │',
      [6, 8],
      {
        rows: ['╭──────────╮', '│>ab       │', '╰──────────╯'],
        styles: [
          { colour: 5, dim: false, ...plain },
          { colour: 8, dim: false, ...plain },
          { colour: 'default', dim: true, ...plain },
        ],
      },
    ],
  )
})

test("with no layer, binnacle draws in v0's default tones, each one of the terminal's sixteen, and a box's frame dim", async () => {
  const { terminal } = await drawn(TONES.length + 2, 3, (binnacle) => {
    binnacle.layout('chat', { place: 'a', border: true })
    binnacle.place('a', { lines: () => [TONES.map((tone) => binnacle.paint(tone, 'x')).join('')] })
  })
  const styles = await Promise.all(TONES.map((_, index) => terminal.styleAt(index + 1, 1)))
  const drawnIn = Object.fromEntries(TONES.map((tone, index) => [tone, `${styles[index]!.colour}${styles[index]!.dim ? ' dim' : ''}`]))
  const frame = await terminal.styleAt(0, 0)
  assert.deepEqual(
    [drawnIn, frame.dim],
    [
      {
        text: 'default',
        accent: '6',
        muted: '8',
        dim: 'default dim',
        success: '2',
        warning: '3',
        error: '1',
        border: 'default dim',
        borderAccent: '6',
        borderMuted: 'default dim',
      },
      true,
    ],
  )
})

test("the default glyphs, edge, padding and gap are v0's, and the `divider` is ' · ', as the status line joined its parts", async () => {
  const { ctx } = await mount()
  assert.deepEqual(ctx.binnacle.tokens.glyphs, {
    mark: '›',
    unmarked: ' ',
    checked: '[x]',
    unchecked: '[ ]',
    rule: '─',
    separator: ' | ',
    divider: ' · ',
    more: '…',
  })
  assert.deepEqual([ctx.binnacle.tokens.edge, ctx.binnacle.tokens.padding, ctx.binnacle.tokens.gap], ['rounded', 0, 0])
})

test("the borders of a box are drawn in the theme's border colour", async () => {
  const { ctx, terminal } = await drawn(7, 3, (binnacle) => {
    binnacle.layout('chat', { place: 'a', border: true, title: 'hi' })
    binnacle.place('a', { lines: () => ['a'] })
  })
  await themer(ctx, { colors: { border: 'magenta' } })
  const cells = [
    [0, 0],
    [1, 0],
    [3, 0],
    [6, 0],
    [0, 1],
    [6, 1],
    [0, 2],
    [3, 2],
  ] as const
  const colours = await Promise.all(cells.map(async ([x, y]) => (await terminal.styleAt(x, y)).colour))
  assert.deepEqual(
    [(await terminal.read()).rows, colours],
    [
      ['╭─ hi ╮', '│a    │', '╰─────╯'],
      [5, 5, 'default', 5, 5, 5, 5, 5],
    ],
  )
})

test('when the plugin that added a layer unloads, its tokens go, and everything is drawn again', async () => {
  const { ctx, terminal } = await drawn(8, 3, (binnacle) => {
    binnacle.layout('chat', { place: 'a', border: true })
    binnacle.place('a', { lines: () => [binnacle.paint('accent', binnacle.tokens.glyphs.mark)] })
  })
  const fiber = themer(ctx, { colors: { accent: 'magenta', border: 'red' }, glyphs: { mark: '>' } })
  await fiber
  const themed = [(await terminal.read()).rows[1], (await terminal.styleAt(1, 1)).colour, (await terminal.styleAt(0, 0)).colour]
  await fiber.dispose()
  const after = [(await terminal.read()).rows[1], (await terminal.styleAt(1, 1)).colour, (await terminal.styleAt(0, 0)).colour]
  assert.deepEqual(
    [themed, after],
    [
      ['│>     │', 5, 1],
      ['│›     │', 6, 'default'],
    ],
  )
})

test('the newest layer wins for each token it names, and a token is a colour with attributes', async () => {
  const { ctx } = await mount()
  await themer(ctx, { colors: { accent: 'magenta', muted: 'red' } })
  await ctx.plugin({
    name: 'newer',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.theme({ colors: { accent: { color: 'bright-blue', bold: true } }, padding: 1 })
    },
  })
  const { colors, padding } = ctx.binnacle.tokens
  assert.deepEqual([colors.accent, colors.muted, padding], [{ color: 'bright-blue', bold: true }, { color: 'red' }, 1])
})

function paintRed(binnacle: Binnacle): void {
  binnacle.theme({ colors: { accent: { color: '#ff0000', italic: true, underline: true } } })
  binnacle.place('transcript', { lines: () => [binnacle.paint('accent', 'x') + binnacle.paint('success', 'y')] })
}

test('an exact colour is drawn as it is on a truecolor terminal, and as the nearest of 256 on another', async () => {
  const truecolor = await drawn(4, 1, paintRed, 'truecolor')
  const indexed = await drawn(4, 1, paintRed, '256color')
  assert.deepEqual(
    [await truecolor.terminal.styleAt(0, 0), (await indexed.terminal.styleAt(0, 0)).colour, (await indexed.terminal.styleAt(1, 0)).colour],
    [{ colour: '#ff0000', bold: false, dim: false, italic: true, underline: true }, 196, 2],
  )
})

test('a layer whose colour is not a colour is refused, and names the token', async () => {
  const { ctx } = await mount()
  assert.throws(() => ctx.binnacle.theme({ colors: { accent: '36' } }), /accent.*'36'/)
  assert.deepEqual(ctx.binnacle.tokens.colors.accent, { color: 'cyan' })
})

test('a layer added twice by one object goes only with the plugin whose layer unloads, and the layer beneath it is drawn again', async () => {
  const { ctx, terminal } = await drawn(4, 1, (binnacle) => {
    binnacle.place('transcript', { lines: () => [binnacle.paint('accent', 'x')] })
  })
  const shared: ThemeLayer = { colors: { accent: 'magenta' } }
  const named = (name: string, layer: ThemeLayer) =>
    ctx.plugin({
      name,
      inject: ['binnacle'],
      apply: (plugin: Context) => {
        plugin.binnacle.theme(layer)
      },
    })
  await named('first', shared)
  await named('second', { colors: { accent: 'red' } })
  const third = named('third', shared)
  await third
  await third.dispose()
  assert.deepEqual([(await terminal.styleAt(0, 0)).colour, ctx.binnacle.tokens.colors.accent], [1, { color: 'red' }])
})

test('blanks at the end of a line keep a background given in the colon form of a colour, with its colour space left out', async () => {
  const { terminal } = await drawn(8, 1, (binnacle) => {
    binnacle.place('transcript', { lines: () => ['X\x1b[48:2::255:0:0m   '] })
  })
  assert.deepEqual(await Promise.all([1, 3].map(async (x) => terminal.backgroundAt(x, 0))), ['#ff0000', '#ff0000'])
})
