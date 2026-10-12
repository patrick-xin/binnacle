import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import * as commands from '../../src/plugins/commands/index.ts'
import type { CommandsState } from '../../src/plugins/commands/index.ts'
import type { ComposerState } from '../../src/plugins/composer/index.ts'
import { line as searchLine } from '../../src/index.ts'
import type { ListPiece } from '../../src/index.ts'
import { mounted } from '../support/mounted.ts'

interface Definition {
  readonly name: string
  readonly description: string
  readonly input?: { readonly hint: string }
  readonly handler?: () => { kind: 'success' | 'error'; text?: string }
}

const COMPACT: Definition = { name: 'compact', description: 'Compact the session' }
const GOAL: Definition = { name: 'goal', description: 'Set a goal', input: { hint: '<goal>' } }
const PLAN: Definition = { name: 'plan', description: 'Plan first' }

// dsh's command registry, as dsh-base provides it: a plugin registers a command, and each line it is given runs its handler.
function registry(ctx: Context, definitions: readonly Definition[]) {
  const registered = [...definitions]
  const ran: { agent: unknown; line: string }[] = []
  const service = {
    register: (definition: Definition) => {
      registered.push(definition)
      ctx.emit('commands/change')
      return () => {
        registered.splice(registered.indexOf(definition), 1)
        ctx.emit('commands/change')
      }
    },
    list: () => registered.map(({ name, description, input }) => ({ name, description, ...(input === undefined ? {} : { input }) })),
    find: (_agent: unknown, name: string) => registered.find((definition) => definition.name === name),
    execute: async (agent: unknown, line: string) => {
      ran.push({ agent, line })
      const found = registered.find((definition) => line === `/${definition.name}` || line.startsWith(`/${definition.name} `))
      if (found === undefined) return undefined
      return { commandId: 'cmd-1', result: found.handler?.() ?? { kind: 'success' as const } }
    },
  }
  ctx.provide('commands' as never, service as never)
  return { ran, service }
}

const settled = () => new Promise((resolve) => setImmediate(resolve))

/** The composer and the offer of commands, over dsh's command registry. With `opens: false`, no session opens, as before dsh makes the agent. */
async function offering(
  options: { definitions?: readonly Definition[]; rows?: number; columns?: number; stored?: boolean; opens?: boolean } = {},
) {
  let dshCommands!: ReturnType<typeof registry>
  const mount = await mounted({
    size: { columns: options.columns ?? 40, rows: options.rows ?? 8 },
    builtins: ['binnacle-composer', 'binnacle-commands'],
    ...(options.stored === true ? { stored: { id: 'session-stored', events: [] } } : {}),
    provide: (ctx) => {
      if (options.opens === false) ctx.provide('agents' as never, { create: () => new Promise(() => {}) } as never)
      dshCommands = registry(ctx, options.definitions ?? [COMPACT, GOAL, PLAN])
    },
  })
  const { app } = mount
  const typed = async (...keys: string[]) => {
    // A person types one key at a time, each after the last is drawn.
    for (const key of keys) {
      mount.terminal.type(key)
      await settled()
      await mount.terminal.read()
    }
    await settled()
    return (await mount.terminal.read()).rows
  }
  const draft = () => mount.ctx.binnacle.modelOf<ComposerState>('composer').state?.text
  const dsh = {
    get sent() {
      return app.agent.sent
    },
    get cancels() {
      return app.agent.cancels
    },
  }
  return { ...mount, dsh, commands: dshCommands, typed, draft }
}

async function authored(ctx: Context, author: (plugin: Context) => void) {
  const plugin = ctx.plugin({ name: 'author', inject: ['binnacle'], apply: author })
  await plugin
  return plugin
}

const RULE = '─'.repeat(40)
const esc = async (typed: (...keys: string[]) => Promise<string[]>) => {
  await typed('\x1b')
  // A lone escape is told from the start of a sequence once nothing follows it.
  await new Promise((resolve) => setTimeout(resolve, 80))
  return typed()
}
const clickAt = (x: number, y: number) => `\x1b[<0;${x + 1};${y + 1}M`

