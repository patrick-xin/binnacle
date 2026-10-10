import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import type { Action, Point } from '../src/api.ts'
import { mount } from './support/mount.ts'

const TAB = '\t'
const SHIFT_TAB = '\x1b[Z'
const ENTER = '\r'
const CTRL_N = '\x0e'
const clickAt = (x: number, y: number) => `\x1b[<0;${x + 1};${y + 1}M`

async function booted(columns = 20, rows = 4) {
  const mounted = await mount({ columns, rows })
  mounted.ready()
  const author = async (name: string, apply: (plugin: Context) => void) => {
    const fiber = mounted.ctx.plugin({ name, inject: ['binnacle'], apply })
    await fiber
    return fiber
  }
  return { ...mounted, author }
}

const logging = (ran: string[], name: string, more: Partial<Action> = {}): Action => ({
  run: (_at, beneath) => {
    ran.push(name)
    if (more.run !== undefined) more.run(_at, beneath)
  },
  ...Object.fromEntries(Object.entries(more).filter(([key]) => key !== 'run')),
})

const line = (typed: string[]) => ({
  lines: () => ['line'],
  key: (data: string) => {
    typed.push(data)
    return true
  },
})

test('an action marked `first` takes its key before the Part with the Focus, such as tab while a line is being typed', async () => {
  const ran: string[] = []
  const typed: string[] = []
  const { author, terminal } = await booted()
  await author('feature', (plugin) => {
    plugin.binnacle.show({ name: 'ask', focus: 'line', layout: { place: 'line' } })
    plugin.binnacle.place('line', line(typed))
    plugin.binnacle.action('ask.next', logging(ran, 'next', { keys: ['tab'], place: 'line', first: true }))
    plugin.binnacle.action('ask.send', logging(ran, 'send', { keys: ['enter'], place: 'line' }))
  })
  await terminal.read()
  terminal.type('a')
  terminal.type(TAB)
  terminal.type(ENTER)
  assert.deepEqual([ran, typed], [['next'], ['a', ENTER]])
})

test('a key goes to the actions marked `first`, then to the Part with the Focus, then to the Place’s other actions, then to the actions with no Place, then to the Gesture Table', async () => {
  const ran: string[] = []
  const typed: string[] = []
  const on = { first: true, part: true, place: true, anywhere: true }
  const { author, terminal, exits } = await booted()
  await author('feature', (plugin) => {
    plugin.binnacle.show({ name: 'ask', focus: 'line', layout: { place: 'line' } })
    plugin.binnacle.place('line', {
      lines: () => ['line'],
      key: (data: string) => {
        if (on.part) typed.push(data)
        return on.part
      },
    })
    plugin.binnacle.action('anywhere', logging(ran, 'anywhere', { keys: ['ctrl+c'], enabled: () => on.anywhere }))
    plugin.binnacle.action('place', logging(ran, 'place', { keys: ['ctrl+c'], place: 'line', enabled: () => on.place }))
    plugin.binnacle.action('first', logging(ran, 'first', { keys: ['ctrl+c'], place: 'line', first: true, enabled: () => on.first }))
  })
  await terminal.read()
  for (const step of ['first', 'part', 'place', 'anywhere'] as const) {
    terminal.type('\x03')
    on[step] = false
  }
  terminal.type('\x03')
  terminal.type('\x03')
  assert.deepEqual([ran, typed, exits], [['first', 'place', 'anywhere'], ['\x03'], [0]])
})

test('an action marked `first` with no Place takes its key after the Part with the Focus and the Place’s actions, as the actions with no Place do', async () => {
  const ran: string[] = []
  const typed: string[] = []
  const { author, terminal } = await booted()
  await author('feature', (plugin) => {
    plugin.binnacle.show({ name: 'ask', focus: 'line', layout: { place: 'line' } })
    plugin.binnacle.place('line', line(typed))
    plugin.binnacle.action('anywhere', logging(ran, 'anywhere', { keys: ['enter'], first: true }))
  })
  await terminal.read()
  terminal.type(ENTER)
  assert.deepEqual([ran, typed], [[], [ENTER]])
})

