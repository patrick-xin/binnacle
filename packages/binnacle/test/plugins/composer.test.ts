import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import * as composer from '../../src/plugins/composer/index.ts'
import type { ComposerState } from '../../src/plugins/composer/index.ts'
import { mount } from '../support/mount.ts'
import { agents } from '../support/agents.ts'
import { persistence } from '../support/sessions.ts'

async function chat(columns = 20, rows = 5, provide?: (ctx: Context) => void, args: string[] = []) {
  const mounted = await mount({ args, columns, rows, ...(provide === undefined ? {} : { provide }) })
  mounted.ready()
  await mounted.ctx.plugin(composer)
  // The session opens after the core loads; let it settle.
  await new Promise((resolve) => setImmediate(resolve))
  const typed = async (...keys: string[]) => {
    for (const key of keys) mounted.terminal.type(key)
    return (await mounted.terminal.read()).rows
  }
  return { ...mounted, typed }
}

const RULE = '─'.repeat(20)

test('what a person types is drawn in the composer, between its rules', async () => {
  const { typed } = await chat()
  assert.deepEqual(await typed('h', 'i'), ['', '', RULE, 'hi ', RULE])
})

test('enter clears the draft and keeps it in the history, and up brings it back', async () => {
  const { typed } = await chat(20, 5, agents().provide)
  assert.deepEqual(
    [await typed('h', 'i', '\r'), await typed('\x1b[A')],
    [
      ['', '', RULE, ' ', RULE],
      ['', '', RULE, 'hi', RULE],
    ],
  )
})

test('ctrl+c clears the draft, and binnacle stays', async () => {
  const { typed, exits } = await chat()
  assert.deepEqual([await typed('h', 'i', '\x03'), exits], [['', '', RULE, ' ', RULE], []])
})

test('a key that the kitty protocol reports released is not typed a second time', async () => {
  const { typed } = await chat()
  assert.deepEqual(await typed('\x1b[?7u', '\x1b[97u', '\x1b[97;1:3u'), ['', '', RULE, 'a ', RULE])
})

test("shift+enter makes a new line, as the kitty protocol and modifyOtherKeys send it, and as pi-tui's fallbacks ctrl+j and a backslash before enter do", async () => {
  const { typed } = await chat(20, 8, agents().provide)
  const rows = await typed('a', '\x1b[13;2u', 'b', '\x1b[27;2;13~', 'c', '\n', 'd', '\\', '\r', 'e')
  assert.deepEqual(rows, ['', RULE, 'a', 'b', 'c', 'd', 'e ', RULE])
})

test('a paste keeps its new lines in the draft, and is not sent', async () => {
  const { typed } = await chat(20, 6)
  assert.deepEqual(await typed('\x1b[200~one\ntwo\x1b[201~'), ['', '', RULE, 'one', 'two ', RULE])
})

async function authored(ctx: Context, author: (plugin: Context) => void) {
  const plugin = ctx.plugin({ name: 'author', inject: ['binnacle'], apply: author })
  await plugin
  return plugin
}

test('a Screen shown over the Chat that gives no Place the Focus gives the composer no key, though it draws it', async () => {
  const { ctx, typed } = await chat()
  const shown = await authored(ctx, (plugin) => {
    plugin.binnacle.show({ name: 'detail', layout: { column: [{ place: 'detail' }, { layout: 'composer', size: 'content' }] } })
  })
  const whileShown = await typed('x')
  await shown.dispose()
  assert.deepEqual(
    [whileShown, await typed('y')],
    [
      ['', '', RULE, ' ', RULE],
      ['', '', RULE, 'y ', RULE],
    ],
  )
})

test('a layout of the Chat with no composer Place gives the composer no key', async () => {
  const { ctx, typed } = await chat()
  const laid = await authored(ctx, (plugin) => {
    plugin.binnacle.layout('chat', { place: 'transcript' })
  })
  await typed('x')
  await laid.dispose()
  assert.deepEqual(await typed('y'), ['', '', RULE, 'y ', RULE])
})

test("the terminal's cursor is put on the composer's cursor, for an input method", async () => {
  const { typed, terminal } = await chat()
  await typed('h', 'i', '\x1b[D')
  assert.deepEqual((await terminal.read()).cursor, { x: 1, y: 3 })
})

