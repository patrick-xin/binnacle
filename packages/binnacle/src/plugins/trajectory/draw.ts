import type { Fact, Mark, Node } from '../../api.ts'

type Span = Exclude<Extract<Node, { readonly kind: 'text' }>['text'], string>[number]

type Blocks = Extract<Fact, { readonly blocks: readonly unknown[] }>['blocks']

function shown(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    // A cycle or a getter that throws has no JSON; say what the value is instead.
    return String(value)
  }
}

function recordOf(fact: Fact): Node {
  const text = fact.kind === 'quiet'
    ? shown(fact.record)
    : fact.kind === 'unknown'
      ? `${fact.problem === undefined ? '' : `${fact.problem}\n\n`}${shown(fact.record)}`
      : shown(fact)
  return { kind: 'text', text }
}

function lineOf(fact: Fact, words: readonly Span[], mark?: Mark): readonly Span[] {
  const spans: Span[] = [{ text: `${fact.seq} `, tone: 'dim' }]
  if (mark !== undefined) spans.push({ mark })
  return [...spans, ...words]
}

function firstLine(blocks: Blocks): string {
  return blocks.map(block => block.kind === 'unread' ? `[${block.type}]` : block.text).join('\n').split('\n')[0] ?? ''
}

/** `tools` is each call's name by its id, so a result says what it answered. */
function eventOf(fact: Fact, tools: ReadonlyMap<string, string>): Node {
  const said = wordsOf(fact, tools)
  const line = lineOf(fact, said.words, said.mark)
  return { kind: 'fold', id: `${fact.seq}`, rows: 0, title: line, ...said.tone === undefined ? {} : { tone: said.tone }, child: recordOf(fact) }
}

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

/**
 * One line per event, grouped by turn. It reads only the facts it is handed,
 * never the events: a read fact's line opens to the fact binnacle read, and a
 * quiet or unknown one to the event as logged, as the fallback view shows it.
 */
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