test('when two enabled actions of different ids take a key at one step, the one set last wins', async () => {
  const ran: string[] = []
  const { author, terminal } = await booted()
  await author('older', (plugin) => {
    plugin.binnacle.action('older', logging(ran, 'older', { keys: ['ctrl+n'] }))
  })
  await author('newer', (plugin) => {
    plugin.binnacle.action('newer', logging(ran, 'newer', { keys: ['ctrl+n'] }))
  })
  await terminal.read()
  terminal.type(CTRL_N)
  assert.deepEqual(ran, ['newer'])
})

test('an action whose `enabled()` returns false takes no gesture, as if it were not set: the gesture goes on to the action beneath it by the same id, then to the next taker', async () => {
  const ran: string[] = []
  const on = { older: true, newer: false }
  const { author, terminal } = await booted()
  await author('feature', (plugin) => {
    plugin.binnacle.action('other', logging(ran, 'other', { keys: ['ctrl+n'] }))
    plugin.binnacle.action('send', logging(ran, 'older', { keys: ['ctrl+n'], enabled: () => on.older }))
    plugin.binnacle.action('send', logging(ran, 'newer', { keys: ['ctrl+n'], enabled: () => on.newer }))
  })
  await terminal.read()
  terminal.type(CTRL_N)
  on.older = false
  terminal.type(CTRL_N)
  on.newer = true
  terminal.type(CTRL_N)
  assert.deepEqual(ran, ['older', 'other', 'newer'])
})

test('binding a kind, such as `list.toggle`, binds every action of that kind; binding one id binds only that action, and wins over its kind’s binding', async () => {
  const ran: string[] = []
  const { author, terminal, ctx } = await booted()
  await author('feature', (plugin) => {
    plugin.binnacle.show({ name: 'lists', focus: 'fruit', layout: { column: [{ place: 'fruit' }, { place: 'trees' }] } })
    for (const place of ['fruit', 'trees']) {
      plugin.binnacle.place(place, { lines: () => [place] })
      plugin.binnacle.action(`${place}.toggle`, logging(ran, place, { kind: 'list.toggle', place }))
    }
  })
  await terminal.read()
  terminal.type(' ')
  await author('binds the kind', (plugin) => {
    plugin.binnacle.bind('list.toggle', ['space'])
  })
  terminal.type(' ')
  terminal.type(SHIFT_TAB)
  terminal.type(' ')
  await author('binds one id', (plugin) => {
    plugin.binnacle.bind('trees.toggle', ['t'])
  })
  terminal.type(' ')
  terminal.type('t')
  assert.deepEqual(
    [ran, ctx.binnacle.keysOf('fruit.toggle'), ctx.binnacle.keysOf('trees.toggle')],
    [['fruit', 'trees', 'trees'], ['space'], ['t']],
  )
})

test('an author adds a key to an action without repeating its others, using `binnacle.keysOf(id)`', async () => {
  const ran: string[] = []
  const { author, terminal, ctx } = await booted()
  await author('feature', (plugin) => {
    plugin.binnacle.action('send', logging(ran, 'send', { keys: ['enter', 'ctrl+s'] }))
  })
  await author('adds a key', (plugin) => {
    plugin.binnacle.bind('send', [...plugin.binnacle.keysOf('send'), 'ctrl+n'])
  })
  await terminal.read()
  terminal.type(CTRL_N)
  terminal.type(ENTER)
  assert.deepEqual([ran, ctx.binnacle.keysOf('send'), ctx.binnacle.keysOf('none')], [['send', 'send'], ['enter', 'ctrl+s', 'ctrl+n'], []])
})

test('`binnacle.keysOf(id)` gives the keys of the newest action by the id, enabled or not, as an action that names its own keys owns its id’s keys', async () => {
  const { author, ctx } = await booted()
  await author('feature', (plugin) => {
    plugin.binnacle.action('send', { keys: ['enter'], run: () => {} })
    plugin.binnacle.action('send', { keys: ['ctrl+x'], enabled: () => false, run: () => {} })
  })
  assert.deepEqual(ctx.binnacle.keysOf('send'), ['ctrl+x'])
})

