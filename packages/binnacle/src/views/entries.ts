import type { Block, Fact } from '../facts/adapt.ts'
import type { Entry } from '../models/transcript.ts'
import { describe } from '../contract/index.ts'
import { parseNode } from '../ui/node.ts'
import { binnacleTheme } from '../ui/theme.ts'
import type { Theme } from '../ui/theme.ts'
import type { Node, Part, Span } from '../ui/node.ts'

/**
 * How a kind of entry is drawn: a built-in view, or one an author registered.
 *
 * A function of its entry alone. binnacle calls it once for each entry and
 * keeps what it returned, laying it out again at a new width or as a fold in
 * it opens, until the entry changes (a call's result arrives), a registration
 * comes or goes, or pi-tui invalidates the pane. Anything else it reads is
 * read once, until its author invalidates its key.
 * @param next - draws the entry as the view beneath this one does, for a view
 * to build on or to leave an entry it does not claim to; it never throws, as
 * what goes wrong beneath is drawn there.
 */
export type View = (entry: Entry, next: () => Node) => Node

/**
 * How a part of an entry is drawn wherever an entry holds it, whichever view
 * drew the entry: handed the part and what it draws from, and `next`, which
 * draws it as the view beneath does, binnacle's own at the bottom. It is kept
 * as an entry's view is, drawn again when the entry holding it is.
 */
export type PartView<K extends Part['kind'] = Part['kind']> = (part: Extract<Part, { readonly kind: K }>, next: () => Node) => Node

/** Authors' views, by entry kind, quiet kind's dsh type, or the name of an authored fact, each key's oldest first: the newest draws, on what the one before it draws. */
export type Views = ReadonlyMap<string, readonly View[]>

function textOf(blocks: readonly Block[]): string {
  return blocks.map((block) => (block.kind === 'unread' ? `[${block.type}]` : block.text)).join('\n')
}

function drawAnswer(fact: { readonly blocks: readonly Block[]; readonly interrupted?: boolean }): Node {
  let reasoning = 0
  const children = fact.blocks.flatMap((block): Node[] =>
    block.kind === 'unread' && block.type === 'tool-call'
      ? []
      : block.kind === 'reasoning'
        ? [
            {
              kind: 'part',
              part: { kind: 'thinking', text: block.text },
              child: {
                kind: 'fold',
                id: `reasoning-${reasoning++}`,
                title: [{ mark: 'thinking' } as const, ' thinking'],
                tone: 'muted',
                child: { kind: 'text', text: block.text, tone: 'thinkingText' },
              },
            },
          ]
        : block.kind === 'text'
          ? [{ kind: 'markdown', text: block.text }]
          : [{ kind: 'text', text: textOf([block]) }],
  )
  return {
    kind: 'stack',
    children: fact.interrupted === true ? [...children, { kind: 'text', text: '(interrupted)', tone: 'dim' }] : children,
  }
}

function drawWorkflow(entry: Extract<Entry, { readonly kind: 'workflow' }>): Node {
  const stands = entry.end !== undefined ? entry.end.stopped : (entry.left ?? 'running')
  const members: Node[] = entry.members.map(({ start, end }) => ({
    kind: 'text',
    text: `${start.label}${start.phase === undefined ? '' : ` (${start.phase})`} · ${end?.outcome ?? 'running'}`,
    tone: end === undefined ? 'muted' : end.outcome === 'completed' ? 'success' : end.outcome === 'failed' ? 'error' : 'muted',
  }))
  return {
    kind: 'fold',
    id: 'members',
    title: [{ mark: 'workflow' }, ` ${entry.run.name} · ${stands}`],
    child: { kind: 'stack', children: members },
  }
}

