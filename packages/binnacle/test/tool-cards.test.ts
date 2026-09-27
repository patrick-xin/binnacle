/**
 * The tool cards: a session's tool calls drawn from what their tools present.
 *
 * @module binnacle/test/tool-cards
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { defineTool, ToolRuntime } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { Fact } from '../src/facts/adapt.ts'
import { RegistrationService } from '../src/host/registrations.ts'
import { TranscriptPane } from '../src/panes/transcript.ts'
import { drawText } from '../src/ui/draw.ts'
import { toolCards } from '../src/plugins/tool-cards/index.ts'

/**
 * The cards applied in a Cordis context, with the `binnacle` service and a
 * real dsh `tools` service holding the tools given.
 * @param tools - the tools the session's agent ran, made with dsh's own `defineTool`.
 * @returns the pane they draw through, and the plugin's fiber.
 */
async function withCards(...tools: ToolDefinition[]) {
  const ctx = new Context()
  const registrations = new RegistrationService(ctx)
  await ctx.plugin(SystemPrompt, {})
  const runtime = new ToolRuntime(ctx)
  for (const tool of tools) runtime.register(tool)
  const fiber = await ctx.plugin(toolCards)
  const pane = new TranscriptPane(() => {}, () => registrations.views)
  return { fiber, pane }
}

/** A tool that presents its calls and its results, made with dsh's own `defineTool`. */
const read = defineTool({
  name: 'read',
  description: 'Read a file.',
  parameters: { path: { type: 'string', required: true } },
  output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
  execute: async () => 'the file',
  presentCall: args => ({ card: 'generic', title: `Read ${args.path}` }),
  presentResult: (_args, result) => ({ card: 'generic', content: result.content }),
})

/** A call the model asked for, as it lands in the log. */
const asked = (name: string, args: string): Extract<Fact, { readonly kind: 'call' }> => ({ kind: 'call', seq: 2, time: 2, turn: 1, step: 1, callId: 'c1', name, arguments: args })

/** What a call returned, as it lands in the log. */
const returned = (text: string): Fact => ({ kind: 'result', seq: 3, time: 3, turn: 1, step: 1, callId: 'c1', failed: false, blocks: [{ kind: 'text', text }], meta: undefined })

/** What a call returned, having failed, as it lands in the log. */
const failed = (callId: string): Fact => ({
  kind: 'result', seq: 3, time: 3, turn: 1, step: 1, callId, failed: true,
  failure: { name: 'ExitError', code: 'exit', reason: 'the command exited 2' },
  blocks: [{ kind: 'text', text: 'the model was told' }], meta: undefined,
})

test('a call to a tool that presents it reads as its presented title', async () => {
  const { pane } = await withCards(read)
  pane.push(asked('read', '{"path":"src/api.ts"}'))
  assert.deepEqual(drawText(pane, 60), ['● Read src/api.ts', '  running…'])
  assert.equal(pane.render(60)[0]?.trimEnd(), '\x1b[90m●\x1b[39m Read src/api.ts')
})

test('once it returns, what it returned is folded beneath it, as the tool presents it', async () => {
  const { pane } = await withCards(read)
  pane.push(asked('read', '{"path":"src/api.ts"}'))
  pane.push(returned('a\nb\nc\nd\ne'))
  assert.deepEqual(drawText(pane, 60), ['● Read src/api.ts', 'a', 'b', 'c', '… 2 more lines'])
  assert.equal(pane.render(60)[0]?.trimEnd(), '\x1b[32m●\x1b[39m Read src/api.ts')
})

test('a completed call reads as the title its result presents, when it presents one', async () => {
  const build = defineTool({
    name: 'build',
    description: 'Build the package.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async () => 'built',
    presentCall: () => ({ card: 'generic', title: 'Build the package' }),
    presentResult: () => ({ card: 'generic', title: 'Built the package' }),
  })
  const { pane } = await withCards(build)
  pane.push(asked('build', '{}'))
  assert.deepEqual(drawText(pane, 60), ['● Build the package', '  running…'])
  pane.push(returned('built'))
  assert.deepEqual(drawText(pane, 60), ['● Built the package', 'built'])
})

