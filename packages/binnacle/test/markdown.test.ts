import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import { markdown, wrap } from '../src/index.ts'
import type { Binnacle, MarkdownCodeLook, MarkdownItemLook } from '../src/index.ts'
import { mount } from './support/mount.ts'

const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
const unstyled = (lines: readonly string[]) => lines.map((line) => line.replace(/\x1b\[[\d;]*m/g, ''))

async function booted() {
  const mounted = await mount({ columns: 30, rows: 8 })
  mounted.ready()
  return { ...mounted, binnacle: mounted.ctx.binnacle as Binnacle }
}

async function drawing(text: string, columns = 30, rows = 8) {
  const mounted = await mount({ columns, rows })
  mounted.ready()
  await mounted.ctx.plugin({
    name: 'feature',
    inject: ['binnacle'],
    apply: (ctx: Context) => {
      ctx.binnacle.place('transcript', { lines: (width) => markdown(ctx.binnacle, text, width) })
    },
  })
  await settled()
  return mounted
}

test('markdown draws a heading in the heading Tone with no #, and joins its blocks by one blank line', async () => {
  const { binnacle } = await booted()
  assert.deepEqual(unstyled(markdown(binnacle, '## The plan\nFirst we read.\n\nThen we write.', 30)), [
    'The plan',
    '',
    'First we read.',
    '',
    'Then we write.',
  ])
})

test('markdown wraps a paragraph at the width, and keeps its own line breaks', async () => {
  const { binnacle } = await booted()
  assert.deepEqual(unstyled(markdown(binnacle, 'one two three four five\nsix  \nseven', 10)), [
    'one two',
    'three four',
    'five',
    'six',
    'seven',
  ])
})

test('markdown draws bold and italic, inline code in the code Tone, and a link in the link Tone with its destination when it is not its text', async () => {
  const { binnacle } = await booted()
  assert.deepEqual(unstyled(markdown(binnacle, '**a** *b* `c` [d](https://e.io) <https://f.io>', 40)), [
    'a b c d (https://e.io) https://f.io',
  ])
  const { terminal } = await drawing('**a** *b* `c` [d](https://e.io)')
  const styles = await Promise.all([0, 2, 4, 6, 9].map((x) => terminal.styleAt(x, 0)))
  assert.deepEqual(
    styles.map(({ colour, bold, italic, underline }) => ({ colour, bold, italic, underline })),
    [
      { colour: 'default', bold: true, italic: false, underline: false },
      { colour: 'default', bold: false, italic: true, underline: false },
      { colour: 3, bold: false, italic: false, underline: false },
      { colour: 4, bold: false, italic: false, underline: true },
      { colour: 'default', bold: false, italic: false, underline: false },
    ],
  )
})

test('a heading draws bold in the accent colour by default', async () => {
  const { terminal } = await drawing('# Title')
  const { colour, bold } = await terminal.styleAt(0, 0)
  assert.deepEqual([(await terminal.read()).rows[0]!.trimEnd(), colour, bold], ['Title', 6, true])
})

test('a code block draws each line indented two cells in the code Tone, wrapped under its indent', async () => {
  const { binnacle } = await booted()
  assert.deepEqual(unstyled(markdown(binnacle, 'See:\n\n```ts\nconst a = 1\n  return a + b\n```', 10)), [
    'See:',
    '',
    '  const a',
    '  = 1',
    '    return',
    '  a + b',
  ])
  const { terminal } = await drawing('```\nx\n```')
  assert.equal(await terminal.colourAt(2, 0), 3)
})

test('an unclosed code block draws as code to the end of the text', async () => {
  const { binnacle } = await booted()
  assert.deepEqual(unstyled(markdown(binnacle, 'Here:\n\n```js\nlet a\n# not a heading', 30)), [
    'Here:',
    '',
    '  let a',
    '  # not a heading',
  ])
})

test("a list's items draw with • or their number from the list's start, joined by none, and the lines an item wraps to start under its text", async () => {
  const { binnacle } = await booted()
  assert.deepEqual(unstyled(markdown(binnacle, '- one two three\n- four\n\n3. five\n4. six', 10)), [
    '• one two',
    '  three',
    '• four',
    '',
    '3. five',
    '4. six',
  ])
})

test("a task's box draws as its source before its text", async () => {
  const { binnacle } = await booted()
  assert.deepEqual(unstyled(markdown(binnacle, '- [x] done\n- [ ] not yet', 20)), ['• [x] done', '• [ ] not yet'])
})

test("a task's box counts toward the wrap, so the lines its text wraps to start under its text", async () => {
  const { binnacle } = await booted()
  assert.deepEqual(unstyled(markdown(binnacle, '- [x] one two three', 10)), ['• [x] one', '  two', '  three'])
})

test('an enclosing Tone resumes after an inline style ends, in a heading, a quote and a link', async () => {
  const { terminal } = await drawing('# a `b` c **d** e\n\n> f `g` h\n\n[i `j` k](https://x.io)')
  const at = (x: number, y: number) => terminal.styleAt(x, y)
  const heading = await Promise.all([0, 2, 4, 6, 8].map((x) => at(x, 0)))
  assert.deepEqual(
    heading.map(({ colour, bold }) => [colour, bold]),
    [
      [6, true],
      [3, true],
      [6, true],
      [6, true],
      [6, true],
    ],
  )
  assert.deepEqual(await Promise.all([2, 4, 6].map(async (x) => (await at(x, 2)).colour)), [8, 3, 8])
  const link = await Promise.all([0, 2, 4].map((x) => at(x, 4)))
  assert.deepEqual(
    link.map(({ colour, underline }) => [colour, underline]),
    [
      [4, true],
      [3, true],
      [4, true],
    ],
  )
})

test('a nested list is a block of its item, drawn indented under its text', async () => {
  const { binnacle } = await booted()
  assert.deepEqual(unstyled(markdown(binnacle, '- top\n  - inner\n- next', 20)), ['• top', '  • inner', '• next'])
})

test('a quote draws each line after │ in the muted Tone, its blocks drawn at the width less two', async () => {
  const { binnacle } = await booted()
  assert.deepEqual(unstyled(markdown(binnacle, '> one two three', 8)), ['│ one', '│ two', '│ three'])
  const { terminal } = await drawing('> q')
  assert.deepEqual([await terminal.colourAt(0, 0), await terminal.colourAt(2, 0)], [8, 8])
})

test('a rule draws the rule glyph across the width in the border Tone', async () => {
  const { binnacle } = await booted()
  assert.deepEqual(unstyled(markdown(binnacle, 'a\n\n---\n\nb', 6)), ['a', '', '──────', '', 'b'])
  const { terminal } = await drawing('---')
  assert.equal((await terminal.styleAt(0, 0)).dim, true)
})

test('any other token, such as a table, raw HTML, a strikethrough or an image, draws as its source text, made plain', async () => {
  const { binnacle } = await booted()
  assert.deepEqual(unstyled(markdown(binnacle, '|a|b|\n|-|-|\n|1|2|\n\n~~gone~~ ![cat](c.png) <b>x</b> \x1b[31mred', 40)), [
    '|a|b|',
    '|-|-|',
    '|1|2|',
    '',
    '~~gone~~ ![cat](c.png) <b>x</b> red',
  ])
})

test('markdown of an empty text gives no line', async () => {
  const { binnacle } = await booted()
  assert.deepEqual([markdown(binnacle, '', 10), markdown(binnacle, '  \n\n', 10)], [[], []])
})

test('a marker wider than the width draws as wrap does, and its text gets one cell a line', async () => {
  const { binnacle } = await booted()
  assert.deepEqual(unstyled(markdown(binnacle, '10. ab', 3)), ['10. a', '    b'])
})

test('an author changes one kind of block with its Look, given what it draws and its width', async () => {
  const { binnacle } = await booted()
  const given: unknown[] = []
  binnacle.look<MarkdownCodeLook>('markdown.code', () => (lines, at) => {
    given.push(at)
    return [`[${at.lang}]`, ...lines.map((line) => `| ${line}`)]
  })
  binnacle.look<MarkdownItemLook>(
    'markdown.item',
    () =>
      (lines, { width, number }) =>
        lines.flatMap((line, at) => wrap(line, width, { first: at === 0 ? `(${number}) ` : '    ' })),
  )
  assert.deepEqual(unstyled(markdown(binnacle, '```py\nx = 1\n```\n\n1. a\n2. b', 20)), ['[py]', '| x = 1', '', '(1) a', '(2) b'])
  assert.deepEqual(given, [{ lang: 'py', width: 20 }])
})

test('the Tones heading, code and link recolour the markdown', async () => {
  const { terminal, ctx } = await drawing('# h `c` [l](https://x.io)')
  await ctx.plugin({
    name: 'theme',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.theme({ colors: { heading: 'magenta', code: 'green', link: 'red' } })
    },
  })
  await settled()
  assert.deepEqual(await Promise.all([0, 2, 4].map((x) => terminal.colourAt(x, 0))), [5, 2, 1])
})