test("a draft of / offers the commands above the composer, each with its description in the muted Tone, in the registry's order, the first marked", async () => {
  const { typed, terminal } = await offering()
  const rows = await typed('/')
  assert.deepEqual(
    [rows, (await terminal.styleAt(10, 3)).colour, (await terminal.styleAt(2, 3)).colour],
    [['', RULE, '› compact — Compact the session', '  goal — Set a goal', '  plan — Plan first', RULE, '/ ', RULE], 8, 'default'],
  )
})

test('the offer narrows as the person types, the names that start with the query first, and draws nothing while no command matches', async () => {
  const { typed } = await offering({ definitions: [{ name: 'apple', description: 'a' }, { name: 'plan', description: 'p' }, PLAN] })
  const narrowed = await typed('/', 'p', 'l')
  const none = await typed('z')
  assert.deepEqual(
    [narrowed, none],
    [
      ['', '', RULE, '› plan — p', '  plan — Plan first', '  apple — a', RULE, '/pl ', RULE].slice(1),
      ['', '', '', '', '', RULE, '/plz ', RULE],
    ],
  )
})

test('up and down move the mark while the person types, and wrap', async () => {
  const { typed } = await offering()
  await typed('/')
  const up = await typed('\x1b[A')
  const down = await typed('\x1b[B', '\x1b[B')
  assert.deepEqual(
    [up.slice(2, 5), down.slice(2, 5)],
    [
      ['  compact — Compact the session', '  goal — Set a goal', '› plan — Plan first'],
      ['  compact — Compact the session', '› goal — Set a goal', '  plan — Plan first'],
    ],
  )
})

const MANY: Definition[] = Array.from({ length: 12 }, (_, n) => ({ name: `c${String(n).padStart(2, '0')}`, description: 'd' }))

const marked = (rows: string[]) => rows.find((row) => row.startsWith('›'))

test('with more commands than 8 rows the offer shows 8, and page down and page up move the mark by a page, stop at the ends, and keep it in view', async () => {
  const { typed } = await offering({ definitions: MANY, rows: 14 })
  const first = await typed('/')
  const paged = await typed('\x1b[6~')
  const last = await typed('\x1b[6~')
  const back = await typed('\x1b[5~', '\x1b[5~')
  assert.deepEqual(
    [first.slice(2, 11), marked(paged), marked(last), last[10], marked(back)],
    [
      [RULE, ...MANY.slice(0, 8).map(({ name }, n) => `${n === 0 ? '›' : ' '} ${name} — d`)],
      '› c08 — d',
      '› c11 — d',
      '› c11 — d',
      '› c00 — d',
    ],
  )
})

test('enter on a command that takes no input runs it at once, and the model sees no prompt', async () => {
  const { typed, commands: dshCommands, dsh } = await offering()
  const rows = await typed('/', 'c', 'o', '\r')
  assert.deepEqual([dshCommands.ran.map(({ line }) => line), dsh.sent, rows], [['/compact'], [], ['', '', '', '', '', RULE, ' ', RULE]])
})

test('enter on a command that takes input puts /<name> and a space in the draft, with the cursor at its end, and closes the offer', async () => {
  const { typed, commands: dshCommands, terminal } = await offering()
  const rows = await typed('/', 'g', '\r')
  assert.deepEqual(
    [dshCommands.ran, rows, (await terminal.read()).cursor],
    [[], ['', '', '', '', '', RULE, '/goal  ', RULE], { x: 6, y: 6 }],
  )
})

test('tab puts /<name> and a space in the draft, whichever the command, and runs nothing', async () => {
  const { typed, commands: dshCommands } = await offering()
  const rows = await typed('/', '\t')
  assert.deepEqual([dshCommands.ran, rows], [[], ['', '', '', '', '', RULE, '/compact  ', RULE]])
})

