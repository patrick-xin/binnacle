import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isNamed, isTemplateNamed, namedIn, namesInSource, unnamed } from './check-names.mjs'

const GUIDE = [
  'The Place `composer.input`, the model `composer`, and the List `commands.list`.',
  'The Looks `transcript.tool.<name>` and `transcript.event.<type>`.',
  'A component draws `<name>.row` and acts on `<name>.up`. A generic `<name>.<piece>` names nothing.',
  '```js',
  "ctx.binnacle.place('only.in.code', part)",
  '```',
].join('\n')

test('a name the guide holds in inline code is named, and one only in a code block is not', () => {
  const named = namedIn(GUIDE)
  assert.deepEqual(
    ['composer.input', 'composer', 'only.in.code'].map((name) => isNamed(name, named)),
    [true, true, false],
  )
})

test("a pattern that starts with a word and a dot names its namespace's names, and no other namespace's", () => {
  const named = namedIn(GUIDE)
  assert.deepEqual(
    ['transcript.tool.grep', 'transcript.event.tool/result', 'transcript.toolx.grep', 'transcript.tool'].map((name) =>
      isNamed(name, named),
    ),
    [true, true, false, false],
  )
})

test("a piece of a named instance is named by the component's `<name>.<piece>`, and a piece it does not name, or a piece of an unnamed instance, is not", () => {
  const named = namedIn(GUIDE)
  assert.deepEqual(
    ['commands.list.row', 'commands.list.up', 'commands.list.bogus', 'nowhere.row'].map((name) => isNamed(name, named)),
    [true, true, false, false],
  )
})

test("a template is named by a pattern with its text and a `<…>` for each hole, and not by another namespace's", () => {
  const named = namedIn(GUIDE)
  assert.deepEqual(
    ['transcript.tool.<>', 'transcript.event.<>', 'transcript.toolx.<>'].map((shape) => isTemplateNamed(shape, named)),
    [true, true, false],
  )
})

test("the source half reads each name that a naming call or a Kit component gives, on every branch, a constant's, an array's and a walk's", () => {
  const source = `
import { list } from '../../index.ts'
const LIST = 'commands.list'
const SEGMENTS = ['status.state', 'status.model']
export function apply(ctx) {
  ctx.binnacle.place(LIST, part)
  ctx.binnacle.look(\`\${LIST}.row\`, make)
  ctx.binnacle.lookOf<SegmentLook>(['status.state', 'status.any'], fallback)
  SEGMENTS.map((place) => ctx.binnacle.place(place, part))
  for (const name of ['a.one', 'a.two']) binnacle.action(name, action)
  if (rare) ctx.binnacle.model('hidden', model)
  list(binnacle, { name: 'request.choices', items })
  binnacle.look(\`transcript.tool.\${card.name}\`, make)
}`
  assert.deepEqual(
    namesInSource('x.ts', source).map(({ name, shape }) => name ?? shape),
    [
      'commands.list',
      'commands.list.row',
      'status.state',
      'status.any',
      'status.state',
      'status.model',
      'a.one',
      'a.two',
      'hidden',
      'request.choices',
      'transcript.tool.<>',
    ],
  )
})

test('the check names a name the guide lacks, an undotted one on a branch the run may not reach, an undocumented template, and a name given in a form it cannot read', () => {
  const source = `
export function apply(ctx, given) {
  ctx.binnacle.place('composer.input', part)
  if (rare) ctx.binnacle.model('hidden', model)
  ctx.binnacle.look(\`transcript.toolx.\${name}\`, make)
  ctx.binnacle.layout(given, layout)
  ctx.binnacle.look('commands.list.bogus', make)
}`
  assert.deepEqual(
    unnamed(namesInSource('x.ts', source), GUIDE).map(({ name, shape, unreadable }) => name ?? shape ?? `unreadable ${unreadable}`),
    ['hidden', 'transcript.toolx.<>', 'unreadable given', 'commands.list.bogus'],
  )
})

test("the runtime half finds a name that a built-in computes as it runs, such as a card's kind, and names it when the guide lacks its pattern and does not write it out", async () => {
  const { readFileSync } = await import('node:fs')
  const { namesAtRuntime } = await import('./check-names.mjs')
  const guide = readFileSync(new URL('../packages/binnacle/AUTHORING.md', import.meta.url), 'utf8')
  const runtime = await namesAtRuntime()
  const lacking = unnamed(runtime, guide.replaceAll('`transcript.card.<kind>`', 'a card of each kind'))
    .map(({ name }) => name)
    .filter((name) => name.startsWith('transcript.card.'))
  assert.deepEqual(
    [unnamed(runtime, guide), lacking.toSorted()],
    [[], ['transcript.card.diff', 'transcript.card.generic', 'transcript.card.read', 'transcript.card.search', 'transcript.card.web']],
  )
})

test('the source half reads a name by its nearest binding: a parameter that shadows a constant cannot be read, and a local constant is its own', () => {
  const source = `
const NAME = 'composer'
export function rare(binnacle, NAME) {
  if (false) binnacle.model(NAME, {})
}
export function local(binnacle) {
  const NAME = 'undocumented'
  binnacle.model(NAME, {})
}`
  assert.deepEqual(
    unnamed(namesInSource('x.ts', source), GUIDE).map(({ name, unreadable }) => name ?? `unreadable ${unreadable}`),
    ['unreadable NAME', 'undocumented'],
  )
})

test("the source half reads a naming method by a computed key, a component's name by a quoted key or an alias, and names what it cannot read: a component's config, a method taken off the service", () => {
  const source = `
import { list as choices, line } from '../../index.ts'
export function apply(ctx, config) {
  if (false) ctx.binnacle['model']('undocumented.one', {})
  if (false) choices(ctx.binnacle, { 'name': 'undocumented.two', items: [] })
  line(ctx.binnacle, config)
  const { model } = ctx.binnacle
  const look = ctx.binnacle.look
}`
  assert.deepEqual(
    unnamed(namesInSource('x.ts', source), GUIDE).map(({ name, unreadable }) => name ?? `unreadable ${unreadable}`),
    [
      'undocumented.one',
      'undocumented.two',
      'unreadable line(ctx.binnacle, config)',
      'unreadable { model } = ctx.binnacle',
      'unreadable ctx.binnacle.look',
    ],
  )
})
