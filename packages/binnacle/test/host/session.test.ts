/**
 * The session the host opens: the dsh calls a sent line and an interrupt make, and the command grant over dsh's own commands.
 *
 * The agents and their sessions are faked, as the host's tests fake them,
 * but the commands are dsh's own `CommandRuntime`, mounted for real: the
 * grant's contract — it resolves whether a command ran, whatever the command
 * returned — is held against what dsh's executor really does, not a
 * restatement of it.
 * @module binnacle/test/host/session
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { load } from 'js-yaml'
import commands from '@deepseek-ai/dsh-commands'
import { AgentPresetRegistry } from '@deepseek-ai/dsh-agent-preset-registry'
import { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import { createScope } from '@deepseek-ai/dsh-scope'
import { SkillRegistry, isModelInvocable } from '@deepseek-ai/dsh-skill'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { openSession } from '../../src/host/session.ts'
import type { OpenedSession } from '../../src/host/session.ts'

/** The events dsh's executor logs, as it logs them: through the agent's session. */
const logged: SessionEvent[] = []
let seq = 0

/** The agents the host opens a session through, faked: each holds one idle agent whose session records what dsh appends. */
const agents = {
  async create(): Promise<{ readonly agent: object; readonly dispose: () => Promise<void> }> {
    const agent = {
      session: {
        snapshotEvents: (): readonly SessionEvent[] => [],
        append: (type: string, data: unknown): SessionEvent => {
          const event = { type, seq: seq++, time: 0, data } as SessionEvent
          logged.push(event)
          return event
        },
      },
      steer: (_text: string): void => {},
      status: 'idle',
      cancel: (): void => {},
    }
    return { agent, dispose: async () => {} }
  },
}

/**
 * Open a session over dsh's own commands, on the default model.
 * @returns the open session, and dsh's command registry.
 */
async function opened(): Promise<{ readonly session: OpenedSession; readonly registry: Context['commands'] }> {
  const ctx = new Context()
  await ctx.plugin(commands)
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4' }) } as never)
  ctx.provide('agents', agents as never)
  return { session: await openSession(ctx), registry: ctx.commands }
}

/**
 * The registry the session's tests that are not about presets stand the seam
 * in with: it binds whatever it is asked, as the real one binds the default.
 */
const standInRegistry = () => ({ mount: async () => ({ id: 'standard' }) })

/**
 * The agents dsh's own registry stands in for here: each create hands the
 * setup a scoped context, as dsh mints for an agent, and waits for it —
 * binding a preset is part of an agent's setup
 * (`dsh:packages/core/agent/src/index.ts`).
 * @param ctx - the runtime the agent and its scope live in.
 * @param opened - what create returns for the agent it made.
 * @returns the fake registry service, and the scope's context it handed the setup.
 */
function scopedAgents(
  ctx: Context,
  made: { readonly agent: object },
): { readonly service: object; readonly agentCtx: () => Context | undefined } {
  let agentCtx: Context | undefined
  return {
    service: {
      create: async (options: { readonly setup: (agentCtx: Context) => void | Promise<void> }): Promise<unknown> => {
        // dsh keys an agent's scope by the agent itself, so the preset's layers select for it.
        const scope = createScope(ctx, made.agent)
        await options.setup(scope.ctx)
        agentCtx = scope.ctx
        return { ...made, dispose: async () => {} }
      },
    },
    agentCtx: () => agentCtx,
  }
}

test('a command whose handler threw still ran: dsh logs its failure as its done, and the grant resolves true', async () => {
  const { session, registry } = await opened()
  registry.register({
    name: 'boom',
    description: 'goes bang',
    handler: () => {
      throw new Error('kaput')
    },
  })
  assert.equal(await session.command('/boom now'), true)
  assert.deepEqual(
    logged.map((event) => event.type),
    ['command/run', 'command/done'],
  )
  const done = logged.at(-1)
  assert.ok(done !== undefined && done.type === 'command/done')
  // dsh pairs the done with its run by an id it minted; what the grant hands a person is the pair, not the id.
  const { commandId: _commandId, ...failure } = done.data as { readonly commandId: unknown; readonly kind: unknown; readonly text: unknown }
  assert.deepEqual(failure, { kind: 'error', text: 'kaput' })
})