test('a click on a command picks it', async () => {
  const { typed, commands: dshCommands } = await offering()
  await typed('/')
  await typed(clickAt(4, 4))
  assert.deepEqual(
    dshCommands.ran.map(({ line }) => line),
    ['/plan'],
  )
})

test('esc closes the offer and keeps the draft, and the offer opens again when the draft changes; with no offer, esc interrupts', async () => {
  const { typed, dsh } = await offering()
  await typed('/')
  const closed = await esc(typed)
  const cancelsWhileOpen = dsh.cancels.length
  const again = await typed('p')
  await typed('\x7f', '\x7f')
  await esc(typed)
  assert.deepEqual(
    [closed, cancelsWhileOpen, again.slice(2, 5), dsh.cancels.length],
    [['', '', '', '', '', RULE, '/ ', RULE], 0, [RULE, '› plan — Plan first', '  compact — Compact the session'], 1],
  )
})

test('the offer closes when the draft stops being / and a name: a space after it, a new line, or the / taken out', async () => {
  const { typed, ctx } = await offering()
  const open = () => ctx.binnacle.modelOf<CommandsState>('commands').state?.open
  const afterSpace = [await typed('/', 'p', ' '), open()]
  await typed('\x7f')
  const reopened = open()
  await typed('\x1b[13;2u')
  const afterNewLine = open()
  await typed('\x7f', 'x', '\x7f')
  const reopenedAgain = open()
  await typed('\x7f', '\x7f')
  assert.deepEqual(
    [afterSpace, reopened, afterNewLine, reopenedAgain, open()],
    [[['', '', '', '', '', RULE, '/p  ', RULE], false], true, false, true, false],
  )
})

test('an offer that matches no command closes too when the draft stops being / and a name', async () => {
  const { typed, ctx } = await offering()
  await typed('/', 'z', ' ')
  assert.equal(ctx.binnacle.modelOf<CommandsState>('commands').state?.open, false)
})

test('on a stored session, or before the session opens, a draft of / offers nothing', async () => {
  const stored = await offering({ stored: true })
  const storedRows = await stored.typed('/')
  const beforeOpen = await offering({ definitions: [COMPACT], opens: false })
  assert.deepEqual(
    [storedRows.slice(0, 5), (await beforeOpen.typed('/')).slice(0, 5)],
    [
      ['', '', '', '', ''],
      ['', '', '', '', ''],
    ],
  )
})

test('a command registered or removed while the offer is open shows in it, or goes from it, at once', async () => {
  const { typed, commands: dshCommands } = await offering({ definitions: [COMPACT] })
  await typed('/')
  const unregister = dshCommands.service.register(PLAN)
  const registered = await typed()
  unregister()
  assert.deepEqual(
    [registered.slice(2, 5), (await typed()).slice(2, 5)],
    [
      [RULE, '› compact — Compact the session', '  plan — Plan first'],
      ['', RULE, '› compact — Compact the session'],
    ],
  )
})

test('while a command runs, the offer closes, and a draft of / does not open it', async () => {
  let finish!: () => void
  const { typed, ctx, commands: dshCommands } = await offering()
  dshCommands.service.execute = async (agent: unknown, line: string) => {
    dshCommands.ran.push({ agent, line })
    await new Promise<void>((resolve) => (finish = resolve))
    return { commandId: 'cmd-1', result: { kind: 'error', text: 'no' } } as never
  }
  const open = () => ctx.binnacle.modelOf<CommandsState>('commands').state?.open
  await typed(...'/compact')
  const before = open()
  ctx.binnacle.run('composer.send')
  await settled()
  const whileRunning = [open(), await typed(...Array<string>(7).fill('\x7f'))]
  finish()
  await settled()
  assert.deepEqual(
    [before, whileRunning, open(), dshCommands.ran.map(({ line }) => line)],
    [true, [false, ['', '', '', '', '', RULE, '/ ', RULE]], false, ['/compact']],
  )
})

