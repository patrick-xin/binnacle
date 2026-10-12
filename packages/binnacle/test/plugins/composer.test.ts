import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import * as composer from '../../src/plugins/composer/index.ts'
import type { ComposerState } from '../../src/plugins/composer/index.ts'
import { mounted } from '../support/mounted.ts'

/** The composer alone. With no agent, as before dsh makes one, no session opens; `opens` gives the mount's fake agent, and `stored` a stored session. */
async function chat(columns = 20, rows = 5, options: { opens?: boolean; stored?: boolean; provide?: (ctx: Context) => void } = {}) {
  const mount = await mounted({
    size: { columns, rows },
    builtins: ['binnacle-composer'],
    ...(options.stored === true ? { stored: { id: 'session-stored', events: [] } } : {}),
    provide: (ctx) => {
      if (options.opens !== true && options.stored !== true)
        ctx.provide('agents' as never, { create: () => new Promise(() => {}) } as never)
      options.provide?.(ctx)
    },
  })
  const { app } = mount
  const typed = async (...keys: string[]) => {
    for (const key of keys) mount.terminal.type(key)
    return (await mount.terminal.read()).rows
  }
  const dsh = {
    agent: app.agent,
    get sent() {
      return app.agent.sent
    },
    get cancels() {
      return app.agent.cancels
    },
  }
  return {
    ...mount,
    dsh,
    composerFiber: { dispose: () => app.unload('binnacle-composer') },
    fiber: { dispose: () => app.unload('binnacle') },
    typed,
  }
}

const RULE = '─'.repeat(20)

test('what a person types is drawn in the composer, between its rules', async () => {
  const { typed } = await chat()
  assert.deepEqual(await typed('h', 'i'), ['', '', RULE, 'hi ', RULE])
})

test('enter clears the draft and keeps it in the history, and up brings it back', async () => {
  const { typed } = await chat(20, 5, { opens: true })
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
  const { typed } = await chat(20, 8, { opens: true })
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
  const { typed, dsh } = await chat(20, 5, { opens: true })
  await typed('h', 'i', '\r')
  await dsh.agent.status('running')
  await typed('o', 'k', '\r')
  assert.deepEqual(dsh.sent, [
    { how: 'followup', text: 'hi' },
    { how: 'steer', text: 'ok' },
  ])
})