function drawRetry(
  retry: Extract<Fact, { readonly kind: 'retry' }>,
  started: Extract<Fact, { readonly kind: 'retried' }> | undefined,
  left: string | undefined,
): Node {
  const attempt = `attempt ${retry.attempt}${retry.of === undefined ? '' : ` of ${retry.of}`}`
  const title: readonly Span[] =
    started !== undefined
      ? [{ mark: 'retry' }, ` retried · ${attempt}`]
      : left !== undefined
        ? [{ mark: 'retry' }, ` retry ${retry.attempt} not started: ${left}`]
        : [{ mark: 'retry' }, ` retrying · ${attempt} · in `, { until: retry.at }]
  return { kind: 'fold', id: 'failure', title, tone: 'muted', child: { kind: 'text', text: retry.failure } }
}

function drawApproval(
  asked: Extract<Fact, { readonly kind: 'asked' }>,
  decided: Extract<Fact, { readonly kind: 'decided' }> | undefined,
): Node {
  const head: Node = {
    kind: 'text',
    text: [{ mark: 'approval' } as const, ` ${asked.toolName} asks${asked.reason === undefined ? '' : `: ${asked.reason}`}`],
  }
  if (decided === undefined) return { kind: 'stack', children: [head, { kind: 'text', text: '  waiting…', tone: 'muted' }] }
  const tone = decided.outcome === 'allowed-once' ? 'success' : decided.outcome === 'rejected' ? 'error' : 'muted'
  const outcome = decided.outcome === 'allowed-once' ? 'allowed once' : decided.outcome
  return { kind: 'stack', children: [head, { kind: 'text', text: `  ${outcome}`, tone }] }
}

function drawCommand(run: Extract<Fact, { readonly kind: 'run' }>, done: Extract<Fact, { readonly kind: 'done' }> | undefined): Node {
  const head: Node = { kind: 'text', text: `/${run.name}${run.args ?? ''}`, tone: 'muted' }
  if (done === undefined) return { kind: 'stack', children: [head, { kind: 'text', text: '  running…', tone: 'muted' }] }
  if (done.outcome === 'error') return { kind: 'stack', children: [head, { kind: 'text', text: `  ${done.text}`, tone: 'error' }] }
  return done.text === undefined ? head : { kind: 'stack', children: [head, { kind: 'text', text: `  ${done.text}` }] }
}

function compact(value: number): string {
  if (value < 1_000) return `${value}`
  if (value < 1_000_000) return `${scaled(value / 1_000)}k`
  return `${scaled(value / 1_000_000)}m`
}

function scaled(over: number): string {
  return over >= 100 ? `${Math.round(over)}` : `${Math.round(over * 10) / 10}`
}

function drawCompaction(
  summary: Extract<Fact, { readonly kind: 'summary' }> | undefined,
  end: Extract<Fact, { readonly kind: 'end' }> | undefined,
): Node {
  if (end === undefined) return { kind: 'text', text: [{ mark: 'compaction' } as const, ' compacting context…'], tone: 'muted' }
  if (end.error !== undefined) {
    return {
      kind: 'stack',
      children: [
        { kind: 'text', text: [{ mark: 'compaction' } as const, ' compaction failed'], tone: 'muted' },
        { kind: 'text', text: `  ${end.error}`, tone: 'error' },
      ],
    }
  }
  if (summary === undefined) return { kind: 'text', text: [{ mark: 'compaction' } as const, ' context compacted'], tone: 'muted' }
  return folded(
    'summary',
    [{ mark: 'compaction' } as const, ` context compacted · ${summary.items} items (~${compact(summary.tokens)} tokens)`],
    { kind: 'markdown', text: textOf(summary.blocks) },
  )
}

/** Each call a `run_code` program made, a line marked as a call is, indented beneath the sub-call that made it. */
function drawnSubCalls(subCalls: Extract<Entry, { readonly kind: 'tool' }>['subCalls']): Node[] {
  const held = subCalls ?? []
  const depth = (parent: string, seen: number): number => {
    const made = held.find((sub) => sub.call.subCallId === parent)
    return made === undefined || seen > held.length ? 0 : 1 + depth(made.call.parentCallId, seen + 1)
  }
  return held.map(({ call, result }) => ({
    kind: 'text',
    text: [
      '  '.repeat(depth(call.parentCallId, 0)),
      result === undefined ? { mark: 'running' } : result.failed ? { mark: 'failed' } : { mark: 'done' },
      ` ${call.name} ${call.arguments}`,
    ],
  }))
}

