import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import { createModel, line } from '../src/index.ts'
import type { LineRow, LineState, Size } from '../src/index.ts'
import { mount } from './support/mount.ts'

const ENTER = '\r'
const ESCAPE = '\x1b'
const LEFT = '\x1b[D'
const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
// A lone escape is told from the start of a sequence once nothing follows it.
const escaped = () => new Promise<void>((resolve) => setTimeout(resolve, 80))

async function answer(size: Size = 'content') {
  const mounted = await mount({ columns: 20, rows: 3 })
  mounted.ready()
  const asked = createModel({ shown: true, key: 'a' })
  const told: string[] = []
  await mounted.ctx.plugin({
    name: 'feature',
    inject: ['binnacle'],
    apply: (ctx: Context) => {
      ctx.binnacle.show({ name: 'ask', focus: 'answer', layout: { column: [{ place: 'answer', size }, { place: 'below' }] } })
      ctx.binnacle.place('below', { lines: () => ['below'] })
      line(ctx.binnacle, {
        name: 'answer',
        shown: () => asked.state.shown,
        key: () => asked.state.key,
        submit: (text) => told.push(`submit ${text}`),
        escape: () => told.push('escape'),
        models: [asked],
      })
    },
  })
  const model = () => mounted.ctx.binnacle.modelOf<LineState>('answer')!
  const rows = async () => (await mounted.terminal.read()).rows.map((row) => row.trimEnd())
  const press = async (...keys: string[]) => {
    await mounted.terminal.read()
    for (const key of keys) {
      mounted.terminal.type(key)
      await settled()
    }
  }
  return { ...mounted, asked, told, model, rows, press }
}

test('a shown Line takes every key, enter calls submit and escape calls escape, and its text stays after them', async () => {
  const { rows, press, told } = await answer()
  await press('h', 'i', 'q', ENTER, ESCAPE)
  await escaped()
  assert.deepEqual(
    [await rows(), told],
    [
      ['› hiq', 'below', ''],
      ['submit hiq', 'escape'],
    ],
  )
})

test('each key of a Line keeps its own text in the Line’s Model', async () => {
  const { rows, press, asked, model } = await answer()
  await press('h', 'i')
  asked.set((state) => (state.key = 'b'))
  await settled()
  const other = await rows()
  await press('y', 'o')
  asked.set((state) => (state.key = 'a'))
  await settled()
  assert.deepEqual(
    [other, await rows(), [...model().state.texts]],
    [
      ['›', 'below', ''],
      ['› hi', 'below', ''],
      [
        ['a', 'hi'],
        ['b', 'yo'],
      ],
    ],
  )
})

test('setting the shown key’s text in a Line’s Model changes the Line, with the cursor at its end', async () => {
  const { rows, press, model, terminal } = await answer()
  await press('h', 'i', LEFT)
  model().set((state) => state.texts.set('a', 'hello'))
  await settled()
  const set = { rows: await rows(), cursor: (await terminal.read()).cursor }
  await press('!')
  model().set((state) => state.texts.delete('a'))
  await settled()
  const cleared = await rows()
  await press('x')
  assert.deepEqual(
    [set, cleared, await rows()],
    [{ rows: ['› hello', 'below', ''], cursor: { x: 7, y: 0 } }, ['›', 'below', ''], ['› x', 'below', '']],
  )
})

test('a submit that clears a Line’s Model clears the Line', async () => {
  const { ctx, rows, press } = await answer()
  await ctx.plugin({
    name: 'clearing',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      const model = createModel({ shown: true })
      const cleared = line(plugin.binnacle, {
        name: 'answer',
        shown: () => model.state.shown,
        submit: () => cleared.model.set((state) => state.texts.clear()),
        escape: () => {},
      })
    },
  })
  await press('h', 'i', ENTER)
  assert.deepEqual(await rows(), ['›', 'below', ''])
})

test('a hidden Line draws nothing and takes no key, and keeps its text until it is shown again', async () => {
  const { rows, press, asked, told } = await answer({ fixed: 1 })
  await press('h', 'i')
  asked.set((state) => (state.shown = false))
  await settled()
  const hidden = await rows()
  await press('x', ENTER)
  asked.set((state) => (state.shown = true))
  await settled()
  assert.deepEqual([hidden, await rows(), told], [['', 'below', ''], ['› hi', 'below', ''], []])
})

test('a Line is drawn with the Looks of its kind and of its instance, and its cursor follows what they draw', async () => {
  const { ctx, rows, press, terminal } = await answer()
  await ctx.plugin({
    name: 'looks',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.look<LineRow>('line.row', (beneath) => (typed, at) => beneath((width) => typed(width).replaceAll('h', 'H'), at))
      plugin.binnacle.look<LineRow>('answer.row', (beneath) => (typed, at) => `[${beneath(typed, { width: at.width - 2 })}]`)
    },
  })
  await press('h', 'i')
  assert.deepEqual([(await rows())[0], (await terminal.read()).cursor], ['[› Hi              ]', { x: 5, y: 0 }])
})
