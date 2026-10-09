import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import { createModel, title } from '../src/index.ts'
import type { TitleRow } from '../src/index.ts'
import { mount } from './support/mount.ts'

const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

async function titled() {
  const mounted = await mount({ columns: 16, rows: 3 })
  mounted.ready()
  const heading = createModel<{ text: string | undefined }>({ text: 'Pick' })
  await mounted.ctx.plugin({
    name: 'feature',
    inject: ['binnacle'],
    apply: (ctx: Context) => {
      ctx.binnacle.layout('chat', { column: [{ place: 'heading', size: 'content' }, { place: 'below' }] })
      ctx.binnacle.place('below', { lines: () => ['below'] })
      title(ctx.binnacle, { name: 'heading', text: () => heading.state.text, models: [heading] })
    },
  })
  const rows = async () => (await mounted.terminal.read()).rows.map((row) => row.trimEnd())
  return { ...mounted, heading, rows }
}

test('a Title draws a rule across the width with its text in it, and nothing while its text is undefined', async () => {
  const { heading, rows } = await titled()
  const seen = [await rows()]
  heading.set((state) => (state.text = undefined))
  await settled()
  seen.push(await rows())
  heading.set((state) => (state.text = ''))
  await settled()
  seen.push(await rows())
  assert.deepEqual(seen, [
    ['── Pick ────────', 'below', ''],
    ['below', '', ''],
    ['────────────────', 'below', ''],
  ])
})

test('a Title is drawn in the theme’s accent and rule, and with the Looks of its kind and of its instance', async () => {
  const { ctx, rows, terminal } = await titled()
  await ctx.plugin({
    name: 'looks',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.theme({ glyphs: { rule: '=' }, colors: { accent: 'magenta' } })
      plugin.binnacle.look<TitleRow>('title.row', (beneath) => (text, at) => beneath(text.toUpperCase(), at))
      plugin.binnacle.look<TitleRow>('heading.row', (beneath) => (text, at) => `[${beneath(text, { width: at.width - 2 })}]`)
    },
  })
  assert.deepEqual([(await rows())[0], await terminal.colourAt(1, 0)], ['[== PICK ======]', 5])
})
