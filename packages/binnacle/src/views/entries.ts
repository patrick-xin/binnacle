import type { Block, Fact } from '../facts/adapt.ts'
import type { Entry } from '../models/transcript.ts'
import { describe } from '../contract/index.ts'
import { parseNode } from '../ui/node.ts'
import { binnacleTheme } from '../ui/theme.ts'
import type { Theme } from '../ui/theme.ts'
import type { Node, Span } from '../ui/node.ts'

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

/** Authors' views, by entry kind, quiet kind's dsh type, or the name of an authored fact, each key's oldest first: the newest draws, on what the one before it draws. */
export type Views = ReadonlyMap<string, readonly View[]>

// A block binnacle cannot read is its type in brackets.
function textOf(blocks: readonly Block[]): string {
  return blocks.map(block => block.kind === 'unread' ? `[${block.type}]` : block.text).join('\n')
}

/**
 * A call an answer made is its tool entry's to draw — dsh logs every kept call, and one kept by a stream cut short there
 * is none (`BlockAssembler.interruptedBlocks`, at dsh-v0.1.7-rc.2) — so its block draws no line here.
 * Each reasoning fold is named by which reasoning it is, so a person's opening one holds that one alone.
 */
function drawAnswer(fact: Extract<Fact, { readonly kind: 'answer' }>): Node {
  let reasoning = 0
  const children = fact.blocks.flatMap((block): Node[] => block.kind === 'unread' && block.type === 'tool-call'
    ? []
    : block.kind === 'reasoning'
      ? [{
        kind: 'fold',
        id: `reasoning-${reasoning++}`,
        title: [{ mark: 'thinking' } as const, ' thinking'],
        tone: 'muted',
        child: { kind: 'text', text: block.text, tone: 'dim' },
      }]
      : block.kind === 'text'
        ? [{ kind: 'markdown', text: block.text }]
        : [{ kind: 'text', text: textOf([block]) }])
  return { kind: 'stack', children: fact.interrupted ? [...children, { kind: 'text', text: '(interrupted)', tone: 'dim' }] : children }
}

