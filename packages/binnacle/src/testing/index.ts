import type { Context } from '@deepseek-ai/cordis'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent'
import { bindScopeParent, scopeTarget } from '@deepseek-ai/dsh-scope'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import { UserQuestionError } from '@deepseek-ai/dsh-user-questions'
import type { AskUserQuestionAnswer, AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions'
import type { Binnacle } from '../api.ts'
import { agents } from './agents.ts'
import { mountCore } from './core.ts'
import { persistence } from './sessions.ts'

/** A plugin as Cordis loads it: a module with `apply`, and a `name` that names its row. */
export interface Plugin {
  readonly name?: string
  readonly inject?: readonly string[] | Readonly<Record<string, unknown>>
  apply(ctx: Context, config?: never): void | Promise<void>
}

/** A subagent of the agent, to ask or to approve as. */
export interface Subagent {
  readonly id: string
}

export interface MountOptions {
  /** The terminal's size, 80 × 24 by default. */
  readonly size?: { readonly columns: number; readonly rows: number }
  /** The bundle's rows by id, such as `binnacle-composer`: `'all'` by default, `[]` for none. */
  readonly builtins?: 'all' | readonly string[]
  /** An author's plugins, each a module or a module and its config, loaded after the built-ins, each a row of its own. */
  readonly plugins?: readonly (Plugin | readonly [Plugin, unknown])[]
  /** Opens this session read only, in place of a new one. */
  readonly stored?: { readonly id: string; readonly events: readonly SessionEvent[] }
  /** The fake agent's model, `deepseek-v4` of `deepseek` by default. */
  readonly model?: { readonly provider: string; readonly model: string }
  /**
   * Provides services of dsh's that a test fakes, such as `tools` or `commands`, before binnacle starts.
   * One by the name of a fake of the mount's own, `agents` or `agentDefaultModel`, replaces it: an `agents` whose `create` never settles keeps the session from opening.
   */
  readonly provide?: (ctx: Context) => void
}

/** How a cell's text is drawn. A colour is a palette index, `#rrggbb`, or `default`. */
export interface CellStyle {
  readonly colour: number | string
  readonly background: number | string
  readonly bold: boolean
  readonly dim: boolean
  readonly italic: boolean
  readonly underline: boolean
  readonly inverse: boolean
}

export interface Mounted {
  /** The rows, plain, once binnacle has drawn. */
  screen(): Promise<string[]>
  /** How the text in a cell is drawn, the cell counted from 0. */
  style(x: number, y: number): Promise<CellStyle>
  /** The cell where the core puts the cursor of the Part with the Focus. The terminal's own cursor stays hidden, as a Part draws its own. */
  cursor(): Promise<{ readonly x: number; readonly y: number }>
  /** A key by name: `enter`, `escape`, `tab`, `shift+tab`, `backspace`, `delete`, `space`, `up`, `down`, `left`, `right`, `home`, `end`, `pageup`, `pagedown`, or `ctrl+<letter>`. */
  press(key: string): Promise<void>
  type(text: string): Promise<void>
  /** A click on a cell, counted from 0. */
  click(x: number, y: number, gesture?: 'click' | 'shift+click'): Promise<void>
  /** Notches of the wheel over a cell: up while positive. */
  wheel(x: number, y: number, notches: number): Promise<void>
  resize(columns: number, rows: number): Promise<void>
  readonly agent: {
    status(status: 'idle' | 'running'): Promise<void>
    /** Commits an event of the session: its seq is the next, and its time the fake clock's, unless it names them. */
    commit(event: { readonly type: string; readonly data: unknown; readonly seq?: number; readonly time?: number }): Promise<void>
    stream(frame: AssistantStreamFrame): Promise<void>
    /** What the session sent the agent: a prompt as a followup, or a steer of the turn that runs. */
    readonly sent: readonly { readonly how: 'followup' | 'steer'; readonly text: string }[]
    /** Each time the session interrupted the turn: what it asked dsh's agent to cancel with. */
    readonly cancels: readonly { readonly cause: unknown; readonly options: unknown }[]
    /** A subagent of the agent, by its session's id. */
    child(id: string): Subagent
  }
  /** A question that a tool asks. It settles when the person answers, or when its signal aborts. */
  ask(questions: readonly AskUserQuestionItem[], options?: { signal?: AbortSignal; agent?: Subagent }): Promise<AskUserQuestionAnswer>
  /** An approval that a tool asks for. It settles when the person answers, or when its signal aborts. */
  approve(
    toolName: string,
    options?: { callId?: string; reason?: string; signal?: AbortSignal; agent?: Subagent },
  ): Promise<ApprovalOutcome>
  readonly clock: { readonly now: number; pass(ms: number): Promise<void> }
  readonly binnacle: Binnacle
  /** The Context that dsh's services and events live on, for what the methods above do not drive. */
  readonly ctx: Context
  /** The codes that binnacle asked dsh to exit with, such as `0` after ctrl+c twice on an empty draft. */
  readonly exits: readonly number[]
  /** Unloads one row by its id, such as `binnacle-composer` or the core's `binnacle`, or an author's plugin by its name, while the mount stays open. */
  unload(name: string): Promise<void>
  /** Unloads every plugin, cancels their timers, and puts back what the mount replaced. */
  close(): Promise<void>
}

/** The bundle's rows, in its order, and the modules they load. */
const BUILT_INS: readonly (readonly [string, string, () => Promise<object>])[] = [
  ['binnacle-transcript', 'binnacle/plugins/transcript', () => import('../plugins/transcript/index.ts')],
  ['binnacle-transcript-view', 'binnacle/plugins/transcript-view', () => import('../plugins/transcript-view/index.ts')],
  ['binnacle-tool-cards', 'binnacle/plugins/tool-cards', () => import('../plugins/tool-cards/index.ts')],
  ['binnacle-composer', 'binnacle/plugins/composer', () => import('../plugins/composer/index.ts')],
  ['binnacle-commands', 'binnacle/plugins/commands', () => import('../plugins/commands/index.ts')],
  ['binnacle-status-line', 'binnacle/plugins/status-line', () => import('../plugins/status-line/index.ts')],
  ['binnacle-requests', 'binnacle/plugins/requests', () => import('../plugins/requests/index.ts')],
  ['binnacle-requests-view', 'binnacle/plugins/requests-view', () => import('../plugins/requests-view/index.ts')],
]

const KEYS: Readonly<Record<string, string>> = {
  enter: '\r',
  escape: '\x1b',
  tab: '\t',
  'shift+tab': '\x1b[Z',
  backspace: '\x7f',
  delete: '\x1b[3~',
  space: ' ',
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  home: '\x1b[H',
  end: '\x1b[F',
  pageup: '\x1b[5~',
  pagedown: '\x1b[6~',
}

function sequenceOf(key: string): string {
  const letter = /^ctrl\+([a-z])$/.exec(key)?.[1]
  if (letter !== undefined) return String.fromCharCode(letter.charCodeAt(0) - 96)
  const sequence = KEYS[key]
  if (sequence === undefined) throw new Error(`binnacle/testing: no key is named ${key}`)
  return sequence
}

// Longer than the input's wait for the rest of a sequence that starts with escape.
const ESCAPE_WAIT_MS = 60

// SGR mouse reports: a press, at a cell counted from 1.
const mouse = (button: number, x: number, y: number): string => `\x1b[<${button};${x + 1};${y + 1}M`

let open = false

const CLOSED = 'binnacle/testing: this mount is closed'

/** binnacle with no terminal, on a fake agent and a fake clock, with the built-ins and an author's plugins, as a profile loads them. One is open at a time. */
export async function mount(options: MountOptions = {}): Promise<Mounted> {
  if (open) throw new Error('binnacle/testing: a mount is open; close it before another')
  const unknown =
    options.builtins === undefined || options.builtins === 'all'
      ? []
      : options.builtins.filter((id) => !BUILT_INS.some(([row]) => row === id))
  if (unknown.length > 0) throw new Error(`binnacle/testing: no built-in row is named ${unknown.join(', ')}`)
  open = true
  // A mount that fails part of the way gives back what it took, so the next test mounts afresh.
  const made: { ctx?: Context; restore?: () => void } = {}
  try {
    return await mounting(options, made)
  } catch (error) {
    await made.ctx?.fiber.dispose().catch(() => {})
    made.restore?.()
    open = false
    throw error
  }
}

async function mounting(options: MountOptions, made: { ctx?: Context; restore?: () => void }): Promise<Mounted> {
  const dsh = agents(options.model)
  const store = options.stored === undefined ? undefined : persistence([{ ...options.stored, createdAt: 0 }])
  const modules = new Map<string, object>()
  class Profile extends Loader {
    override import(name: string) {
      return Promise.resolve(modules.get(name))
    }
  }
  // Each row by its id, or an author's plugin by its name, the core's `binnacle` first, so that the core unloads last.
  const ids = new Map<string, string>()
  // The core is the row `binnacle`, as a profile loads it, so that what it registers ranks as a built-in's.
  const loadCore = async (ctx: Context, module: object) => {
    modules.set('binnacle', module)
    await ctx.plugin(Profile)
    const loader = ctx.get('loader')!
    const id = await loader.create({ name: 'binnacle' })
    ids.set('binnacle', id)
    return { dispose: () => loader.remove(id) }
  }
  const core = await mountCore({
    load: loadCore,
    columns: options.size?.columns ?? 80,
    rows: options.size?.rows ?? 24,
    args: options.stored === undefined ? [] : ['--session', options.stored.id],
    provide: (ctx) => {
      options.provide?.(ctx)
      const provideUnless = (name: string, value: unknown): void => {
        if (ctx.get(name as never) === undefined) ctx.provide(name as never, value as never)
      }
      dsh.provide({ provide: provideUnless } as never)
      if (store !== undefined) provideUnless('sessionPersistence', store)
    },
  })
  const { ctx, terminal, clock } = core
  made.ctx = ctx
  made.restore = core.restore
  let closed = false
  const live = (): void => {
    if (closed) throw new Error(CLOSED)
  }
  const settled = async (): Promise<void> => {
    live()
    await new Promise((resolve) => setImmediate(resolve))
    await terminal.read()
  }

  const named =
    options.builtins === undefined || options.builtins === 'all' ? BUILT_INS : BUILT_INS.filter(([id]) => options.builtins!.includes(id))
  const rows: { id: string; name: string; config?: unknown }[] = []
  for (const [id, name, load] of named) {
    modules.set(name, await load())
    rows.push({ id, name })
  }
  for (const [index, given] of (options.plugins ?? []).entries()) {
    const [plugin, config] = Array.isArray(given) ? (given as readonly [Plugin, unknown]) : [given as Plugin, undefined]
    // A row named `binnacle` or `binnacle/…` ranks as a built-in, so an author's row takes its plugin's own name.
    const name = `author:${plugin.name ?? `plugin-${index + 1}`}`
    modules.set(name, plugin)
    rows.push({ id: plugin.name ?? name, name, config })
  }
  const loader = ctx.get('loader')!
  for (const { id, name, config } of rows) ids.set(id, await loader.create(config === undefined ? { name } : { name, config }))
  core.ready()
  await settled()

  let seq = Math.max(0, ...(options.stored?.events ?? []).map((event) => event.seq))
  const driven = async <T>(run: () => T): Promise<void> => {
    live()
    run()
    await settled()
  }
  const waterfall = (name: string, payload: object, agent: object, fallback: () => Promise<unknown>) => {
    if (closed) return Promise.reject(new Error(CLOSED))
    // dsh's Requests are hooks on a scope of the agent's, typed by dsh's own packages: the fake agent is no such Agent.
    const asked = (ctx.waterfall as unknown as (...args: unknown[]) => Promise<unknown>)(
      scopeTarget(agent, agent as never),
      name,
      { ...payload, agent },
      fallback,
    )
    // A Request that a test leaves standing is dismissed when the mount closes, which is no failure of the test's.
    asked.catch(() => {})
    return asked
  }

  return {
    screen: async () => {
      await settled()
      return (await terminal.read()).rows
    },
    style: async (x, y) => {
      await settled()
      return {
        ...(await terminal.styleAt(x, y)),
        background: await terminal.backgroundAt(x, y),
        inverse: await terminal.inverseAt(x, y),
      }
    },
    cursor: async () => {
      await settled()
      return (await terminal.read()).cursor
    },
    press: async (key) => {
      const sequence = sequenceOf(key)
      await driven(() => terminal.type(sequence))
      // A lone escape is told from the start of a sequence once nothing follows it for a while, by the terminal's own clock.
      if (sequence === '\x1b') {
        await new Promise((resolve) => setTimeout(resolve, ESCAPE_WAIT_MS))
        await settled()
      }
    },
    type: (text) => driven(() => terminal.type(text)),
    click: (x, y, gesture = 'click') => driven(() => terminal.type(mouse(gesture === 'shift+click' ? 4 : 0, x, y))),
    wheel: (x, y, notches) =>
      driven(() => {
        for (let notch = 0; notch < Math.abs(notches); notch++) terminal.type(mouse(notches > 0 ? 64 : 65, x, y))
      }),
    resize: (columns, height) => driven(() => terminal.resize(columns, height)),
    agent: {
      status: (status) => driven(() => dsh.status(ctx, status)),
      commit: (event) =>
        driven(() => {
          seq = event.seq ?? seq + 1
          dsh.commit(ctx, { seq, time: event.time ?? clock.now, type: event.type, data: event.data })
        }),
      stream: (frame) => driven(() => dsh.stream(ctx, frame)),
      get sent() {
        return dsh.sent
      },
      get cancels() {
        return dsh.cancels as readonly { readonly cause: unknown; readonly options: unknown }[]
      },
      child: (id) => {
        live()
        const child = { id }
        bindScopeParent(child, dsh.agent)
        return child
      },
    },
    ask: (questions, { signal, agent = dsh.agent } = {}) =>
      waterfall('user-questions/request', { questions, signal }, agent, () =>
        Promise.reject(new UserQuestionError('no user-questions answerer accepted the request', 'NO_PROVIDER')),
      ) as Promise<AskUserQuestionAnswer>,
    approve: (toolName, { signal, agent = dsh.agent, ...request } = {}) =>
      waterfall('approval/request', { ...request, toolName, signal }, agent, () =>
        Promise.resolve('unavailable' as ApprovalOutcome),
      ) as Promise<ApprovalOutcome>,
    clock: {
      get now() {
        return clock.now
      },
      pass: async (ms) => {
        live()
        await clock.pass(ms)
        await settled()
      },
    },
    get binnacle() {
      return ctx.binnacle
    },
    ctx,
    exits: core.exits,
    unload: async (name) => {
      live()
      const id = ids.get(name)
      if (id === undefined) throw new Error(`binnacle/testing: no row or plugin is named ${name}`)
      ids.delete(name)
      await loader.remove(id)
      await settled()
    },
    close: async () => {
      if (closed) return
      closed = true
      for (const id of [...ids.values()].toReversed()) await loader.remove(id)
      ids.clear()
      // A plugin that a test loaded on the Context itself goes too, with the loader and dsh's fakes.
      await ctx.fiber.dispose()
      core.restore()
      open = false
    },
  }
}
