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
import type { ToolCallView, ToolDefinition, ToolResultView } from '@deepseek-ai/dsh-tools'
import { stripTerminalSequences } from '@earendil-works/pi-tui'
import type { Fact } from '../../../src/facts/adapt.ts'
import { RegistrationService } from '../../../src/host/registrations.ts'
import { TranscriptPane } from '../../../src/panes/transcript.ts'
import { drawText } from '../../../src/ui/draw.ts'
import { layout } from '../../../src/ui/layout.ts'
import type { Node } from '../../../src/api.ts'
import type { CardParts, CardRow } from '../../../src/plugins/tool-cards/cards.ts'
import { rowFor } from '../../../src/plugins/tool-cards/cards.ts'
import { toolCards } from '../../../src/plugins/tool-cards/index.ts'
import { call as callFact, returned as returnedFact } from '../../support/facts.ts'

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
const asked = (name: string, args: string): Extract<Fact, { readonly kind: 'call' }> => callFact(2, 2, 'c1', name, args)

/** What a call returned, as it lands in the log. */
const returned = (text: string): Extract<Fact, { readonly kind: 'result' }> => returnedFact(3, 3, 'c1', text)

/**
 * What a node draws at width 40, as a person reads it.
 * @param node - what a row drew.
 * @returns its lines.
 */
const lines = (node: Node): string[] =>
  layout(node, 40, { expanded: new Set() }).lines.map(line => stripTerminalSequences(line).trimEnd())

/** What a call returned, having failed, as it lands in the log. */
const failed = (callId: string): Extract<Fact, { readonly kind: 'result' }> => ({
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
  const unstable = defineTool({
    name: 'unstable',
    description: 'Presents its result by throwing.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: async () => 'unstable',
    presentCall: () => ({ card: 'generic', title: 'Boom' }),
    presentResult: () => { throw new Error('the presenter fell over') },
  })
  const { pane } = await withCards(flaky, unstable)
  pane.push(asked('flaky', '{}'))
  assert.deepEqual(drawText(pane, 60), ['● flaky {}', '  running…', '✗ flaky.presentCall threw: the presenter fell over'])
  pane.push(failed('c1'))
  assert.deepEqual(drawText(pane, 60), ['✗ flaky {}', '  the command exited 2', 'the model was told', '✗ flaky.presentCall threw: the presenter fell over'])
  pane.push({ ...asked('unstable', '{}'), seq: 5, callId: 'c2' })
  assert.deepEqual(drawText(pane, 60).slice(4), ['● Boom', '  running…'])
  pane.push({ ...returned('ok'), callId: 'c2' })
  assert.deepEqual(drawText(pane, 60).slice(4), ['● unstable {}', 'ok', '✗ unstable.presentResult threw: the presenter fell over'])
})

test('presentCall returning undefined, and a call whose arguments are not JSON, read as they do today', async () => {
  const voided = defineTool({
    name: 'voided',
    description: 'Presents nothing for these arguments.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: async () => 'void',
    presentCall: () => undefined,
  })
  const { pane } = await withCards(voided)
  pane.push(asked('voided', '{}'))
  pane.push({ ...asked('read', '{oops'), seq: 6, callId: 'c3' })
  assert.deepEqual(drawText(pane, 60), [
    '● voided {}',
    '  running…',
    '● read {oops',
    '  running…',
  ])
})

test('presentResult returning undefined keeps the presented title and folds the result\'s own text', async () => {
  const mute = defineTool({
    name: 'mute',
    description: 'Presents its calls only.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: async () => 'the raw text',
    presentCall: () => ({ card: 'generic', title: 'Mute' }),
    presentResult: () => undefined,
  })
  const { pane } = await withCards(mute)
  pane.push(asked('mute', '{}'))
  pane.push(returned('the raw text'))
  assert.deepEqual(drawText(pane, 60), ['● Mute', 'the raw text'])
})

test('a presenter that returns something the cards cannot draw says so under the card beneath', async () => {
  const hologram = defineTool({
    name: 'hologram',
    description: 'Presents a kind binnacle does not draw.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: async () => 'hologrammed',
    presentCall: () => ({ card: 'hologram', title: 'A hologram' }) as never,
  })
  const lying = defineTool({
    name: 'lying',
    description: 'Presents a bare string.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: async () => 'lied',
    presentCall: () => 'nonsense' as never,
  })
  const crooked = defineTool({
    name: 'crooked',
    description: 'Presents a result with no title of text.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: async () => 'crooked',
    presentCall: () => ({ card: 'generic', title: 'Crooked' }),
    presentResult: () => ({ card: 'generic', title: 7 }) as never,
  })
  const { pane } = await withCards(hologram, lying, crooked)
  pane.push(asked('hologram', '{}'))
  assert.deepEqual(drawText(pane, 100).slice(0, 3), [
    '● hologram {}',
    '  running…',
    '✗ hologram.presentCall returned no drawable view: hologram is no card the tool cards draw',
  ])
  pane.push({ ...asked('lying', '{}'), seq: 5, callId: 'c2' })
  assert.deepEqual(drawText(pane, 100).slice(3, 6), [
    '● lying {}',
    '  running…',
    '✗ lying.presentCall returned no drawable view: it is string',
  ])
  pane.push({ ...asked('crooked', '{}'), seq: 6, callId: 'c3' })
  pane.push({ ...returned('crooked'), callId: 'c3' })
  assert.deepEqual(drawText(pane, 100).slice(6), [
    '● crooked {}',
    'crooked',
    '✗ crooked.presentResult returned no drawable view: a result view\'s title is not text',
  ])
})