function drawApproval(asked: Extract<Fact, { readonly kind: 'asked' }>, decided: Extract<Fact, { readonly kind: 'decided' }> | undefined): Node {
  const head: Node = { kind: 'text', text: [{ mark: 'approval' } as const, ` ${asked.toolName} asks${asked.reason === undefined ? '' : `: ${asked.reason}`}`] }
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

/**
 * A count of tokens as a person reads it: `517`, `12.4k`, `517k`, `1.2m` — dsh web's compact count
 * (`dsh:packages/client/ui-chat/src/client/chat/token-format.ts#formatTokens`), restated lowercase and without its
 * locale seat, as the status line restates it and #44's marker writes it.
 */
function compact(value: number): string {
  if (value < 1_000) return `${value}`
  if (value < 1_000_000) return `${scaled(value / 1_000)}k`
  return `${scaled(value / 1_000_000)}m`
}

/**
 * A count scaled down from a unit, as a person reads it: rounded to a whole once a hundred, one decimal beneath
 * that — dsh web's compact count's own rule (`dsh:packages/client/ui-chat/src/client/chat/token-format.ts#formatTokens`).
 */
function scaled(over: number): string {
  return over >= 100 ? `${Math.round(over)}` : `${Math.round(over * 10) / 10}`
}

function drawCompaction(summary: Extract<Fact, { readonly kind: 'summary' }> | undefined, end: Extract<Fact, { readonly kind: 'end' }> | undefined): Node {
  if (end === undefined) return { kind: 'text', text: [{ mark: 'compaction' } as const, ' compacting context…'], tone: 'muted' }
  if (end.error !== undefined) {
    return { kind: 'stack', children: [
      { kind: 'text', text: [{ mark: 'compaction' } as const, ' compaction failed'], tone: 'muted' },
      { kind: 'text', text: `  ${end.error}`, tone: 'error' },
    ] }
  }
  if (summary === undefined) return { kind: 'text', text: [{ mark: 'compaction' } as const, ' context compacted'], tone: 'muted' }
  return folded('summary', [{ mark: 'compaction' } as const, ` context compacted · ${summary.items} items (~${compact(summary.tokens)} tokens)`], { kind: 'markdown', text: textOf(summary.blocks) })
}

function drawTool(call: Extract<Fact, { readonly kind: 'call' }>, result: Extract<Fact, { readonly kind: 'result' }> | undefined, left: string | undefined): Node {
  const mark: Span = result === undefined
    ? { mark: 'running' }
    : result.failed === true ? { mark: 'failed' } : { mark: 'done' }
  const title: readonly Span[] = [mark, ` ${call.name} ${call.arguments}`]
  if (result === undefined) {
    const waiting: Node = left === undefined
      ? { kind: 'text', text: ['running ', { since: call.time }], tone: 'muted' }
      : { kind: 'text', text: `the turn ended without it: ${left}`, tone: 'muted' }
    return { kind: 'show', title, child: waiting }
  }
  const reason: Node[] = result.failure?.reason === undefined ? [] : [{ kind: 'text', text: result.failure.reason, tone: 'error' }]
  const output: Node = { kind: 'fold', id: 'output', child: { kind: 'text', text: textOf(result.blocks) } }
  return { kind: 'show', title, child: { kind: 'stack', children: [...reason, output] } }
}

const drawnHere: Readonly<Record<Entry['kind'], true>> = { prompt: true, context: true, answer: true, tool: true, approval: true, decided: true, command: true, done: true, result: true, compaction: true, summary: true, end: true, authored: true, unknown: true, quiet: true }

/**
 * Draw one entry.
 * @param views - authors' views; the newest for the entry's key draws it, and one for a built-in kind builds on or replaces binnacle's.
 * @param theme - whose tones, marks and backgrounds are the names a view may use.
 * @returns what it draws, which for a quiet entry no view claims is no lines at all. When an author's view throws or returns no node binnacle can lay out, what the view beneath it draws, saying what went wrong; when an authored fact is named as a built-in kind, the built-in drawing, saying so.
 */
export function drawEntry(entry: Entry, views: Views = new Map(), theme: Theme = binnacleTheme): Node {
  if (entry.kind === 'authored' && Object.hasOwn(drawnHere, entry.fact.name)) {
    return builtIn(entry, `${entry.fact.name} is a kind binnacle draws; the adapter must give its fact another name`)
  }
  const key = keyOf(entry)
  const stack = views.get(key) ?? []
  return drawnBy(entry, key, stack, stack.length, theme)
}

/** The key an entry's views are registered under: its kind, a quiet kind's dsh type, or an authored fact's name. */
export function keyOf(entry: Entry): string {
  if (entry.kind === 'authored') return entry.fact.name
  return entry.kind === 'quiet' ? entry.fact.type : entry.kind
}

/**
 * Draw one entry with the views of its key up to a height, the topmost drawing.
 * @param stack - the key's views, oldest first.
 * @param height - how many of them draw; none is binnacle's own drawing.
 * @returns what the topmost draws, or what the one beneath it draws, saying why, when it fails.
 */
function drawnBy(entry: Entry, key: string, stack: readonly View[], height: number, theme: Theme): Node {
  const view = stack[height - 1]
  if (view === undefined) return builtIn(entry)
  const beneath = (problem: string): Node => height === 1 ? builtIn(entry, problem) : noted(drawnBy(entry, key, stack, height - 1, theme), problem)
  let returned: unknown
  try {
    returned = view(entry, () => drawnBy(entry, key, stack, height - 1, theme))
  } catch (error) {
    return beneath(`binnacle.view(${key}) threw: ${describe(error)}`)
  }
  try {
    return parseNode(returned, theme)
  } catch (error) {
    return beneath(`binnacle.view(${key}) returned no drawable node: ${describe(error)}`)
  }
}

/**
 * @param problem - what went wrong drawing it otherwise, said under its title, or after it when it has none.
 */
function builtIn(entry: Entry, problem?: string): Node {
  switch (entry.kind) {
    case 'prompt':
      return noted({ kind: 'band', background: 'prompt', child: { kind: 'text', text: [{ mark: entry.steer === true ? 'steer' : 'prompt' } as const, ` ${textOf(entry.fact.blocks)}`] } }, problem)
    case 'context':
      return noted(folded('context', [{ mark: 'context' } as const, ` added by ${entry.fact.source}`], { kind: 'text', text: textOf(entry.fact.blocks) }), problem)
    case 'answer':
      return noted(drawAnswer(entry.fact), problem)
    case 'tool':
      return noted(drawTool(entry.call, entry.result, entry.left), problem)
    case 'approval':
      return noted(drawApproval(entry.asked, entry.decided), problem)
    case 'command':
      return noted(drawCommand(entry.run, entry.done), problem)
    case 'compaction':
      return noted(drawCompaction(entry.summary, entry.end), problem)
    case 'summary': {
      // Reached only from a log torn between a compaction's start and its summary.
      const title: Node = { kind: 'text', text: [{ mark: 'compaction', tone: 'muted' } as const, ` summary of compaction ${entry.fact.compactionId}`], tone: 'muted' }
      const fold: Node = { kind: 'fold', id: 'summary', child: { kind: 'markdown', text: textOf(entry.fact.blocks) } }
      return problem === undefined ? { kind: 'stack', children: [title, fold] } : { kind: 'stack', children: [title, problemLine(problem), fold] }
    }
    case 'end': {
      // Reached only from a log torn between a compaction's start and its end.
      const title: Node = { kind: 'text', text: [{ mark: 'compaction', tone: 'muted' } as const, ` end of compaction ${entry.fact.compactionId}`], tone: 'muted' }
      const why = entry.fact.error === undefined ? undefined : { kind: 'text' as const, text: `  ${entry.fact.error}`, tone: 'error' }
      return problem === undefined
        ? why === undefined ? title : { kind: 'stack', children: [title, why] }
        : { kind: 'stack', children: [title, problemLine(problem), ...why === undefined ? [] : [why]] }
    }
    case 'done': {
      // Reached only from a log torn between a command's run and its done.
      const title: Node = { kind: 'text', text: `done of command ${entry.fact.commandId}: ${entry.fact.outcome}`, tone: 'muted' }
      return problem === undefined ? title : { kind: 'stack', children: [title, problemLine(problem)] }
    }
    case 'decided': {
      // Reached only from a log torn between an approval's ask and its decision.
      const title: Node = { kind: 'text', text: [{ mark: 'approval', tone: 'muted' } as const, ` decision of approval ${entry.fact.id}: ${entry.fact.outcome}`], tone: 'muted' }
      return problem === undefined ? title : { kind: 'stack', children: [title, problemLine(problem)] }
    }
    case 'result': {
      // A titled fold that shows rows is left to #23, so the title stays a line of its own above the fold.
      const title: Node = { kind: 'text', text: [{ mark: 'done', tone: 'muted' } as const, ` result of call ${entry.fact.callId}`], tone: 'muted' }
      const fold: Node = { kind: 'fold', id: 'output', child: { kind: 'text', text: textOf(entry.fact.blocks) } }
      return problem === undefined ? { kind: 'stack', children: [title, fold] } : { kind: 'stack', children: [title, problemLine(problem), fold] }
    }
    case 'authored':
      return noted(folded('data', [{ mark: 'unknown' } as const, ` ${entry.fact.name}`], { kind: 'text', text: shown(entry.fact.data) }), problem)
    case 'unknown':
      return noted(folded('record', [{ mark: 'unknown' } as const, ` ${entry.fact.type}`], { kind: 'text', text: shown(entry.fact.record) }), problem ?? entry.fact.problem)
    case 'quiet':
      return problem === undefined ? { kind: 'stack', children: [] } : problemLine(problem)
  }
}

/** A fold under a muted title line, folded as the theme gives its kind's folds to start: showing no rows, its marker rides the title and the fold costs that one line. */
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
    // A cycle, a bigint or a getter that throws has no JSON: say what it is instead.
    return describe(value)
  }
}