test('enter sends the draft to the agent as a prompt, and steers the turn that runs', async () => {
  const dsh = agents()
  const { typed } = await chat(20, 5, dsh.provide)
  await typed('h', 'i', '\r')
  dsh.agent.status = 'running'
  await typed('o', 'k', '\r')
  assert.deepEqual(dsh.sent, [
    { how: 'followup', text: 'hi' },
    { how: 'steer', text: 'ok' },
  ])
})

test('enter keeps the draft while no agent takes it: a stored session that is read, or a session not open yet', async () => {
  const store = persistence([{ id: 'session-stored', createdAt: 1, events: [] }])
  const { typed: typedToStored } = await chat(20, 5, (ctx) => ctx.provide('sessionPersistence', store), ['--session', 'session-stored'])
  const { typed: typedBeforeOpen } = await chat()
  assert.deepEqual(
    [await typedToStored('h', 'i', '\r'), await typedBeforeOpen('h', 'i', '\r')],
    [
      ['', '', RULE, 'hi ', RULE],
      ['', '', RULE, 'hi ', RULE],
    ],
  )
})

test('ctrl+c on a draft clears it, and only two more on the empty draft quit', async () => {
  const { typed, exits } = await chat()
  await typed('h', '\x03', '\x03')
  const afterOne = [...exits]
  await typed('\x03')
  assert.deepEqual([afterOne, exits], [[], [0]])
})

test("esc interrupts the turn that runs, keeping what was queued for it as dsh's own stop does, and leaves the draft", async () => {
  const dsh = agents()
  const { typed } = await chat(20, 5, dsh.provide)
  await typed('h', 'i')
  const rows = await typed('\x1b')
  // A lone escape is told from the start of a sequence once nothing follows it.
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.deepEqual([dsh.cancels, rows], [[{ cause: { kind: 'user' }, options: { keepInbox: true } }], ['', '', RULE, 'hi ', RULE]])
})

test('an action with no Place bound to ctrl+t runs while the composer has the Focus, and the draft keeps its text', async () => {
  const { ctx, typed } = await chat()
  const ran: string[] = []
  await authored(ctx, (plugin) => {
    plugin.binnacle.action('author.toggle', { keys: ['ctrl+t'], run: () => ran.push('toggle') })
  })
  const rows = await typed('h', 'i', '\x14')
  assert.deepEqual([ran, rows], [['toggle'], ['', '', RULE, 'hi ', RULE]])
})

test('ctrl+x interrupts the turn from the composer once an author binds it to binnacle.interrupt beside its keys', async () => {
  const dsh = agents()
  const { ctx, typed } = await chat(20, 5, dsh.provide)
  await authored(ctx, (plugin) => {
    plugin.binnacle.bind('binnacle.interrupt', (keys) => [...keys, 'ctrl+x'])
  })
  const rows = await typed('h', 'i', '\x18')
  assert.deepEqual([dsh.cancels, rows], [[{ cause: { kind: 'user' }, options: { keepInbox: true } }], ['', '', RULE, 'hi ', RULE]])
})

const draftOf = (ctx: Context) => ctx.binnacle.modelOf<ComposerState>('composer')
const settled = () => new Promise((resolve) => setImmediate(resolve))
const LARGE = Array.from({ length: 12 }, (_, n) => `l${n}`).join('\n')

test("the draft is the model `composer`: typing and pasting change its text, a large paste's content in full and not its marker", async () => {
  const { ctx, typed } = await chat(30, 5)
  const rows = await typed('a', `\x1b[200~${LARGE}\x1b[201~`)
  assert.deepEqual([draftOf(ctx).state?.text, rows[3]], [`a${LARGE}`, 'a[paste #1 +12 lines] '])
})

test('an author who sets the draft to another replaces the one shown, drawn in full with the cursor at its end', async () => {
  const { ctx, typed, terminal } = await chat(20, 6)
  await typed('h', 'i', `\x1b[200~${LARGE}\x1b[201~`)
  draftOf(ctx).set((state) => {
    state.text = 'one\ntwo'
  })
  await settled()
  const { rows, cursor } = await terminal.read()
  assert.deepEqual([rows, cursor], [['', '', RULE, 'one', 'two ', RULE], { x: 3, y: 4 }])
})