test('a line naming no command resolves false, and nothing is logged', async () => {
  const { session } = await opened()
  logged.length = 0
  assert.equal(await session.command('/nothing here'), false)
  assert.deepEqual(logged, [])
})

/** Every way a line can reach the agent, as dsh names the call, with what it was handed. */
interface Sent {
  readonly method: 'steer' | 'followup' | 'inject'
  readonly message: UserMessage
}

test("a line sent steers the agent with the person's message; interrupt cancels as the user, keeping the inbox", async () => {
  const ctx = new Context()
  const sent: Sent[] = []
  const cancels: { readonly cause: unknown; readonly options: unknown }[] = []
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4' }) } as never)
  ctx.provide('agents', {
    create: async () => ({
      agent: {
        session: {},
        get status() {
          return 'idle' as const
        },
        steer: (message: UserMessage) => {
          sent.push({ method: 'steer', message })
        },
        followup: (message: UserMessage) => {
          sent.push({ method: 'followup', message })
        },
        inject: (message: UserMessage) => {
          sent.push({ method: 'inject', message })
        },
        cancel: (cause: unknown, options: unknown) => {
          cancels.push({ cause, options })
        },
      },
      dispose: async () => {},
    }),
  } as never)
  const session = await openSession(ctx)
  session.send('use pnpm')
  session.interrupt()
  // The line reaches the agent once, by steer — a follow-up would wait the turn out — as a user message of the
  // person's text; its id is dsh's own, minted fresh, so only its presence is asserted.
  assert.equal(sent.length, 1)
  const line = sent[0]
  assert.ok(line !== undefined, 'the line was sent once')
  assert.equal(line.method, 'steer')
  assert.equal(line.message.role, 'user')
  assert.deepEqual(line.message.content, [{ type: 'text', text: 'use pnpm' }])
  assert.deepEqual(line.message.source, { kind: 'user' })
  assert.equal(typeof line.message.id, 'string')
  assert.deepEqual(cancels, [{ cause: { kind: 'user' }, options: { keepInbox: true } }])
})

test("where the session stands is heard again as the agent's status flips, which dsh says only after the turn's last event is logged", async () => {
  const ctx = new Context()
  ctx.provide('agentPresets', standInRegistry() as never)
  const agent = { session: {} }
  const { service: created, agentCtx } = scopedAgents(ctx, { agent })
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4' }) } as never)
  ctx.provide('agents', created as never)
  const session = await openSession(ctx)
  const bound = agentCtx()
  assert.ok(bound !== undefined)
  let heard = 0
  const stop = session.onStanding(() => {
    heard++
  })
  bound.emit('agent/status', { agent: agent as never, status: 'idle' })
  assert.equal(heard, 1)
  stop()
  bound.emit('agent/status', { agent: agent as never, status: 'running' })
  assert.equal(heard, 1)
})

test('following a session hears what it logged before, then what it logs after, each once and in order, and nothing of another session', async () => {
  const ctx = new Context()
  const earlier = { type: 'turn/start', seq: 1, time: 0, data: {} } as unknown as SessionEvent
  const later = { type: 'turn/end', seq: 2, time: 0, data: {} } as unknown as SessionEvent
  const log = { snapshotEvents: (): readonly SessionEvent[] => [earlier] }
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4' }) } as never)
  ctx.provide('agents', { create: async () => ({ agent: { session: log }, dispose: async () => {} }) } as never)
  const session = await openSession(ctx)
  const heard: SessionEvent[] = []
  session.follow((event) => {
    heard.push(event)
  })
  ctx.emit('session/event', log as never, later)
  ctx.emit('session/event', {} as never, earlier)
  assert.deepEqual(heard, [earlier, later])
})