test('`binnacle.run(id)` runs the newest enabled action by that id, wherever the Focus is, since a call is not a gesture; with none enabled, nothing runs', async () => {
  const ran: string[] = []
  const on = { older: true, newer: false }
  const { author, terminal, ctx } = await booted()
  await author('feature', (plugin) => {
    plugin.binnacle.place('elsewhere', { lines: () => ['elsewhere'] })
    plugin.binnacle.action('send', logging(ran, 'older', { place: 'elsewhere', enabled: () => on.older }))
    plugin.binnacle.action('send', logging(ran, 'newer', { place: 'elsewhere', enabled: () => on.newer }))
  })
  await terminal.read()
  ctx.binnacle.run('send')
  on.newer = true
  ctx.binnacle.run('send')
  on.older = false
  on.newer = false
  ctx.binnacle.run('send')
  ctx.binnacle.run('none')
  assert.deepEqual(ran, ['older', 'newer'])
})

test('an action set with the id of another is handed the one it hides, as `beneath`, and can run it, so two plugins that each change what one action does both act, the newest first', async () => {
  const ran: string[] = []
  const { author, terminal } = await booted()
  await author('built-in', (plugin) => {
    plugin.binnacle.action('send', logging(ran, 'send', { keys: ['enter'] }))
  })
  for (const name of ['preview', 'answer all'])
    await author(name, (plugin) => {
      plugin.binnacle.action('send', logging(ran, name, { run: (_at, beneath) => beneath() }))
    })
  await terminal.read()
  terminal.type(ENTER)
  assert.deepEqual(ran, ['answer all', 'preview', 'send'])
})

test('`beneath` is found each time it runs: the newest enabled action by that id beneath this one, wherever the Focus is, or nothing', async () => {
  const ran: string[] = []
  const on = { middle: true }
  let kept: (() => void) | undefined
  const { author, terminal, ctx } = await booted()
  await author('built-in', (plugin) => {
    plugin.binnacle.action('send', logging(ran, 'send', { place: 'elsewhere', run: (_at, beneath) => beneath() }))
  })
  const middle = await author('middle', (plugin) => {
    plugin.binnacle.action('send', logging(ran, 'middle', { run: (_at, beneath) => beneath(), enabled: () => on.middle }))
  })
  await author('top', (plugin) => {
    plugin.binnacle.action(
      'send',
      logging(ran, 'top', {
        run: (_at, beneath) => {
          kept = beneath
          beneath()
        },
      }),
    )
  })
  await terminal.read()
  ctx.binnacle.run('send')
  on.middle = false
  kept?.()
  on.middle = true
  await middle.dispose()
  kept?.()
  assert.deepEqual(ran, ['top', 'middle', 'send', 'send', 'send'])
})

test('a Place whose Part takes no keys takes the Focus while an action acts in it', async () => {
  const ran: string[] = []
  const { author, terminal } = await booted()
  await author('feature', (plugin) => {
    plugin.binnacle.layout('chat', { column: [{ place: 'list', size: 'content' }] })
    plugin.binnacle.place('list', { lines: () => ['list'] })
    plugin.binnacle.action('list.pick', logging(ran, 'pick', { keys: ['enter'], place: 'list' }))
  })
  await terminal.read()
  terminal.type(ENTER)
  assert.deepEqual(ran, ['pick'])
})

test('a click that the Part does not take goes to the actions of its Place bound to `click`, with the cell clicked in the Part’s lines', async () => {
  const at: (Point | undefined)[] = []
  const { author, terminal } = await booted(10, 3)
  await author('feature', (plugin) => {
    plugin.binnacle.layout('chat', { column: [{ place: 'list', size: { fixed: 2 } }, { place: 'other' }] })
    plugin.binnacle.place('list', { lines: () => ['fig', 'oak'] })
    plugin.binnacle.place('other', { lines: () => ['other'] })
    plugin.binnacle.action('list.pick', { keys: ['click'], place: 'list', run: (point) => at.push(point) })
    plugin.binnacle.action('anywhere.pick', { keys: ['click'], run: (point) => at.push(point) })
  })
  await terminal.read()
  terminal.type(clickAt(2, 1))
  terminal.type(clickAt(0, 2))
  assert.deepEqual(at, [{ line: 1, column: 2 }])
})

