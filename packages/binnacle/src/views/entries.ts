/**
 * The built-in views: how each kind of transcript entry is drawn.
 *
 * Each returns nodes and declares what its content offers; none reads input
 * or holds a pi-tui component. A quiet entry's built-in drawing is no lines
 * at all — the session's machinery, which an author's view for its kind
 * draws again — though what a view over it did wrong is still said.
 */

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

/**
 * The text of some blocks, one paragraph each; a block binnacle cannot read is its type in brackets.
 */
function textOf(blocks: readonly Block[]): string {
  return blocks.map(block => block.kind === 'unread' ? `[${block.type}]` : block.text).join('\n')
}

/**
 * Draw an answer: reasoning drawn dim, folded under a muted `thinking` line as the theme gives the answer kind's folds to start, and its text as the markdown document it is.
 * A call it made is its tool entry's to draw — dsh logs every kept call, and one kept by a stream cut short there
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

/**
 * Draw an approval: the tool that asks and why, then the decision that
 * answered it, in the tone of its outcome — or that it waits for one.
 * @param decided - the decision, once it has one.
 */
function drawApproval(asked: Extract<Fact, { readonly kind: 'asked' }>, decided: Extract<Fact, { readonly kind: 'decided' }> | undefined): Node {
  const head: Node = { kind: 'text', text: [{ mark: 'approval' } as const, ` ${asked.toolName} asks${asked.reason === undefined ? '' : `: ${asked.reason}`}`] }
  if (decided === undefined) return { kind: 'stack', children: [head, { kind: 'text', text: '  waiting…', tone: 'muted' }] }
  const tone = decided.outcome === 'allowed-once' ? 'success' : decided.outcome === 'rejected' ? 'error' : 'muted'
  const outcome = decided.outcome === 'allowed-once' ? 'allowed once' : decided.outcome
  return { kind: 'stack', children: [head, { kind: 'text', text: `  ${outcome}`, tone }] }
}

/**
 * Draw a tool call: what was asked, then whether it is running, failed, left
 * behind by its turn, or what it returned, folded. Its mark says how the
 * call stands.
 * @param result - its result, once it has one.
 * @param left - how the turn that ended without this call's result ended, when it did.
 */
function drawTool(call: Extract<Fact, { readonly kind: 'call' }>, result: Extract<Fact, { readonly kind: 'result' }> | undefined, left: string | undefined): Node {
  const mark: Span = result === undefined
    ? { mark: 'running' }
    : result.failed === true ? { mark: 'failed' } : { mark: 'done' }
  const head: Node = { kind: 'text', text: [mark, ` ${call.name} ${call.arguments}`] }
  if (result === undefined) {
    const waiting: Node = left === undefined
      ? { kind: 'text', text: ['  running ', { since: call.time }], tone: 'muted' }
      : { kind: 'text', text: `  the turn ended without it: ${left}`, tone: 'muted' }
    return { kind: 'stack', children: [head, waiting] }
  }
  const reason: Node[] = result.failure?.reason === undefined ? [] : [{ kind: 'text', text: `  ${result.failure.reason}`, tone: 'error' }]
  const output: Node = { kind: 'fold', id: 'output', child: { kind: 'text', text: textOf(result.blocks) } }
  return { kind: 'stack', children: [head, ...reason, output] }
}

/** Every kind of entry binnacle draws — or, for a quiet one, does not; a view registered under one of these names draws that kind, so no authored fact may take one. */
const drawnHere: Readonly<Record<Entry['kind'], true>> = { prompt: true, context: true, answer: true, tool: true, approval: true, decided: true, result: true, authored: true, unknown: true, quiet: true }

/**
 * Draw one entry.
 * @param views - authors' views; the newest for the entry's key draws it, and one for a built-in kind builds on or replaces binnacle's.
 * @param theme - the theme it is drawn in, whose tones, marks and backgrounds are the names a view may use.
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

/**
 * The key an entry's views are registered under: its kind, a quiet kind's dsh
 * type, or an authored fact's name.
 */
export function keyOf(entry: Entry): string {
  if (entry.kind === 'authored') return entry.fact.name
  return entry.kind === 'quiet' ? entry.fact.type : entry.kind
}