test('a presented title of more than one line indents its later lines under the head', async () => {
  const heredoc = defineTool({
    name: 'bash',
    description: 'Run a heredoc.',
    parameters: { command: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: async () => 'wrote',
    presentCall: () => ({ card: 'terminal', title: 'cat > greet.txt <<EOF\nhello\nEOF' }),
  })
  const { pane } = await withCards(heredoc)
  pane.push(asked('bash', '{"command":"cat > greet.txt <<EOF"}'))
  assert.deepEqual(drawText(pane, 60), ['● cat > greet.txt <<EOF', '  hello', '  EOF', '  running…'])
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

test('a kind with no row of its own draws through generic\'s', () => {
  assert.equal(rowFor('terminal'), rowFor('generic'))
  assert.equal(rowFor('web'), rowFor('generic'))
})

test('a row can draw a head of its own and a line under a completed head', () => {
  const shell: CardRow = {
    draw: parts => {
      const head: Node = { kind: 'text', text: [{ text: '$', tone: 'accent' }, ` ${parts.call.title}`] }
      if (parts.waiting !== undefined) return { kind: 'stack', children: [head, parts.waiting] }
      const status: Node = { kind: 'text', text: '  exited badly', tone: 'warning' }
      return { kind: 'stack', children: [head, status, parts.fold({ kind: 'text', text: parts.resultText }, 1)] }
    },
  }
  const drawn = (parts: CardParts): string[] => lines(shell.draw(parts) as Node)
  const running: CardParts = {
    call: { card: 'generic', title: 'pnpm test', returned: {} },
    result: undefined,
    mark: { mark: 'running' },
    waiting: { kind: 'text', text: '  running…', tone: 'muted' },
    reason: undefined,
    resultText: '',
    fold: (child: Node, rows = 3) => ({ kind: 'fold', id: 'tool:c1', rows, child }),
  }
  assert.deepEqual(drawn(running), ['$ pnpm test', '  running…'])
  const done: CardParts = {
    ...running,
    mark: { mark: 'failed' },
    waiting: undefined,
    reason: 'the command exited 2',
    resultText: 'a\nb\nc',
  }
  assert.deepEqual(drawn(done), ['$ pnpm test', '  exited badly', 'a', '… 2 more lines'])
})

test("a row reads its kind's own fields, and one that cannot read them declines", () => {
  const parts: CardParts = {
    call: { card: 'terminal', title: 'pnpm test', returned: { card: 'terminal', title: 'pnpm test', exitCode: 2 } },
    result: { card: 'terminal', returned: { card: 'terminal', exitCode: 2, output: 'tsc: 1 error' } },
    mark: { mark: 'failed' },
    waiting: undefined,
    reason: undefined,
    resultText: 'tsc: 1 error',
    fold: (child: Node, rows = 3) => ({ kind: 'fold', id: 'tool:c1', rows, child }),
  }
  const exit: CardRow = {
    draw: current => {
      const head: Node = { kind: 'text', text: [current.mark, ` ${current.call.title}`] }
      if (current.waiting !== undefined) return { kind: 'stack', children: [head, current.waiting] }
      const code: unknown = current.result?.returned.exitCode
      if (typeof code !== 'number') return { declined: `exitCode is ${code === undefined ? 'absent' : `a ${typeof code}`}` }
      return {
        kind: 'stack',
        children: [head, { kind: 'text', text: `  exited ${code}`, tone: code === 0 ? 'success' : 'error' }, current.fold({ kind: 'text', text: current.resultText })],
      }
    },
  }
  assert.deepEqual(lines(exit.draw(parts) as Node), ['✗ pnpm test', '  exited 2', 'tsc: 1 error'])
  assert.deepEqual(exit.draw({ ...parts, result: { card: 'terminal', returned: { card: 'terminal' } } }), { declined: 'exitCode is absent' })
  assert.deepEqual(exit.draw({ ...parts, result: { card: 'terminal', returned: { card: 'terminal', exitCode: 'two' } } }), { declined: 'exitCode is a string' })
})

test('the object a presenter returned is not frozen after drawing', async () => {
  const call: ToolCallView = { card: 'terminal', title: 'pnpm test', cwd: '.' }
  const result: ToolResultView = { card: 'terminal', exitCode: 2, output: 'tsc: 1 error' }
  const cached = defineTool({
    name: 'cached',
    description: 'Presents objects it keeps.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: async () => 'cached',
    presentCall: () => call,
    presentResult: () => result,
  })
  const { pane } = await withCards(cached)
  pane.push(asked('cached', '{}'))
  pane.push(returned('tsc: 1 error'))
  assert.deepEqual(drawText(pane, 60), ['● pnpm test', 'tsc: 1 error'])
  assert.equal(Object.isFrozen(call), false)
  assert.equal(Object.isFrozen(result), false)
})

test('disposing the plugin gives every call back to binnacle\'s card', async () => {
  const { fiber, pane } = await withCards(read)
  pane.push(asked('read', '{"path":"src/api.ts"}'))
  pane.push(returned('the file'))
  assert.deepEqual(drawText(pane, 60), ['● Read src/api.ts', 'the file'])
  await fiber.dispose()
  assert.deepEqual(drawText(pane, 60), ['● read {"path":"src/api.ts"}', 'the file'])
})

test('a call its turn left without a result says so under its presented title', async () => {
  const { pane } = await withCards(read)
  pane.push({ kind: 'turn', seq: 1, time: 1, turn: 1, phase: 'start' })
  pane.push(asked('read', '{"path":"src/api.ts"}'))
  pane.push({ kind: 'turn', seq: 3, time: 3, turn: 1, phase: 'end', ending: 'aborted' })
  assert.deepEqual(drawText(pane, 60), ['● Read src/api.ts', '  the turn ended without it: aborted'])
})