test('an action that names no `place` keeps the Place of the action it hides, so an action set by the id of a Place’s action takes a key or a click only in that Place', async () => {
  const ran: string[] = []
  const { author, terminal, ctx } = await booted(10, 3)
  await author('built-in', (plugin) => {
    plugin.binnacle.layout('chat', {
      column: [
        { place: 'choices', size: { fixed: 1 } },
        { place: 'line', size: { fixed: 1 } },
      ],
    })
    plugin.binnacle.place('choices', { lines: () => ['choices'] })
    plugin.binnacle.place('line', { lines: () => ['line'], key: () => false })
    plugin.binnacle.action('choices.toggle', logging(ran, 'toggle', { keys: ['space', 'click'], place: 'choices' }))
    plugin.binnacle.action('line.send', logging(ran, 'send', { keys: ['enter'], place: 'line' }))
  })
  await author('author', (plugin) => {
    plugin.binnacle.action('choices.toggle', logging(ran, 'selects', { run: (_at, beneath) => beneath() }))
  })
  await terminal.read()
  const steps: [string, () => void][] = [
    ['space in line', () => (ctx.binnacle.focus('line'), terminal.type(' '))],
    ['click in line', () => terminal.type(clickAt(0, 1))],
    ['space in choices', () => (ctx.binnacle.focus('choices'), terminal.type(' '))],
    ['click in choices', () => terminal.type(clickAt(0, 0))],
  ]
  const took = steps.map(([step, act]) => {
    ran.length = 0
    act()
    return [step, [...ran]]
  })
  assert.deepEqual(took, [
    ['space in line', []],
    ['click in line', []],
    ['space in choices', ['selects', 'toggle']],
    ['click in choices', ['selects', 'toggle']],
  ])
})

test('an action that names no `place` keeps the `first` of the action it hides, so it still takes its key before the Part with the Focus', async () => {
  const ran: string[] = []
  const typed: string[] = []
  const { author, terminal } = await booted()
  await author('built-in', (plugin) => {
    plugin.binnacle.show({ name: 'ask', focus: 'line', layout: { place: 'line' } })
    plugin.binnacle.place('line', line(typed))
    plugin.binnacle.action('ask.next', logging(ran, 'next', { keys: ['tab'], place: 'line', first: true }))
  })
  await author('author', (plugin) => {
    plugin.binnacle.action('ask.next', logging(ran, 'mine'))
  })
  await terminal.read()
  terminal.type(TAB)
  assert.deepEqual([ran, typed], [['mine'], []])
})

test("an action that names no `place` keeps the `first` that an action between it and the Place's action names", async () => {
  const ran: string[] = []
  const typed: string[] = []
  const { author, terminal } = await booted()
  await author('built-in', (plugin) => {
    plugin.binnacle.show({ name: 'ask', focus: 'line', layout: { place: 'line' } })
    plugin.binnacle.place('line', line(typed))
    plugin.binnacle.action('ask.next', logging(ran, 'next', { keys: ['tab'], place: 'line', first: true }))
  })
  await author('after', (plugin) => {
    plugin.binnacle.action('ask.next', logging(ran, 'after', { first: false }))
  })
  await author('author', (plugin) => {
    plugin.binnacle.action('ask.next', logging(ran, 'mine'))
  })
  await terminal.read()
  terminal.type(TAB)
  assert.deepEqual([ran, typed], [[], [TAB]])
})

test('an action that names its own `place` acts there, not in the Place of the action it hides', async () => {
  const ran: string[] = []
  const { author, terminal, ctx } = await booted(10, 3)
  await author('built-in', (plugin) => {
    plugin.binnacle.layout('chat', {
      column: [
        { place: 'choices', size: { fixed: 1 } },
        { place: 'line', size: { fixed: 1 } },
      ],
    })
    plugin.binnacle.place('choices', { lines: () => ['choices'] })
    plugin.binnacle.place('line', { lines: () => ['line'], key: () => false })
    plugin.binnacle.action('choices.toggle', logging(ran, 'toggle', { keys: ['space'], place: 'choices' }))
  })
  await author('author', (plugin) => {
    plugin.binnacle.action('choices.toggle', logging(ran, 'mine', { place: 'line' }))
  })
  await terminal.read()
  ctx.binnacle.focus('choices')
  terminal.type(' ')
  ctx.binnacle.focus('line')
  terminal.type(' ')
  assert.deepEqual(ran, ['mine'])
})