function drawTool(
  call: Extract<Fact, { readonly kind: 'call' }>,
  result: Extract<Fact, { readonly kind: 'result' }> | undefined,
  left: string | undefined,
  subCalls?: Extract<Entry, { readonly kind: 'tool' }>['subCalls'],
): Node {
  const mark: Span = result === undefined ? { mark: 'running' } : result.failed === true ? { mark: 'failed' } : { mark: 'done' }
  const title: readonly Span[] = [mark, { text: ` ${call.name} ${call.arguments}`, tone: 'toolTitle' }]
  const made = drawnSubCalls(subCalls)
  if (result === undefined) {
    const waiting: Node =
      left === undefined
        ? { kind: 'text', text: ['running ', { since: call.time }], tone: 'muted' }
        : { kind: 'text', text: `the turn ended without it: ${left}`, tone: 'muted' }
    return { kind: 'show', title, child: made.length === 0 ? waiting : { kind: 'stack', children: [...made, waiting] } }
  }
  const reason: Node[] = result.failure?.reason === undefined ? [] : [{ kind: 'text', text: result.failure.reason, tone: 'error' }]
  const text = textOf(result.blocks)
  const output: Node = {
    kind: 'part',
    part: { kind: 'output', tool: call.name, text },
    child: { kind: 'fold', id: 'output', child: { kind: 'text', text, tone: 'toolOutput' } },
  }
  return { kind: 'show', title, opens: 'output', child: { kind: 'stack', children: [...made, ...reason, output] } }
}

const drawnHere: Readonly<Record<Entry['kind'], true>> = {
  prompt: true,
  context: true,
  answer: true,
  tool: true,
  approval: true,
  decided: true,
  command: true,
  done: true,
  result: true,
  compaction: true,
  summary: true,
  end: true,
  authored: true,
  unknown: true,
  quiet: true,
  streaming: true,
  retry: true,
  retried: true,
  presented: true,
  workflow: true,
  member: true,
  'member-end': true,
  'workflow-end': true,
  'sub-call': true,
  'sub-result': true,
}

/**
 * Draw one entry.
 * @returns what it draws, or what the view beneath draws with an error message if the view fails or returns an invalid node.
 */
export function drawEntry(entry: Entry, views: Views = new Map(), theme: Theme = binnacleTheme): Node {
  if (
    entry.kind === 'authored' &&
    (Object.hasOwn(drawnHere, entry.fact.name) || (partKinds as readonly string[]).includes(entry.fact.name))
  ) {
    return builtIn(entry, `${entry.fact.name} is a kind binnacle draws; the adapter must give its fact another name`)
  }
  const key = keyOf(entry)
  const stack = views.get(key) ?? []
  return withParts(
    drawnBy(entry, key, stack, stack.length, theme, (problem) => builtIn(entry, problem)),
    views,
    theme,
  )
}

/** The part keys: a view registered under one draws that part wherever an entry holds it. */
export const partKinds: readonly Part['kind'][] = ['thinking', 'output']

// Parts are drawn one level deep: a part a part's view returns is drawn as binnacle draws it.
function withParts(node: Node, views: Views, theme: Theme): Node {
  switch (node.kind) {
    case 'blank':
    case 'text':
    case 'markdown':
      return node
    case 'stack':
      return { ...node, children: node.children.map((child) => withParts(child, views, theme)) }
    case 'offer':
    case 'ask':
    case 'show':
    case 'band':
    case 'fold':
      return { ...node, child: withParts(node.child, views, theme) }
    case 'part': {
      const stack = views.get(node.part.kind) ?? []
      return drawnBy(node.part, node.part.kind, stack, stack.length, theme, (problem) => noted(node.child, problem))
    }
  }
}

