import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import { frame, rule, title } from '../src/index.ts'
import type { Binnacle, TitleRow } from '../src/index.ts'
import { mount } from './support/mount.ts'

const unstyled = (lines: readonly string[]) => lines.map((line) => line.replace(/\x1b\[[\d;]*m/g, ''))

async function booted() {
  const mounted = await mount({ columns: 30, rows: 8 })
  mounted.ready()
  return { ...mounted, binnacle: mounted.ctx.binnacle as Binnacle }
}

test('frame draws lines in a box of the theme’s edge, width wide, with the title in its top edge', async () => {
  const { binnacle } = await booted()
  assert.deepEqual(unstyled(frame(binnacle, ['one', 'two'], 12, { title: 'Shell' })), [
    '╭─ Shell ──╮',
    '│one       │',
    '│two       │',
    '╰──────────╯',
  ])
})

test('frame with no title draws its top edge whole', async () => {
  const { binnacle } = await booted()
  assert.deepEqual(unstyled(frame(binnacle, ['one'], 6)), ['╭────╮', '│one │', '╰────╯'])
})

test('frame wraps each line inside the box', async () => {
  const { binnacle } = await booted()
  assert.deepEqual(unstyled(frame(binnacle, ['one two three'], 9)), ['╭───────╮', '│one two│', '│three  │', '╰───────╯'])
})

test('frame cuts its title with the more glyph where it does not fit', async () => {
  const { binnacle } = await booted()
  binnacle.theme({ glyphs: { more: '+' } })
  assert.deepEqual(unstyled(frame(binnacle, [], 10, { title: 'A long title' })), ['╭─ A lo+ ╮', '╰────────╯'])
})

test('frame draws its edge in the border Tone, or in the tone given', async () => {
  const { binnacle } = await booted()
  binnacle.theme({ colors: { border: 'blue', error: 'red' } })
  const [plain, failed] = [frame(binnacle, ['x'], 4), frame(binnacle, ['x'], 4, { tone: 'error' })]
  assert.deepEqual(
    [plain[0], plain[1], failed[0], failed[1]],
    [
      binnacle.paint('border', '╭──╮'),
      `${binnacle.paint('border', '│')}x\x1b[0m ${binnacle.paint('border', '│')}`,
      binnacle.paint('error', '╭──╮'),
      `${binnacle.paint('error', '│')}x\x1b[0m ${binnacle.paint('error', '│')}`,
    ],
  )
})

test('frame follows the theme’s edge', async () => {
  const { binnacle } = await booted()
  binnacle.theme({ edge: 'square' })
  assert.deepEqual(unstyled(frame(binnacle, ['ab'], 4, { title: '' })), ['┌──┐', '│ab│', '└──┘'])
})

test('a frame narrower than 4 cells draws its lines without the box', async () => {
  const { binnacle } = await booted()
  assert.deepEqual(unstyled(frame(binnacle, ['abcde'], 3, { title: 'T' })), ['abc', 'de'])
})

test('rule draws the rule glyph across the width with the text in it, in the accent Tone', async () => {
  const { binnacle } = await booted()
  binnacle.theme({ glyphs: { rule: '=' } })
  assert.deepEqual(
    [rule(binnacle, 'Pick', 12), rule(binnacle, '', 4)],
    [binnacle.paint('accent', '== Pick ===='), binnacle.paint('accent', '====')],
  )
})

test('a Title’s default row is the rule of its text', async () => {
  const mounted = await mount({ columns: 14, rows: 2 })
  mounted.ready()
  let drawn = ''
  await mounted.ctx.plugin({
    name: 'feature',
    inject: ['binnacle'],
    apply: (ctx: Context) => {
      ctx.binnacle.layout('chat', { column: [{ place: 'heading' }] })
      ctx.binnacle.look<TitleRow>('heading.row', (beneath) => (text, at) => (drawn = beneath(text, at)))
      title(ctx.binnacle, { name: 'heading', text: () => 'Fruit' })
    },
  })
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  assert.equal(drawn, rule(mounted.ctx.binnacle, 'Fruit', 14))
})

test('a styled line that wraps keeps its style on each line inside the frame, and leaves it out of the padding and the edge', async () => {
  const mounted = await mount({ columns: 6, rows: 4 })
  mounted.ready()
  await mounted.ctx.plugin({
    name: 'feature',
    inject: ['binnacle'],
    apply: (ctx: Context) => {
      ctx.binnacle.layout('chat', { column: [{ place: 'card' }] })
      ctx.binnacle.place('card', { lines: (width) => frame(ctx.binnacle, ['\x1b[31mabcdef\x1b[39m'], width) })
    },
  })
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  const { terminal } = mounted
  assert.deepEqual(
    [
      (await terminal.read()).rows.slice(0, 4),
      await terminal.colourAt(4, 1),
      await terminal.colourAt(1, 2),
      await terminal.colourAt(3, 2),
      await terminal.colourAt(5, 1),
      await terminal.colourAt(5, 2),
    ],
    [['╭────╮', '│abcd│', '│ef  │', '╰────╯'], 1, 1, 'default', 'default', 'default'],
  )
})