test('following a session misses nothing logged while what was logged before is being heard, and hears each event once', async () => {
  const ctx = new Context()
  const first = { type: 'turn/start', seq: 1, time: 0, data: {} } as unknown as SessionEvent
  const during = { type: 'turn/end', seq: 2, time: 0, data: {} } as unknown as SessionEvent
  const log = { snapshotEvents: (): readonly SessionEvent[] => [first] }
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4' }) } as never)
  ctx.provide('agents', { create: async () => ({ agent: { session: log }, dispose: async () => {} }) } as never)
  const session = await openSession(ctx)
  const heard: SessionEvent[] = []
  session.follow((event) => {
    heard.push(event)
    // What a listener does on hearing the first event logs the next, before the replay is over.
    if (event === first) ctx.emit('session/event', log as never, during)
  })
  assert.deepEqual(heard, [first, during])
})

test('an event both in the log as it is read and on the feed is heard once', async () => {
  const ctx = new Context()
  const first = { type: 'turn/start', seq: 1, time: 0, data: {} } as unknown as SessionEvent
  // dsh announces an event as it appends it, so one appended as the log is read reaches the listener twice over.
  const log = {
    snapshotEvents: (): readonly SessionEvent[] => {
      ctx.emit('session/event', log as never, first)
      return [first]
    },
  }
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4' }) } as never)
  ctx.provide('agents', { create: async () => ({ agent: { session: log }, dispose: async () => {} }) } as never)
  const session = await openSession(ctx)
  const heard: SessionEvent[] = []
  session.follow((event) => {
    heard.push(event)
  })
  assert.deepEqual(heard, [first])
})

test("the answer streaming is heard for the session's own agent, and never for another", async () => {
  const ctx = new Context()
  const agent = { session: { snapshotEvents: (): readonly SessionEvent[] => [] } }
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4' }) } as never)
  ctx.provide('agents', { create: async () => ({ agent, dispose: async () => {} }) } as never)
  const session = await openSession(ctx)
  const heard: unknown[] = []
  const stop = session.onStream((frame) => {
    heard.push(frame)
  })
  const own = { type: 'start', attemptId: 'a1', revision: 1, turn: 1, step: 1 }
  ctx.emit('agent/assistant-stream', { agent: agent as never, frame: own as never })
  ctx.emit('agent/assistant-stream', { agent: { session: {} } as never, frame: { ...own, attemptId: 'a2' } as never })
  stop()
  ctx.emit('agent/assistant-stream', { agent: agent as never, frame: { ...own, attemptId: 'a3' } as never })
  assert.deepEqual(heard, [own])
})

/**
 * Open a session over dsh's real preset machinery: the Loader, the session
 * projections the registry registers into, and the registry itself, with the
 * presets a test declares — the shipped declarations are held by
 * `check-presets`, and the boot by `check:boot`.
 * @param presets - each preset to register, by id.
 * @param config - the registry's config, as binnacle's patch sets it.
 * @param host - the host plane to mount beside it, as dsh-base's surviving rows do.
 * @returns the runtime, the open session, the agent it opened, and the context its setup was handed.
 */
async function onPresets(
  presets: readonly { readonly id: string; readonly plugins: readonly unknown[] }[],
  config: { readonly default: string },
  host: (ctx: Context) => Promise<void> = async () => {},
): Promise<{
  readonly ctx: Context
  readonly session: OpenedSession
  readonly agent: object
  readonly agentCtx: () => Context | undefined
}> {
  const ctx = new Context()
  // Rows resolve and `!!js` config evaluates from where the test sits: inside this package.
  ctx.baseUrl = new URL('.', import.meta.url).href
  await host(ctx)
  await ctx.plugin(Loader)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(commands)
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4' }) } as never)
  const agent = { session: { snapshotEvents: (): readonly SessionEvent[] => [] } }
  const { service: created, agentCtx } = scopedAgents(ctx, { agent })
  ctx.provide('agents', created as never)
  await ctx.plugin(AgentPresetRegistry, config)
  for (const preset of presets) await ctx.agentPresets.register({ ...preset, plugins: preset.plugins as never })
  return { ctx, session: await openSession(ctx), agent, agentCtx }
}

