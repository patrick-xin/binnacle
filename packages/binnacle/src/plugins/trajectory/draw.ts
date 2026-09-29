/**
 * The Trajectory's drawing: every event the session logged, one line each —
 * its kind and what it says in a few words, its record folded on that line —
 * grouped by turn.
 *
 * It reads only the facts it is handed, never the events: what binnacle has
 * read of an event is the fact, and what it has not — a quiet or unknown
 * kind — is the record the fact carries. So a read fact's line opens to the
 * fact binnacle read, and a quiet or unknown one to the event as logged, as
 * the fallback view shows it. dsh's own shapes are the facts layer's to read.
 */

import type { Fact, Mark, Node } from '../../api.ts'

/** A run of a text line, as the author API's `Node` draws one: its text in a tone of its own, or one of the theme's marks. */
type Span = Exclude<Extract<Node, { readonly kind: 'text' }>['text'], string>[number]

/** The blocks a fact carries, as the author API's `Fact` types them. */
type Blocks = Extract<Fact, { readonly blocks: readonly unknown[] }>['blocks']

/**
 * A value as the record shows it: JSON where it can be, the value's string
 * form where it cannot — a cycle, a bigint — as the fallback shows one.
 */
function shown(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    // A cycle or a getter that throws has no JSON; say what the value is instead.
    return String(value)
  }
}

/**
 * What one line opens to: the record of what the fact knows. A quiet or
 * unknown fact carries its event as logged, and a read one is binnacle's
 * reading of it, so that is what its line opens to; an unknown fact that
 * names what went wrong says it above the event.
 */
function recordOf(fact: Fact): Node {
  const text = fact.kind === 'quiet'
    ? shown(fact.record)
    : fact.kind === 'unknown'
      ? `${fact.problem === undefined ? '' : `${fact.problem}\n\n`}${shown(fact.record)}`
      : shown(fact)
  return { kind: 'text', text }
}

/** What one line says of one fact: its place in the log, dim, then its kind — a mark where one stands for it — and a few words. */
function lineOf(fact: Fact, words: readonly Span[], mark?: Mark): readonly Span[] {
  const spans: Span[] = [{ text: `${fact.seq} `, tone: 'dim' }]
  if (mark !== undefined) spans.push({ mark })
  return [...spans, ...words]
}

/**
 * The first line of some blocks' text, where a block binnacle cannot read is
 * its type in brackets; what the blocks say beyond the first line is the
 * record's to hold.
 */
function firstLine(blocks: Blocks): string {
  return blocks.map(block => block.kind === 'unread' ? `[${block.type}]` : block.text).join('\n').split('\n')[0] ?? ''
}

/**
 * One line for one fact: its kind, and what it says in a few words, its
 * record folded on that line.
 * @param fact - the fact.
 * @param tools - the name of each call in the log, by its id, so a result says what it answered.
 */
function eventOf(fact: Fact, tools: ReadonlyMap<string, string>): Node {
  const said = wordsOf(fact, tools)
  const line = lineOf(fact, said.words, said.mark)
  return { kind: 'fold', id: `${fact.seq}`, rows: 0, title: line, ...said.tone === undefined ? {} : { tone: said.tone }, child: recordOf(fact) }
}

/** What one line says of one fact, by its kind. */
function wordsOf(fact: Fact, tools: ReadonlyMap<string, string>): { readonly words: readonly Span[], readonly mark?: Mark, readonly tone?: 'muted' | 'dim' } {
  switch (fact.kind) {
    case 'turn':
      return { words: [fact.phase === 'start' ? `turn ${fact.turn} begins` : `turn ${fact.turn} ended${fact.ending === undefined ? '' : ` · ${fact.ending}`}`], tone: 'muted' }
    case 'step':
      return { words: [`step ${fact.step} ${fact.phase === 'start' ? 'begins' : 'ends'}`], tone: 'dim' }
    case 'prompt':
      return { words: [` ${firstLine(fact.blocks)}`], mark: 'prompt' }
    case 'context':
      return { words: [` added by ${fact.source}`], mark: 'context' }
    case 'answer':
      return { words: [`answer by ${fact.provider}/${fact.model}${fact.interrupted ? ' · interrupted' : ''}`] }
    case 'call':
      return { words: [`call ${fact.name}`] }
    case 'asked':
      return { words: [` ${fact.toolName} asks`], mark: 'approval' }
    case 'decided':
      return { words: [` decision ${fact.outcome}`], mark: 'approval', tone: 'muted' }
    case 'run':
      return { words: [`/${fact.name}${fact.args === undefined ? '' : fact.args}`] }
    case 'done':
      return { words: [`done ${fact.outcome}`], tone: 'muted' }
    case 'start':
      return { words: [' compaction begins'], mark: 'compaction', tone: 'muted' }
    case 'summary':
      return { words: [` summary of ${fact.items} items`], mark: 'compaction', tone: 'muted' }
    case 'end':
      return { words: [` compaction ${fact.error === undefined ? 'ends' : 'failed'}`], mark: 'compaction', tone: 'muted' }
    case 'result':
      return { words: [` result of ${tools.get(fact.callId) ?? fact.callId}`], mark: fact.failed ? 'failed' : 'done' }
    case 'authored':
      return { words: [` ${fact.name}`], mark: 'unknown' }
    case 'quiet':
      return { words: [fact.type], tone: 'muted' }
    case 'unknown':
      return { words: [` ${fact.type}`], mark: 'unknown' }
  }
}

/** What the Trajectory draws of a session: one line per event, grouped by turn. */
export function drawTrajectory(facts: readonly Fact[]): Node {
  const tools = new Map<string, string>()
  for (const fact of facts) if (fact.kind === 'call') tools.set(fact.callId, fact.name)
  const groups: { readonly heading: Node, lines: Node[] }[] = []
  for (const fact of facts) {
    if (fact.kind === 'turn' && fact.phase === 'start') {
      groups.push({ heading: { kind: 'text', text: `turn ${fact.turn}`, tone: 'accent' }, lines: [] })
    } else if (groups.length === 0) {
      groups.push({ heading: { kind: 'text', text: 'before turn 1', tone: 'muted' }, lines: [] })
    }
    groups.at(-1)?.lines.push(eventOf(fact, tools))
  }
  return {
    kind: 'stack',
    children: groups.flatMap((group, index) => [
      ...(index === 0 ? [] : [{ kind: 'blank' } as const]),
      group.heading,
      ...group.lines,
    ]),
  }
}