test('presentResult is handed the result\'s content rebuilt from its text blocks, whether it failed, and its meta as logged', async () => {
  const echo = defineTool({
    name: 'echo',
    description: 'Echo what it is handed.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: async () => 'echoed',
    presentCall: () => ({ card: 'generic', title: 'Echo' }),
    presentResult: (_args, result) => ({
      card: 'generic',
      content: [{ type: 'text', text: `handed ${JSON.stringify({ types: result.content.map(block => block.type), isError: result.isError, meta: result.meta })}` }],
    }),
  })
  const { pane } = await withCards(echo)
  pane.push(asked('echo', '{}'))
  pane.push({
    kind: 'result', seq: 3, time: 3, turn: 1, step: 1, callId: 'c1', failed: true,
    failure: { name: 'ExitError', code: 'exit', reason: 'the command exited 2' },
    blocks: [{ kind: 'text', text: 'ok' }, { kind: 'unread', type: 'image' }],
    meta: { pages: 3 },
  })
  assert.deepEqual(drawText(pane, 90), ['✗ Echo', '  the command exited 2', 'handed {"types":["text"],"isError":true,"meta":{"pages":3}}'])
  assert.equal(pane.render(90).map(line => line.trimEnd())[0], '\x1b[31m✗\x1b[39m Echo')
  assert.equal(pane.render(90).map(line => line.trimEnd())[1], '\x1b[31m  the command exited 2\x1b[39m')
})

test('a call to a tool binnacle cannot find, or that presents nothing, reads as it does today', async () => {
  const silent = defineTool({
    name: 'silent',
    description: 'Presents nothing.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: async () => 'silence',
  })
  const { pane } = await withCards(silent)
  pane.push({ ...asked('missing', '{}'), seq: 4, callId: 'c2' })
  assert.deepEqual(drawText(pane, 60).slice(0, 2), ['● missing {}', '  running…'])
  pane.push(asked('silent', '{}'))
  assert.deepEqual(drawText(pane, 60).slice(2), ['● silent {}', '  running…'])
})

test('a presenter that throws leaves the call to binnacle\'s card, which says what went wrong', async () => {
  const flaky = defineTool({
    name: 'flaky',
    description: 'Presents by throwing.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: async () => 'flaked',
    presentCall: () => { throw new Error('the presenter fell over') },
  })
  const { pane } = await withCards(flaky)
  pane.push(asked('flaky', '{}'))
  assert.deepEqual(drawText(pane, 60), ['● flaky {}', '  running…'])
  pane.push(failed('c1'))
  assert.deepEqual(drawText(pane, 60), ['✗ flaky {}', '  the command exited 2', 'the model was told'])
})

test('a presenter that returns no view of a kind the cards draw, and a call whose arguments are not JSON, read as they do today', async () => {
  const hologram = defineTool({
    name: 'hologram',
    description: 'Presents a kind binnacle does not draw.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: async () => 'hologrammed',
    presentCall: () => ({ card: 'hologram', title: 'A hologram' }) as never,
  })
  const voided = defineTool({
    name: 'voided',
    description: 'Presents nothing for these arguments.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: async () => 'void',
    presentCall: () => undefined,
  })
  const { pane } = await withCards(hologram, voided)
  pane.push(asked('hologram', '{}'))
  pane.push({ ...asked('voided', '{}'), seq: 5, callId: 'c2' })
  pane.push({ ...asked('read', '{oops'), seq: 6, callId: 'c3' })
  assert.deepEqual(drawText(pane, 60), [
    '● hologram {}',
    '  running…',
    '● voided {}',
    '  running…',
    '● read {oops',
    '  running…',
  ])
})

test('every other card kind is drawn by its title alone in this slice', async () => {
  const bash = defineTool({
    name: 'bash',
    description: 'Run a command.',
    parameters: { command: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: async () => 'ran',
    presentCall: args => ({ card: 'terminal', title: args.command, description: 'Run the tests' }),
    presentResult: () => ({ card: 'terminal', title: 'pnpm test (2 s)', output: 'tsc: 1 error\n' }),
  })
  const write = defineTool({
    name: 'write',
    description: 'Write a file.',
    parameters: { path: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: async () => 'wrote',
    presentCall: args => ({ card: 'diff', title: `Write ${args.path}`, diffs: [{ path: args.path, oldText: null, newText: 'the file' }] }),
  })
  const { pane } = await withCards(bash, write)
  pane.push(asked('bash', '{"command":"pnpm test"}'))
  assert.deepEqual(drawText(pane, 60), ['● pnpm test', '  running…'])
  pane.push(returned('ok'))
  assert.deepEqual(drawText(pane, 60), ['● pnpm test (2 s)', 'ok'])
  pane.push({ ...asked('write', '{"path":"foo.txt"}'), seq: 7, callId: 'c2' })
  assert.deepEqual(drawText(pane, 60).slice(2), ['● Write foo.txt', '  running…'])
})

test('disposing the plugin gives every call back to binnacle\'s card', async () => {
  const { fiber, pane } = await withCards(read)
  pane.push(asked('read', '{"path":"src/api.ts"}'))
  pane.push(returned('the file'))
  assert.deepEqual(drawText(pane, 60), ['● Read src/api.ts', 'the file'])
  await fiber.dispose()
  assert.deepEqual(drawText(pane, 60), ['● read {"path":"src/api.ts"}', 'the file'])
})