test("a session opens its agent on the registry's default preset, as the registry binds it", async () => {
  const { ctx, agentCtx } = await onPresets([{ id: 'standard', plugins: [] }], { default: 'standard' })
  const bound = agentCtx()
  assert.ok(bound !== undefined, 'the agent was created')
  assert.equal(ctx.agentPresets.composedPreset(bound), 'standard')
})

/** The rows of the shipped author preset a test install holds: the two the issue gave the author preset alone. */
const AUTHOR_ROWS = new Set(['@deepseek-ai/dsh-skill-filesystem', '@deepseek-ai/dsh-plugin-manager/tools'])

/**
 * The author preset's own rows, read from the shipped file in the Loader's own
 * dialect, so the expressions and the condition it declares are the ones
 * evaluated; watching is off, as a profile's own patch may turn it off. The
 * rest of its list is `standard`'s, which the copies gate holds.
 * @returns the plugin rows to register as the test's author preset.
 */
function authorRows(): unknown[] {
  const declared = load(readFileSync(new URL('../../presets/author.patch.yml', import.meta.url), 'utf8'), {
    schema: entryListSchema,
  }) as { readonly insert?: readonly { readonly config?: { readonly id?: string; readonly plugins?: readonly unknown[] } }[] }[]
  const rows = declared.flatMap((entry) => [...(entry.insert ?? [])]).find((row) => row.config?.id === 'author')
  return (rows?.config?.plugins ?? [])
    .filter((row): row is { readonly name: string; readonly config?: Record<string, unknown> } => {
      const name = (row as { readonly name?: unknown }).name
      return typeof name === 'string' && AUTHOR_ROWS.has(name)
    })
    .map((row) => ({ ...row, config: { ...row.config, watch: false } }))
}

/**
 * Open a session over the host plane the author preset's rows read — dsh's
 * skills registry, its tool runtime and sandbox policy, a stand-in plugin
 * manager — under the default a test names, with or without the profile a
 * launcher runs under. A stand-in profile names an empty directory, for the
 * compatibility preflight reads it (`dsh:packages/boot/app-boot/src/compatibility-preflight.ts`).
 * @param preset - the registry's default, as the profile's patch overrides it.
 * @param underProfile - whether a launcher provides `profileContext`.
 * @returns the session's runtime, its open session, and the agent it opened.
 */
async function onAuthorish(
  preset: string,
  underProfile: boolean,
): Promise<{
  readonly ctx: Context
  readonly session: OpenedSession
  readonly agent: object
  readonly agentCtx: () => Context | undefined
}> {
  const session = await onPresets(
    [
      { id: 'standard', plugins: [] },
      { id: 'author', plugins: authorRows() },
    ],
    { default: preset },
    async (host) => {
      await host.plugin(SystemPrompt, {})
      await host.plugin(SkillRegistry)
      await host.plugin(ToolRuntime)
      await host.plugin(SandboxPolicyService)
      host.provide('pluginManager', {} as never)
      if (underProfile) {
        const profile = mkdtempSync(join(tmpdir(), 'binnacle-profile-'))
        host.provide('profileContext', { name: 'binnacle', dir: profile } as never)
      }
    },
  )
  return session
}

/** A scratch skill written into the package's `skills/` directory, removed again once read. */
async function withScratchSkill(name: string, read: () => Promise<void>): Promise<void> {
  const dir = new URL('../../skills/', import.meta.url)
  const skill = new URL(`${name}/`, dir)
  mkdirSync(skill, { recursive: true })
  writeFileSync(
    new URL('SKILL.md', skill),
    `---\nname: ${name}\ndescription: A skill the test wrote where the author preset looks.\n---\n\nWritten by a test.\n`,
  )
  try {
    await read()
  } finally {
    rmSync(skill, { recursive: true, force: true })
  }
}