test("setting the draft to the draft it holds changes nothing, the cursor and a paste's marker included", async () => {
  const { ctx, typed, terminal } = await chat(30, 5)
  await typed('a', `\x1b[200~${LARGE}\x1b[201~`, 'b', '\x1b[D', '\x1b[D')
  const before = await terminal.read()
  draftOf(ctx).set((state) => {
    state.text = `a${LARGE}b`
  })
  await settled()
  const after = await terminal.read()
  assert.deepEqual([after.rows, after.cursor], [before.rows, before.cursor])
})

test('ctrl+s sends the draft and enter makes a new line, once an author binds composer.send and composer.newline to them', async () => {
  const dsh = agents()
  const { ctx, typed } = await chat(20, 6, dsh.provide)
  await authored(ctx, (plugin) => {
    plugin.binnacle.bind('composer.send', ['ctrl+s'])
    plugin.binnacle.bind('composer.newline', ['enter'])
  })
  const rows = await typed('a', '\r', 'b')
  await typed('\x13')
  assert.deepEqual([rows, dsh.sent], [['', '', RULE, 'a', 'b ', RULE], [{ how: 'followup', text: 'a\nb' }]])
})

test('a newline sequence with no key name runs composer.newline, whatever its keys, and the editor makes no new line by itself', async () => {
  const { ctx, typed } = await chat(20, 6)
  const ran: string[] = []
  await authored(ctx, (plugin) => {
    plugin.binnacle.bind('composer.newline', ['ctrl+n'])
    plugin.binnacle.action('composer.newline', { run: () => ran.push('newline') })
  })
  assert.deepEqual([await typed('a', '\x1b[13;2~', 'b'), ran], [['', '', '', RULE, 'ab ', RULE], ['newline']])
})

test("ctrl+j makes a new line though enter's sequence is the same, after an author sets composer.send", async () => {
  const dsh = agents()
  const { ctx, typed } = await chat(20, 6, dsh.provide)
  await authored(ctx, (plugin) => {
    plugin.binnacle.action('composer.send', { run: (_at, beneath) => beneath() })
  })
  assert.deepEqual([await typed('a', '\n', 'b'), dsh.sent], [['', '', RULE, 'a', 'b ', RULE], []])
})

test('the default composer.send takes a backslash before the cursor as a new line, wherever it is bound', async () => {
  const dsh = agents()
  const { ctx, typed } = await chat(20, 6, dsh.provide)
  await authored(ctx, (plugin) => {
    plugin.binnacle.bind('composer.send', ['ctrl+s'])
  })
  const rows = await typed('a', '\\', '\x13', 'b')
  assert.deepEqual([rows, dsh.sent], [['', '', RULE, 'a', 'b ', RULE], []])
})

test('the default composer.send sends nothing for a draft of whitespace, and keeps it', async () => {
  const dsh = agents()
  const { typed } = await chat(20, 5, dsh.provide)
  const rows = await typed(' ', ' ', '\r')
  assert.deepEqual([rows, dsh.sent], [['', '', RULE, '   ', RULE], []])
})

test('an author who sets composer.send and runs beneath() keeps what it did: the draft is sent, and goes into the history', async () => {
  const dsh = agents()
  const { ctx, typed } = await chat(20, 5, dsh.provide)
  const seen: string[] = []
  await authored(ctx, (plugin) => {
    plugin.binnacle.action('composer.send', {
      run: (_at, beneath) => {
        seen.push(draftOf(plugin).state!.text)
        beneath()
      },
    })
  })
  await typed('h', 'i', '\r')
  assert.deepEqual([seen, dsh.sent, await typed('\x1b[A')], [['hi'], [{ how: 'followup', text: 'hi' }], ['', '', RULE, 'hi', RULE]])
})