test('enter keeps the draft while no agent takes it: a stored session that is read, or a session not open yet', async () => {
  const { typed: typedToStored } = await chat(20, 5, { stored: true })
  const toStored = await typedToStored('h', 'i', '\r')
  const { typed: typedBeforeOpen } = await chat()
  assert.deepEqual(
    [toStored, await typedBeforeOpen('h', 'i', '\r')],
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
  const { typed, dsh } = await chat(20, 5, { opens: true })
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
  const { ctx, typed, dsh } = await chat(20, 5, { opens: true })
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
  const { ctx, typed, dsh } = await chat(20, 6, { opens: true })
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
  const { ctx, typed, dsh } = await chat(20, 6, { opens: true })
  await authored(ctx, (plugin) => {
    plugin.binnacle.action('composer.send', { run: (_at, beneath) => beneath() })
  })
  assert.deepEqual([await typed('a', '\n', 'b'), dsh.sent], [['', '', RULE, 'a', 'b ', RULE], []])
})

test('the default composer.send takes a backslash before the cursor as a new line, wherever it is bound', async () => {
  const { ctx, typed, dsh } = await chat(20, 6, { opens: true })
  await authored(ctx, (plugin) => {
    plugin.binnacle.bind('composer.send', ['ctrl+s'])
  })
  const rows = await typed('a', '\\', '\x13', 'b')
  assert.deepEqual([rows, dsh.sent], [['', '', RULE, 'a', 'b ', RULE], []])
})

test('the default composer.send sends nothing for a draft of whitespace, and keeps it', async () => {
  const { typed, dsh } = await chat(20, 5, { opens: true })
  const rows = await typed(' ', ' ', '\r')
  assert.deepEqual([rows, dsh.sent], [['', '', RULE, '   ', RULE], []])
})

test('an author who sets composer.send and runs beneath() keeps what it did: the draft is sent, and goes into the history', async () => {
  const { ctx, typed, dsh } = await chat(20, 5, { opens: true })
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
  const { ctx, typed, dsh } = await chat(20, 5, { opens: true })
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

test('an author who sets the draft and runs composer.send in one call sends the draft that was set', async () => {
  const { ctx, typed, dsh } = await chat(20, 5, { opens: true })
  await typed('h', 'i')
  draftOf(ctx).set((state) => {
    state.text = 'set'
  })
  ctx.binnacle.run('composer.send')
  assert.deepEqual([dsh.sent, await typed()], [[{ how: 'followup', text: 'set' }], ['', '', RULE, ' ', RULE]])
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

type Execution = { commandId: string; result: { kind: 'success' | 'error'; text?: string } } | undefined

const success = (text?: string): Execution => ({ commandId: 'cmd-1', result: { kind: 'success', ...(text === undefined ? {} : { text }) } })
const failure = (text: string): Execution => ({ commandId: 'cmd-1', result: { kind: 'error', text } })

// dsh's command registry, as dsh-base provides it: each line it is given waits until the test settles it.
function registry() {
  const ran: { agent: unknown; line: string; attachments: readonly unknown[]; signal: AbortSignal }[] = []
  const pending: { resolve: (execution: Execution) => void; reject: (error: unknown) => void }[] = []
  const service = {
    list: () => [],
    find: () => undefined,
    execute: (agent: unknown, line: string, attachments: readonly unknown[], signal: AbortSignal) => {
      ran.push({ agent, line, attachments, signal })
      return new Promise<Execution>((resolve, reject) => pending.push({ resolve, reject }))
    },
  }
  const settle = async (execution: Execution | Error) => {
    const next = pending.shift()
    if (execution instanceof Error) next?.reject(execution)
    else next?.resolve(execution)
    await new Promise((resolve) => setImmediate(resolve))
  }
  return { ran, service, settle, provide: (ctx: Context) => ctx.provide('commands' as never, service as never) }
}

async function commanding(rows = 5) {
  const commands = registry()
  return { ...(await chat(20, rows, { opens: true, provide: commands.provide })), commands }
}

test("enter on a command line gives it to dsh's commands with the Chat's agent, with only the composer's row on, and the model sees no prompt; a success clears the draft and keeps it in the history", async () => {
  const { ctx, typed, dsh, commands } = await commanding()
  await typed(...'/compact', '\r')
  await commands.settle(success('compacted'))
  const afterRun = await typed()
  assert.deepEqual(
    [commands.ran.map(({ agent, line, attachments }) => ({ agent, line, attachments })), dsh.sent, afterRun, await typed('\x1b[A')],
    [
      [{ agent: ctx.binnacleSession.agent, line: '/compact', attachments: [] }],
      [],
      ['', '', RULE, ' ', RULE],
      ['', '', RULE, '/compact', RULE],
    ],
  )
})

test('a command that fails, by its result or by a handler that throws, keeps the draft', async () => {
  const { typed, commands } = await commanding()
  await typed(...'/goal x', '\r')
  await commands.settle(failure('no goal'))
  const afterError = await typed()
  await typed('\r')
  await commands.settle(new Error('the handler threw'))
  assert.deepEqual(
    [afterError, await typed()],
    [
      ['', '', RULE, '/goal x ', RULE],
      ['', '', RULE, '/goal x ', RULE],
    ],
  )
})

test("a line whose name is no command is sent as a prompt, as a skill's /name is, and so is a line that is not a slash and a letter, which dsh's commands never see", async () => {
  const { typed, dsh, commands } = await commanding()
  await typed(...'/review it', '\r')
  await commands.settle(undefined)
  await typed(...'/ 1', '\r', ...'/2', '\r')
  assert.deepEqual(
    [commands.ran.map(({ line }) => line), dsh.sent.map(({ text }) => text), await typed()],
    [['/review it'], ['/review it', '/ 1', '/2'], ['', '', RULE, ' ', RULE]],
  )
})

test('with no command registry, a command line is sent as a prompt', async () => {
  const { typed, dsh } = await chat(20, 5, { opens: true })
  await typed(...'/compact', '\r')
  assert.deepEqual(dsh.sent, [{ how: 'followup', text: '/compact' }])
})

test('while a command runs, the model composer is running, and enter sends nothing', async () => {
  const { ctx, typed, dsh, commands } = await commanding()
  const model = () => draftOf(ctx).state?.running
  const before = model()
  await typed(...'/compact', '\r')
  const whileRunning = model()
  await typed('\r')
  const ranWhileRunning = commands.ran.length
  await commands.settle(success())
  assert.deepEqual([before, whileRunning, ranWhileRunning, dsh.sent, model()], [false, true, 1, [], false])
})

test('a draft edited while its command ran stays at a success, and the line that ran goes into the history', async () => {
  const { typed, commands } = await commanding()
  await typed(...'/compact ', '\r', 'x')
  await commands.settle(success())
  const afterRun = await typed()
  await typed('\x03')
  assert.deepEqual(
    [commands.ran.map(({ line }) => line), afterRun, await typed('\x1b[A')],
    [['/compact'], ['', '', RULE, '/compact x ', RULE], ['', '', RULE, '/compact', RULE]],
  )
})

test('the signal of a command that runs aborts when the core unloads', async () => {
  const { fiber, typed, commands } = await commanding()
  await typed(...'/compact', '\r')
  const before = commands.ran[0]?.signal.aborted
  await fiber.dispose()
  assert.deepEqual([before, commands.ran[0]?.signal.aborted], [false, true])
})

async function settledLate(settlement: Execution | Error) {
  const { ctx, composerFiber, typed, dsh, commands } = await commanding()
  await typed(...'/compact', '\r')
  const state = draftOf(ctx).state
  await composerFiber.dispose()
  await commands.settle(settlement)
  return { state, sent: dsh.sent }
}

test('a composer that unloads before its command settles is changed by nothing, whether the command succeeds or throws', async () => {
  const unchanged = { state: { text: '/compact', running: true }, sent: [] }
  assert.deepEqual([await settledLate(success()), await settledLate(new Error('the handler threw'))], [unchanged, unchanged])
})