test("a session the profile's patch opens on author carries binnacle's skills directory, and plugin_manager when there is a profile", async (t) => {
  await withScratchSkill('test-author-scratch', async () => {
    const { ctx, session, agent, agentCtx } = await onAuthorish('author', true)
    t.after(() => ctx.fiber.dispose())
    const bound = agentCtx()
    assert.ok(bound !== undefined, 'the agent was created')
    assert.equal(ctx.agentPresets.composedPreset(bound), 'author')
    const offered = await session.offers()
    assert.ok(
      offered.some((offer) => offer.name === 'test-author-scratch'),
      "the author preset's skills directory is in the session's catalog",
    )
    const tools = ctx.tools.schemas(agent as never)
    assert.ok(
      tools.some((tool) => tool.name === 'plugin_manager'),
      'the author preset composes the plugin manager under a profile',
    )
  })
})

test('a session on author without a profile has no plugin_manager, the row staying disabled as it declares', async (t) => {
  const { ctx, agent, agentCtx } = await onAuthorish('author', false)
  t.after(() => ctx.fiber.dispose())
  const bound = agentCtx()
  assert.ok(bound !== undefined, 'the agent was created')
  assert.equal(ctx.agentPresets.composedPreset(bound), 'author')
  const tools = ctx.tools.schemas(agent as never)
  assert.ok(
    tools.every((tool) => tool.name !== 'plugin_manager'),
    'no profile, no plugin manager',
  )
})

test('the author skill the preset mounts is in the model’s catalog and loads its router; standard’s is not', async (t) => {
  const { ctx, agent } = await onAuthorish('author', true)
  t.after(() => ctx.fiber.dispose())
  const catalog = await ctx.skills.list({ cwd: process.cwd(), scope: agent })
  const listed = catalog.find(({ name }) => name === 'binnacle-author')
  assert.ok(listed !== undefined, 'the author preset’s catalog lists binnacle-author')
  assert.ok(isModelInvocable(listed), 'the model reaches it')
  assert.equal(listed.invocation.userInvocable, false, 'a person does not: it is the agent’s')
  const loaded = await ctx.skills.get('binnacle-author', { cwd: process.cwd(), scope: agent })
  assert.ok(loaded !== undefined, 'the skill loads')
  assert.match(loaded.content, /themes\.md/, 'loading it gives the chapter’s router')
  const base = listed.resourceBase
  assert.ok(base?.kind === 'directory', 'the catalog names the skill’s base directory')
  assert.ok(existsSync(join(base.path, 'themes.md')), 'the chapter the router names is where it says')
})

test('a session on standard lists no author skill', async (t) => {
  const { ctx, agent } = await onAuthorish('standard', true)
  t.after(() => ctx.fiber.dispose())
  const catalog = await ctx.skills.list({ cwd: process.cwd(), scope: agent })
  assert.ok(
    catalog.every(({ name }) => name !== 'binnacle-author'),
    'standard’s catalog holds no binnacle-author',
  )
})

test('a session on standard has neither the skills directory nor the plugin manager', async (t) => {
  await withScratchSkill('test-author-scratch', async () => {
    const { ctx, session, agent, agentCtx } = await onAuthorish('standard', true)
    t.after(() => ctx.fiber.dispose())
    const bound = agentCtx()
    assert.ok(bound !== undefined, 'the agent was created')
    assert.equal(ctx.agentPresets.composedPreset(bound), 'standard')
    const offered = await session.offers()
    assert.ok(
      offered.every((offer) => offer.name !== 'test-author-scratch'),
      "standard's catalog does not include binnacle's skills directory",
    )
    const tools = ctx.tools.schemas(agent as never)
    assert.ok(
      tools.every((tool) => tool.name !== 'plugin_manager'),
      'standard composes no plugin manager',
    )
  })
})