test('an author who sets composer.send without beneath() sends nothing, and clears the draft by setting its text', async () => {
  const dsh = agents()
  const { ctx, typed } = await chat(20, 5, dsh.provide)
  const queued: string[] = []
  await authored(ctx, (plugin) => {
    plugin.binnacle.action('composer.send', {
      run: () => {
        const draft = draftOf(plugin)
        queued.push(draft.state!.text)
        draft.set((state) => {
          state.text = ''
        })
      },
    })
  })
  await typed('h', 'i', '\r')
  await settled()
  assert.deepEqual([queued, dsh.sent, await typed()], [['hi'], [], ['', '', RULE, ' ', RULE]])
})

test("ctrl+c is the core's binnacle.clear: an author who binds it to ctrl+q clears the draft with ctrl+q, and binnacle stays", async () => {
  const { ctx, typed, exits } = await chat()
  await authored(ctx, (plugin) => {
    plugin.binnacle.bind('binnacle.clear', ['ctrl+q'])
  })
  assert.deepEqual([await typed('h', 'i', '\x11'), exits], [['', '', RULE, ' ', RULE], []])
})

test('the composer is the Layout `composer`, a row with the Place `composer.input`, where an author inserts a Place before the draft', async () => {
  const { ctx, typed } = await chat()
  await authored(ctx, (plugin) => {
    plugin.binnacle.edit('composer', { insert: { place: 'prompt', size: { fixed: 2 } }, before: 'composer.input' })
    plugin.binnacle.place('prompt', { lines: () => ['>'] })
  })
  assert.deepEqual(await typed('h', 'i'), ['', '', RULE, '> hi ', RULE])
})

test('COMPOSER_LAYOUT is a row with the Place composer.input, bordered at its top and bottom in the border Tone, and the editor draws no rules of its own', async () => {
  const { ctx, typed, terminal } = await chat()
  await authored(ctx, (plugin) => {
    plugin.binnacle.layout('composer', { ...composer.COMPOSER_LAYOUT, border: false })
  })
  const bare = await typed('h', 'i')
  await authored(ctx, (plugin) => {
    plugin.binnacle.layout('composer', composer.COMPOSER_LAYOUT)
  })
  const ruled = await typed()
  assert.deepEqual(
    [composer.COMPOSER_LAYOUT, bare, ruled, (await terminal.styleAt(0, 2)).dim],
    [
      { row: [{ place: 'composer.input', size: 'fill' }], border: ['top', 'bottom'] },
      ['', '', '', '', 'hi '],
      ['', '', RULE, 'hi ', RULE],
      true,
    ],
  )
})

test('an empty draft draws its line through the Look composer.empty, given the width, and the default draws nothing', async () => {
  const { ctx, typed, terminal } = await chat()
  const plain = await typed()
  const widths: number[] = []
  await authored(ctx, (plugin) => {
    plugin.binnacle.look('composer.empty', () => (width: number) => {
      widths.push(width)
      return plugin.binnacle.paint('dim', 'Ask anything')
    })
  })
  const empty = await typed()
  const hint = (await terminal.styleAt(1, 3)).dim
  assert.deepEqual(
    [plain, empty, hint, widths.at(-1), await typed('h')],
    [['', '', RULE, ' ', RULE], ['', '', RULE, ' Ask anything', RULE], true, 19, ['', '', RULE, 'h ', RULE]],
  )
})

test('a draft taller than the 7 rows shown tells the rows hidden above and below in rows of the muted Tone, which count among the 7', async () => {
  const { typed, terminal } = await chat(20, 12)
  const lines = Array.from({ length: 10 }, (_, n) => `l${n}`)
  const atEnd = await typed(...lines.flatMap((line) => [...line, '\x1b[13;2u']).slice(0, -1))
  const marker = await terminal.styleAt(0, 4)
  const inMiddle = await typed(...Array<string>(5).fill('\x1b[A'))
  const atTop = await typed(...Array<string>(5).fill('\x1b[A'))
  assert.deepEqual(
    [atEnd.slice(3), marker.colour, inMiddle.slice(3), atTop.slice(3)],
    [
      [RULE, '↑ 4 more', 'l4', 'l5', 'l6', 'l7', 'l8', 'l9 ', RULE],
      8,
      [RULE, '↑ 3 more', 'l3', 'l4 ', 'l5', 'l6', 'l7', '↓ 2 more', RULE],
      [RULE, 'l0', 'l1', 'l2', 'l3', 'l4', 'l5', '↓ 4 more', RULE],
    ],
  )
})