/**
 * Draw one entry with the views of its key up to a height, the topmost drawing.
 * @param stack - the key's views, oldest first.
 * @param height - how many of them draw; none is binnacle's own drawing.
 * @param theme - the theme a view's node is read against.
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
 * Draw one entry as binnacle does.
 * @param problem - what went wrong drawing it otherwise, said under its title, or after it when it has none.
 * @returns what it draws.
 */
function builtIn(entry: Entry, problem?: string): Node {
  switch (entry.kind) {
    case 'prompt':
      // The prompt heads its turn in a band: padded, and filled with the theme's background for what the person sent.
      // A steer is drawn as what the person sent, marked as reaching a turn already running.
      return noted({ kind: 'band', background: 'prompt', child: { kind: 'text', text: [{ mark: entry.steer === true ? 'steer' : 'prompt' } as const, ` ${textOf(entry.fact.blocks)}`] } }, problem)
    case 'context':
      return noted(folded('context', [{ mark: 'context' } as const, ` added by ${entry.fact.source}`], { kind: 'text', text: textOf(entry.fact.blocks) }), problem)
    case 'answer':
      return noted(drawAnswer(entry.fact), problem)
    case 'tool':
      return noted(drawTool(entry.call, entry.result, entry.left), problem)
    case 'approval':
      return noted(drawApproval(entry.asked, entry.decided), problem)
    case 'decided': {
      // A decision without its ask reaches the screen only from a log torn between the two; it names the approval it answered, as a result without its call names its call.
      const title: Node = { kind: 'text', text: [{ mark: 'approval', tone: 'muted' } as const, ` decision of approval ${entry.fact.id}: ${entry.fact.outcome}`], tone: 'muted' }
      return problem === undefined ? title : { kind: 'stack', children: [title, problemLine(problem)] }
    }
    case 'result': {
      // A fold that shows rows keeps its marker beneath them, and what shows rows is out of #18: its title stays a
      // line of its own above the fold, as it always was, a titled fold that shows rows left to #23.
      const title: Node = { kind: 'text', text: [{ mark: 'done', tone: 'muted' } as const, ` result of call ${entry.fact.callId}`], tone: 'muted' }
      const fold: Node = { kind: 'fold', id: 'output', child: { kind: 'text', text: textOf(entry.fact.blocks) } }
      return problem === undefined ? { kind: 'stack', children: [title, fold] } : { kind: 'stack', children: [title, problemLine(problem), fold] }
    }
    case 'authored':
      return noted(folded('data', [{ mark: 'unknown' } as const, ` ${entry.fact.name}`], { kind: 'text', text: shown(entry.fact.data) }), problem)
    case 'unknown':
      return noted(folded('record', [{ mark: 'unknown' } as const, ` ${entry.fact.type}`], { kind: 'text', text: shown(entry.fact.record) }), problem ?? entry.fact.problem)
    case 'quiet':
      // A blank node is a line of its own; a stack of nothing is no lines at all, which is what quiet draws — though what a view over it did wrong is still said.
      return problem === undefined ? { kind: 'stack', children: [] } : problemLine(problem)
  }
}

/**
 * A fold under a muted title line, folded as the theme gives its kind's folds to start: showing no rows, its marker rides the title
 * and the fold costs that one line.
 * @param id - the fold's region name, by what it is.
 * @param title - the line it folds under.
 * @param child - what it holds.
 */
function folded(id: string, title: readonly Span[], child: Node): Extract<Node, { readonly kind: 'fold' }> {
  return { kind: 'fold', id, title, tone: 'muted', child }
}

/**
 * Content, and what went wrong after it in error, if anything.
 */
function noted(body: Node, problem: string | undefined): Node {
  return problem === undefined ? body : { kind: 'stack', children: [body, problemLine(problem)] }
}

/**
 * What went wrong, said beneath what it concerns: the problem mark and what went wrong beside it, in error.
 */
function problemLine(what: string): Node {
  return { kind: 'text', text: [{ mark: 'problem' } as const, ` ${what}`], tone: 'error' }
}

/**
 * A value as the fallback shows it: JSON where it can be, what `describe` says where it cannot.
 * @param value - an event's record or an author's data.
 * @returns its text.
 */
function shown(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? describe(value)
  } catch {
    // A cycle, a bigint or a getter that throws has no JSON: say what it is instead.
    return describe(value)
  }
}