export function keyOf(entry: Entry): string {
  if (entry.kind === 'authored') return entry.fact.name
  return entry.kind === 'quiet' ? entry.fact.type : entry.kind
}

function drawnBy(
  drawn: Entry | Part,
  key: string,
  stack: readonly View[],
  height: number,
  theme: Theme,
  bottom: (problem?: string) => Node,
): Node {
  const view = stack[height - 1]
  if (view === undefined) return bottom()
  const next = (): Node => drawnBy(drawn, key, stack, height - 1, theme, bottom)
  const beneath = (problem: string): Node => (height === 1 ? bottom(problem) : noted(next(), problem))
  let returned: unknown
  try {
    returned = (view as (drawn: Entry | Part, next: () => Node) => unknown)(drawn, next)
  } catch (error) {
    return beneath(`binnacle.view(${key}) threw: ${describe(error)}`)
  }
  try {
    return parseNode(returned, theme)
  } catch (error) {
    return beneath(`binnacle.view(${key}) returned no drawable node: ${describe(error)}`)
  }
}

function builtIn(entry: Entry, problem?: string): Node {
  switch (entry.kind) {
    case 'prompt':
      return noted(
        {
          kind: 'band',
          background: 'userMessageBg',
          child: {
            kind: 'text',
            text: [
              { mark: entry.steer === true ? 'steer' : 'prompt' } as const,
              { text: ` ${textOf(entry.fact.blocks)}`, tone: 'userMessageText' } as const,
            ],
          },
        },
        problem,
      )
    case 'context':
      return noted(
        folded('context', [{ mark: 'context' } as const, ` added by ${entry.fact.source}`], {
          kind: 'text',
          text: textOf(entry.fact.blocks),
        }),
        problem,
      )
    case 'answer':
      return noted(drawAnswer(entry.fact), problem)
    case 'streaming':
      return noted(drawAnswer(entry.answer), problem)
    case 'tool':
      return noted(drawTool(entry.call, entry.result, entry.left, entry.subCalls), problem)
    case 'approval':
      return noted(drawApproval(entry.asked, entry.decided), problem)
    case 'command':
      return noted(drawCommand(entry.run, entry.done), problem)
    case 'compaction':
      return noted(drawCompaction(entry.summary, entry.end), problem)
    case 'summary': {
      const title: Node = {
        kind: 'text',
        text: [{ mark: 'compaction', tone: 'muted' } as const, ` summary of compaction ${entry.fact.compactionId}`],
        tone: 'muted',
      }
      const fold: Node = { kind: 'fold', id: 'summary', child: { kind: 'markdown', text: textOf(entry.fact.blocks) } }
      return problem === undefined
        ? { kind: 'stack', children: [title, fold] }
        : { kind: 'stack', children: [title, problemLine(problem), fold] }
    }
    case 'end': {
      const title: Node = {
        kind: 'text',
        text: [{ mark: 'compaction', tone: 'muted' } as const, ` end of compaction ${entry.fact.compactionId}`],
        tone: 'muted',
      }
      const why = entry.fact.error === undefined ? undefined : { kind: 'text' as const, text: `  ${entry.fact.error}`, tone: 'error' }
      return problem === undefined
        ? why === undefined
          ? title
          : { kind: 'stack', children: [title, why] }
        : { kind: 'stack', children: [title, problemLine(problem), ...(why === undefined ? [] : [why])] }
    }
    case 'done': {
      const title: Node = { kind: 'text', text: `done of command ${entry.fact.commandId}: ${entry.fact.outcome}`, tone: 'muted' }
      return problem === undefined ? title : { kind: 'stack', children: [title, problemLine(problem)] }
    }
    case 'workflow':
      return noted(drawWorkflow(entry), problem)
    case 'sub-call':
    case 'sub-result': {
      const title: Node = {
        kind: 'text',
        text: [
          { mark: 'unknown' } as const,
          ` ${entry.fact.kind === 'sub-call' ? `call ${entry.fact.name}` : 'settling'} made by ${entry.fact.rootCallId}, whose call is not in its turn`,
        ],
        tone: 'muted',
      }
      return problem === undefined ? title : { kind: 'stack', children: [title, problemLine(problem)] }
    }
    case 'member':
    case 'member-end':
    case 'workflow-end': {
      const title: Node = {
        kind: 'text',
        text: [
          { mark: 'workflow' } as const,
          ` ${entry.fact.kind === 'workflow-end' ? `run ${entry.fact.runId} stopped: ${entry.fact.stopped}` : `member ${entry.fact.member} of run ${entry.fact.runId}`}`,
        ],
        tone: 'muted',
      }
      return problem === undefined ? title : { kind: 'stack', children: [title, problemLine(problem)] }
    }
    case 'presented': {
      const files = entry.fact.files
      const lines: Node[] = files.map((file) => ({
        kind: 'text',
        text: file.description === undefined ? file.path : [file.path, { text: `  ${file.description}`, tone: 'muted' } as const],
      }))
      return noted(
        {
          kind: 'show',
          title: [{ mark: 'presented' }, ` presented ${files.length} ${files.length === 1 ? 'file' : 'files'}`],
          child: { kind: 'stack', children: lines },
        },
        problem,
      )
    }
    case 'retry':
      return noted(drawRetry(entry.retry, entry.started, entry.left), problem)
    case 'retried': {
      const title: Node = {
        kind: 'text',
        text: [{ mark: 'retry' } as const, ` retry ${entry.fact.attempt} of chain ${entry.fact.retryId} started`],
        tone: 'muted',
      }
      return problem === undefined ? title : { kind: 'stack', children: [title, problemLine(problem)] }
    }
    case 'decided': {
      const title: Node = {
        kind: 'text',
        text: [{ mark: 'approval', tone: 'muted' } as const, ` decision of approval ${entry.fact.id}: ${entry.fact.outcome}`],
        tone: 'muted',
      }
      return problem === undefined ? title : { kind: 'stack', children: [title, problemLine(problem)] }
    }
    case 'result': {
      const title: Node = {
        kind: 'text',
        text: [{ mark: 'done', tone: 'muted' } as const, ` result of call ${entry.fact.callId}`],
        tone: 'muted',
      }
      const fold: Node = { kind: 'fold', id: 'output', child: { kind: 'text', text: textOf(entry.fact.blocks) } }
      return problem === undefined
        ? { kind: 'stack', children: [title, fold] }
        : { kind: 'stack', children: [title, problemLine(problem), fold] }
    }
    case 'authored':
      return noted(
        folded('data', [{ mark: 'unknown' } as const, ` ${entry.fact.name}`], { kind: 'text', text: shown(entry.fact.data) }),
        problem,
      )
    case 'unknown':
      return noted(
        folded('record', [{ mark: 'unknown' } as const, ` ${entry.fact.type}`], { kind: 'text', text: shown(entry.fact.record) }),
        problem ?? entry.fact.problem,
      )
    case 'quiet':
      return problem === undefined ? { kind: 'stack', children: [] } : problemLine(problem)
  }
}

function folded(id: string, title: readonly Span[], child: Node): Extract<Node, { readonly kind: 'fold' }> {
  return { kind: 'fold', id, title, tone: 'muted', child }
}

function noted(body: Node, problem: string | undefined): Node {
  return problem === undefined ? body : { kind: 'stack', children: [body, problemLine(problem)] }
}

function problemLine(what: string): Node {
  return { kind: 'text', text: [{ mark: 'problem' } as const, ` ${what}`], tone: 'error' }
}

function shown(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? describe(value)
  } catch {
    return describe(value)
  }
}