test('the model `commands` holds open, query and the items that match, each { label, description, name, hint }', async () => {
  const { typed, ctx } = await offering()
  await typed('/', 'g')
  const state = ctx.binnacle.modelOf<CommandsState>('commands').state!
  assert.deepEqual(
    [state.open, state.query, state.items],
    [true, 'g', [{ label: 'goal', description: 'Set a goal', name: 'goal', hint: '<goal>' }]],
  )
})

test('an author who sets commands.open to do nothing stops the offer, and a command typed in full still runs', async () => {
  const { ctx, typed, commands: dshCommands } = await offering()
  await authored(ctx, (plugin) => {
    plugin.binnacle.action('commands.open', { run: () => {} })
  })
  const rows = await typed('/')
  await typed(...'plan', '\r')
  assert.deepEqual([rows.slice(0, 5), dshCommands.ran.map(({ line }) => line)], [['', '', '', '', ''], ['/plan']])
})

test('commands.close, commands.pick and commands.complete are the actions that esc, enter and tab run, and a pick or a completion closes through commands.close', async () => {
  const { ctx, typed } = await offering()
  const ran: string[] = []
  await authored(ctx, (plugin) => {
    for (const id of ['commands.close', 'commands.pick', 'commands.complete'])
      plugin.binnacle.action(id, { run: (_at, beneath) => (ran.push(id), beneath()) })
  })
  await typed('/')
  await esc(typed)
  await typed('p', '\t')
  await typed('\x7f', '\x7f', '\x7f', '\x7f', '\x7f', 'g', '\r')
  assert.deepEqual(ran, ['commands.close', 'commands.complete', 'commands.close', 'commands.pick', 'commands.close'])
})

test('the offer is the Layout commands, COMMANDS_LAYOUT, in the Chat before the composer, which an author moves with an edit of the Chat', async () => {
  const { ctx, typed } = await offering()
  await authored(ctx, (plugin) => {
    plugin.binnacle.edit('chat', { move: 'commands', before: 'transcript' })
  })
  const rows = await typed('/', 'p', 'l')
  assert.deepEqual(
    [commands.COMMANDS_LAYOUT, rows],
    [{ place: 'commands.list', size: { most: 9 }, border: ['top'] }, [RULE, '› plan — Plan first', '', '', '', RULE, '/pl ', RULE]],
  )
})

test('an author floats the offer over the transcript, framed, with COMMANDS_LAYOUT under a name of their own', async () => {
  const { ctx, typed } = await offering({ rows: 10 })
  await authored(ctx, (plugin) => {
    plugin.binnacle.layout('commands', { column: [] })
    plugin.binnacle.layout('floating', { ...commands.COMMANDS_LAYOUT, border: true })
    plugin.binnacle.edit('chat', {
      replace: 'transcript',
      with: { over: { place: 'transcript' }, float: { layout: 'floating' }, at: { side: 'center', width: 24 } },
    })
  })
  assert.deepEqual(await typed('/', 'p', 'l'), [
    '',
    '',
    '        ╭──────────────────────╮',
    '        │› plan — Plan first   │',
    '        ╰──────────────────────╯',
    '',
    '',
    RULE,
    '/pl ',
    RULE,
  ])
})

test('an author changes how a command is drawn with the Look commands.list.row, given the item with its hint', async () => {
  const { ctx, typed } = await offering()
  await authored(ctx, (plugin) => {
    plugin.binnacle.look<commands.CommandRow>('commands.list.row', () => (item) => `${item.label} ${item.hint ?? ''}`.trimEnd())
  })
  assert.deepEqual((await typed('/', 'g')).slice(3, 5), [RULE, 'goal <goal>'])
})

