import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import type { Binnacle } from '../src/api.ts'
import { createModel } from '../src/core/model.ts'
import { mount } from './support/mount.ts'

type Row = (label: string) => string

function angled(beneath: Row): Row {
  return (label) => `<${beneath(label)}>`
}

function tags(binnacle: Binnacle, name: string, labels: readonly string[]): void {
  binnacle.place(name, {
    lines: () => labels.map((label) => binnacle.lookOf<Row>([`${name}.row`, 'tags.row'], (text) => `- ${text}`)(label)),
  })
}

async function drawn() {
  const mounted = await mount({ columns: 12, rows: 2 })
  mounted.ready()
  await mounted.ctx.plugin({
    name: 'feature',
    inject: ['binnacle'],
    apply: (ctx: Context) => {
      ctx.binnacle.layout('chat', { column: [{ place: 'fruit' }, { place: 'trees' }] })
      tags(ctx.binnacle, 'fruit', ['fig'])
      tags(ctx.binnacle, 'trees', ['oak'])
    },
  })
  const looker = (name: string, make: (beneath: Row) => Row, options?: Parameters<Binnacle['look']>[2]) =>
    mounted.ctx.plugin({
      name: `look of ${name}`,
      inject: ['binnacle'],
      apply: (ctx: Context) => {
        ctx.binnacle.look(name, make, options)
      },
    })
  const rows = async () => (await mounted.terminal.read()).rows.map((row) => row.trimEnd())
  return { ...mounted, looker, rows }
}

test("a look set by a component's kind draws every instance of that kind", async () => {
  const { looker, rows } = await drawn()
  const before = await rows()
  await looker('tags.row', () => (label) => `* ${label}`)
  assert.deepEqual(
    [before, await rows()],
    [
      ['- fig', '- oak'],
      ['* fig', '* oak'],
    ],
  )
})

test("a look set by an instance's name draws only that instance, and the others keep the kind's look", async () => {
  const { looker, rows } = await drawn()
  await looker('tags.row', () => (label) => `* ${label}`)
  await looker('fruit.row', () => (label) => `+ ${label}`)
  assert.deepEqual(await rows(), ['+ fig', '* oak'])
})

test('a look is handed the look beneath it, and draws it and adds to it: an instance over its kind, and the kind over the default', async () => {
  const { looker, rows, terminal } = await drawn()
  await looker('tags.row', (beneath) => (label) => `[${beneath(label)}]`)
  await looker('fruit.row', (beneath) => (label) => `\x1b[1m${beneath(label)}\x1b[22m`)
  const bold = await Promise.all([terminal.styleAt(1, 0), terminal.styleAt(1, 1)])
  assert.deepEqual(
    [await rows(), bold.map((style) => style.bold)],
    [
      ['[- fig]', '[- oak]'],
      [true, false],
    ],
  )
})

test('the look beneath is found each time it draws: after a look between unloads, or a look loads beneath later, the next draw uses the chain as it stands', async () => {
  const { looker, rows } = await drawn()
  await looker('tags.row', (beneath) => (label) => `<${beneath(label)}>`)
  const between = looker('tags.row', (beneath) => (label) => `[${beneath(label)}]`)
  await between
  let kept: Row | undefined
  await looker('fruit.row', (beneath) => {
    kept ??= beneath
    return (label) => `!${kept!(label)}`
  })
  const seen = [await rows()]
  await between.dispose()
  seen.push(await rows())
  await looker('tags.row', (beneath) => (label) => `?${beneath(label)}`)
  seen.push(await rows())
  assert.deepEqual(seen, [
    ['![<- fig>]', '[<- oak>]'],
    ['!<- fig>', '<- oak>'],
    ['!?<- fig>', '?<- oak>'],
  ])
})

test('a look set twice by one function draws twice in its chain, and goes only with the plugin whose look unloads', async () => {
  const { looker, rows } = await drawn()
  await looker('tags.row', angled)
  await looker('tags.row', (beneath) => (label) => `[${beneath(label)}]`)
  const third = looker('tags.row', angled)
  await third
  const seen = [await rows()]
  await third.dispose()
  seen.push(await rows())
  assert.deepEqual(seen, [
    ['<[<- fig>]>', '<[<- oak>]>'],
    ['[<- fig>]', '[<- oak>]'],
  ])
})

test("an instance named like its kind draws each of the kind's Looks once, down to the default", async () => {
  const { ctx, looker, rows } = await drawn()
  await ctx.plugin({
    name: 'same name',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      tags(plugin.binnacle, 'tags', ['elm'])
      plugin.binnacle.layout('chat', { column: [{ place: 'tags' }, { place: 'trees' }] })
    },
  })
  await looker('tags.row', (beneath) => (label) => `[${beneath(label)}]`)
  assert.deepEqual(await rows(), ['[- elm]', '[- oak]'])
})

test('a look that names the models it reads draws again when one of them changes, though the Part it draws in names none', async () => {
  const { looker, rows } = await drawn()
  const marks = createModel({ mark: '*' })
  const unread = createModel({})
  await looker('tags.row', () => (label) => `${marks.state.mark} ${label}`, { models: [unread, marks] })
  const before = await rows()
  marks.set((state) => {
    state.mark = '+'
  })
  assert.deepEqual(
    [before, await rows()],
    [
      ['* fig', '* oak'],
      ['+ fig', '+ oak'],
    ],
  )
})