test('an author draws a command’s hint after its name with the Look commands.list.label, and the row stays the List’s own', async () => {
  const { ctx, typed, terminal } = await offering()
  await authored(ctx, (plugin) => {
    plugin.binnacle.look<ListPiece<commands.CommandItem>>(
      'commands.list.label',
      (beneath) => (item, at) => beneath(item, at) + plugin.binnacle.paint('dim', item.hint === undefined ? '' : ` ${item.hint}`),
    )
  })
  const rows = (await typed('/')).slice(2, 5)
  assert.deepEqual(
    [rows, (await terminal.styleAt(2, 2)).colour, (await terminal.styleAt(8, 3)).dim],
    [['› compact — Compact the session', '  goal <goal> — Set a goal', '  plan — Plan first'], 6, true],
  )
})

test('a command whose description is wider than the terminal draws in one line, cut with the `more` glyph, and an author’s row Look is given the cut row as its beneath', async () => {
  const { ctx, typed } = await offering({ columns: 20 })
  const cut = (await typed('/', 'c')).slice(-5)
  await authored(ctx, (plugin) => {
    plugin.binnacle.look<commands.CommandRow>('commands.list.row', (beneath) => (item, at) => beneath(item, at).replace('›', '>'))
  })
  assert.deepEqual(
    [cut, (await typed()).at(-4)],
    [['─'.repeat(20), '› compact — Compact…', '─'.repeat(20), '/c ', '─'.repeat(20)], '> compact — Compact…'],
  )
})

test("a command that a plugin registers with dsh's register is offered and runs, and its handler shows a Screen that goes back to the Chat", async () => {
  const { ctx, typed, commands: dshCommands } = await offering({ definitions: [] })
  await authored(ctx, (plugin) => {
    plugin.binnacle.place('settings', { lines: () => ['the Tones'] })
    dshCommands.service.register({
      name: 'settings',
      description: 'Show the Tones',
      handler: () => {
        const screen = plugin.binnacle.show({ name: 'settings', layout: { place: 'settings' } })
        plugin.binnacle.action('settings.back', { keys: ['ctrl+b'], run: () => screen.dispose() })
        return { kind: 'success' }
      },
    })
  })
  const offered = (await typed('/')).slice(4, 5)
  const shown = await typed('\r')
  const back = await typed('\x02')
  assert.deepEqual([offered, shown[0], back.slice(5)], [['› settings — Show the Tones'], 'the Tones', [RULE, ' ', RULE]])
})

test('an author who changes what commands.list.pick does keeps its gate, so enter runs it only while the offer draws', async () => {
  const { ctx, typed, draft, commands: dshCommands, dsh } = await offering()
  const picked: (string | undefined)[] = []
  await authored(ctx, (plugin) => {
    plugin.binnacle.action('commands.list.pick', {
      run: () => {
        picked.push(draft())
        plugin.binnacle.run('composer.send')
      },
    })
  })
  await typed('/', 'p', 'l', '\r')
  await typed('h', 'i', '\r')
  assert.deepEqual([picked, dshCommands.ran.map(({ line }) => line), dsh.sent.map(({ text }) => text)], [['/pl'], ['/pl'], ['/pl', 'hi']])
})

test('an author adds a search line to the Places of commands.list.up, and up moves the offer’s mark from it while the offer draws', async () => {
  const { ctx, typed } = await offering({ rows: 10 })
  await authored(ctx, (plugin) => {
    searchLine(plugin.binnacle, { name: 'commands.search', shown: () => true, submit: () => {}, escape: () => {} })
    plugin.binnacle.edit('chat', { insert: { place: 'commands.search', size: 'content' }, after: 'composer' })
    plugin.binnacle.action('commands.list.up', { place: (places) => [...places, 'commands.search'] })
  })
  await typed('/')
  ctx.binnacle.focus('commands.search')
  const rows = await typed('\x1b[A')
  assert.deepEqual(rows, [
    '',
    '',
    RULE,
    '  compact — Compact the session',
    '  goal — Set a goal',
    '› plan — Plan first',
    RULE,
    '/',
    RULE,
    '›  ',
  ])
})
