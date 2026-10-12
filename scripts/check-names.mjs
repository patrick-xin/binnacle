// Each name that a built-in sets is in AUTHORING.md (ADR 0004), so that an author reads it there, not in the source.
// The package's test `names.test.ts` runs both halves: the names that the built-ins set and read as they run, and the names that their source writes out.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'

/** The calls that set or read a name, by the method's name. */
const NAMING = new Set(['place', 'look', 'lookOf', 'action', 'model', 'layout'])
/** The Kit's components, which take their instance's name as `name`. */
const COMPONENTS = new Set(['list', 'line', 'title', 'tabs'])
const ARRAY_WALKS = new Set(['map', 'flatMap', 'forEach'])

// A hole stands for one or more of the characters of a name.
const HOLE = '[\\w/-]+'

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * What the guide names: each span of inline code that is a name, as written, and each pattern, with `<…>` for a part that varies.
 * A pattern that starts with a word and a dot names the names that match it. One that starts with `<…>`, such as `<name>.row`, names a piece of each named instance.
 */
export function namedIn(guide) {
  const prose = guide.replace(/```[\s\S]*?```/g, '')
  const spans = [...prose.matchAll(/`([^`\n]+)`/g)].map((match) => match[1].trim())
  const literals = new Set(spans.filter((span) => /^[\w/-]+(\.[\w/-]+)*$/.test(span)))
  const patterns = []
  const pieces = new Set()
  for (const span of spans) {
    if (!/^[\w/<>.-]+$/.test(span) || !span.includes('<')) continue
    const piece = /^<[\w-]+>\.([\w-]+)$/.exec(span)?.[1]
    if (piece !== undefined) pieces.add(piece)
    else if (/^[\w-]+\./.test(span)) patterns.push(span)
  }
  return { literals, patterns, pieces }
}

const shapeOf = (pattern) => pattern.replace(/<[\w-]+>/g, '<>')

/** Whether the guide names a name: as written, by a pattern of its namespace, or as a named instance's piece. */
export function isNamed(name, named) {
  if (named.literals.has(name)) return true
  if (
    named.patterns.some((pattern) =>
      new RegExp(
        `^${pattern
          .split(/<[\w-]+>/)
          .map(escape)
          .join(HOLE)}$`,
      ).test(name),
    )
  )
    return true
  const dot = name.lastIndexOf('.')
  return dot > 0 && named.literals.has(name.slice(0, dot)) && named.pieces.has(name.slice(dot + 1))
}

/** Whether the guide names a template's names: a pattern with the template's text, and a `<…>` for each hole. */
export function isTemplateNamed(shape, named) {
  return named.patterns.some((pattern) => shapeOf(pattern) === shape)
}

function walk(node, visit, parents = []) {
  if (Array.isArray(node)) {
    for (const each of node) walk(each, visit, parents)
    return
  }
  if (node === null || typeof node !== 'object') return
  if (typeof node.type === 'string') visit(node, parents)
  const inner = typeof node.type === 'string' ? [...parents, node] : parents
  for (const key of Object.keys(node)) if (key !== 'parent') walk(node[key], visit, inner)
}

/** The names that a declaration's pattern binds: an identifier, or each one inside a destructuring. */
function boundNames(pattern) {
  switch (pattern?.type) {
    case 'Identifier':
      return [pattern.name]
    case 'AssignmentPattern':
      return boundNames(pattern.left)
    case 'RestElement':
      return boundNames(pattern.argument)
    case 'ArrayPattern':
      return pattern.elements.flatMap(boundNames)
    case 'ObjectPattern':
      return pattern.properties.flatMap((property) => boundNames(property.type === 'RestElement' ? property : property.value))
    case 'TSParameterProperty':
      return boundNames(pattern.parameter)
    default:
      return []
  }
}

/** A key as written, `name` or `'name'`, or computed from a string: none for a key that is computed otherwise. */
function keyOf(key, computed) {
  if (!computed && key.type === 'Identifier') return key.name
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value
  if (key.type === 'TemplateLiteral' && key.expressions.length === 0) return key.quasis[0].value.cooked
  return undefined
}

const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'])
const UNREADABLE = Symbol('unreadable')
// The service is read as `binnacle`, or as the `binnacle` of a Context.
const isService = (node) =>
  (node.type === 'Identifier' && node.name === 'binnacle') ||
  (node.type === 'MemberExpression' && !node.computed && node.property.name === 'binnacle')

/**
 * Each name that a built-in's source gives a naming call or a component of the Kit, on every branch: a name, or a template's shape with `<>` for each hole.
 * It reads a string, a template, an array of them, a constant that holds one, and the parameter of a walk over an array of them, by the nearest binding of each name.
 * A name it cannot read is `unreadable`, with the text of what gives it, as is a naming method or a component that is used other than by a call.
 */
export function namesInSource(path, text) {
  const { program, errors } = parseSync(path, text, { lang: 'ts', sourceType: 'module' })
  if (errors.length > 0) return [{ at: 0, unreadable: `a file that does not parse: ${errors[0].message}` }]
  // The Kit's components, by the local names that the built-in imports them as, and the namespaces it imports them in.
  const components = new Map()
  const namespaces = new Set()
  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration') continue
    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ImportNamespaceSpecifier') namespaces.add(specifier.local.name)
      else if (specifier.type === 'ImportSpecifier' && COMPONENTS.has(keyOf(specifier.imported, false)))
        components.set(specifier.local.name, keyOf(specifier.imported, false))
    }
  }

  const fromBlock = (statements, name, scope) => {
    for (const statement of statements) {
      const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
      if (declaration?.type === 'VariableDeclaration') {
        for (const declarator of declaration.declarations) {
          if (!boundNames(declarator.id).includes(name)) continue
          return declaration.kind === 'const' && declarator.id.type === 'Identifier' && declarator.init !== null
            ? valuesOf(declarator.init, scope)
            : UNREADABLE
        }
      }
      if ((declaration?.type === 'FunctionDeclaration' || declaration?.type === 'ClassDeclaration') && declaration.id?.name === name)
        return UNREADABLE
      if (statement.type === 'ImportDeclaration' && statement.specifiers.some((specifier) => specifier.local.name === name))
        return UNREADABLE
    }
    return undefined
  }
  // The values of the nearest binding of a name, from the innermost scope out: UNREADABLE when it binds a value that is not read.
  const bindingOf = (name, parents) => {
    for (let index = parents.length - 1; index >= 0; index--) {
      const node = parents[index]
      if (FUNCTIONS.has(node.type)) {
        if (node.params.some((param) => boundNames(param).includes(name))) {
          const walking = parents[index - 1]
          const callee = walking?.type === 'CallExpression' ? walking.callee : undefined
          const walks =
            callee?.type === 'MemberExpression' && ARRAY_WALKS.has(keyOf(callee.property, callee.computed)) && walking.arguments[0] === node
          return walks && node.params[0]?.type === 'Identifier' && node.params[0].name === name
            ? valuesOf(callee.object, parents.slice(0, index - 1))
            : UNREADABLE
        }
        if (node.type === 'FunctionExpression' && node.id?.name === name) return UNREADABLE
      }
      if (
        node.type === 'ForOfStatement' &&
        node.left.type === 'VariableDeclaration' &&
        node.left.declarations.some((declarator) => boundNames(declarator.id).includes(name))
      ) {
        return node.left.declarations[0].id.type === 'Identifier' ? valuesOf(node.right, parents.slice(0, index)) : UNREADABLE
      }
      if (
        (node.type === 'ForStatement' || node.type === 'ForInStatement') &&
        JSON.stringify(boundNames(node.init?.declarations?.[0]?.id ?? node.left?.declarations?.[0]?.id)).includes(`"${name}"`)
      )
        return UNREADABLE
      if (node.type === 'CatchClause' && boundNames(node.param).includes(name)) return UNREADABLE
      const statements =
        node.type === 'Program' || node.type === 'BlockStatement' || node.type === 'StaticBlock'
          ? node.body
          : node.type === 'SwitchCase'
            ? node.consequent
            : undefined
      if (statements !== undefined) {
        const found = fromBlock(statements, name, parents.slice(0, index + 1))
        if (found !== undefined) return found
      }
    }
    return UNREADABLE
  }
  const valuesOf = (node, parents) => {
    if (node?.type === 'TSAsExpression' || node?.type === 'TSSatisfiesExpression' || node?.type === 'ParenthesizedExpression')
      return valuesOf(node.expression, parents)
    if (node?.type === 'Literal' && typeof node.value === 'string') return [{ name: node.value }]
    if (node?.type === 'TemplateLiteral') {
      const parts = node.expressions.map((expression) => valuesOf(expression, parents))
      let names = [{ text: node.quasis[0].value.cooked, holes: 0 }]
      node.expressions.forEach((_, index) => {
        const part = parts[index]
        const next = node.quasis[index + 1].value.cooked
        names = names.flatMap((sofar) =>
          part === UNREADABLE || part.some((value) => value.name === undefined)
            ? [{ text: `${sofar.text}<>${next}`, holes: sofar.holes + 1 }]
            : part.map((value) => ({ text: sofar.text + value.name + next, holes: sofar.holes })),
        )
      })
      return names.map(({ text: written, holes }) => (holes === 0 ? { name: written } : { shape: written }))
    }
    if (node?.type === 'ArrayExpression') {
      const each = node.elements.map((element) => valuesOf(element, parents))
      return each.includes(UNREADABLE) ? UNREADABLE : each.flat()
    }
    if (node?.type === 'Identifier') return bindingOf(node.name, parents)
    return UNREADABLE
  }

  const found = []
  const take = (node, given, parents) => {
    const values = given === undefined ? UNREADABLE : valuesOf(given, parents)
    const shown = given ?? node
    if (values === UNREADABLE) found.push({ at: node.start, unreadable: text.slice(shown.start, shown.end) })
    else for (const value of values) found.push({ at: node.start, ...value })
  }
  const componentOf = (callee) => {
    if (callee.type === 'Identifier') return components.get(callee.name)
    if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && namespaces.has(callee.object.name)) {
      const key = keyOf(callee.property, callee.computed)
      return COMPONENTS.has(key) ? key : undefined
    }
    return undefined
  }
  walk(program, (node, parents) => {
    const parent = parents.at(-1)
    const called = parent?.type === 'CallExpression' && parent.callee === node
    if (node.type === 'MemberExpression' && NAMING.has(keyOf(node.property, node.computed))) {
      if (called) take(parent, parent.arguments[0], parents.slice(0, -1))
      // A naming method of the service that is not called here is called where its name cannot be read.
      else if (isService(node.object)) found.push({ at: node.start, unreadable: text.slice(node.start, node.end) })
    }
    if (node.type === 'ObjectPattern' && parent?.type === 'VariableDeclarator' && parent.init !== null && isService(parent.init)) {
      if (node.properties.some((property) => property.type === 'RestElement' || NAMING.has(keyOf(property.key, property.computed)))) {
        found.push({ at: node.start, unreadable: text.slice(parent.start, parent.end) })
      }
    }
    // An identifier that is a property's name, a key or an import's own name is no reference to the component.
    const named =
      node.type === 'Identifier' &&
      ((parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) ||
        (parent?.type === 'Property' && parent.key === node && !parent.computed) ||
        parent?.type === 'ImportSpecifier' ||
        parent?.type === 'ExportSpecifier')
    const component = named ? undefined : componentOf(node)
    if (component !== undefined) {
      if (!called) found.push({ at: node.start, unreadable: text.slice(node.start, node.end) })
      else {
        const config = parent.arguments[1]
        const nameOf =
          config?.type === 'ObjectExpression' && !config.properties.some((each) => each.type === 'SpreadElement')
            ? config.properties.find((each) => keyOf(each.key, each.computed) === 'name')
            : undefined
        take(parent, nameOf?.value, parents.slice(0, -1))
      }
    }
  })
  return found.toSorted((a, b) => a.at - b.at)
}

/** What the guide does not name, of the names given: each with where it came from. */
export function unnamed(found, guide) {
  const named = namedIn(guide)
  return found.filter((each) =>
    each.unreadable !== undefined ? true : each.shape !== undefined ? !isTemplateNamed(each.shape, named) : !isNamed(each.name, named),
  )
}

// Runtime half. The fixture's states reach each piece that a built-in draws only in some state, such as an empty draft or a card of each kind.
const at = (seq, type, data) => ({ seq, type, time: seq * 1000, data })
const text = (value) => [{ type: 'text', text: value }]
const call = (seq, name, args = '{}') => at(seq, 'tool/call', { turn: 1, step: 1, callId: `c${seq}`, name, arguments: args })
const result = (seq, called, value, options = {}) =>
  at(seq, 'tool/result', {
    turn: 1,
    step: 1,
    message: { role: 'tool', toolCallId: `c${called}`, isError: options.isError ?? false, content: text(value) },
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  })

// dsh's tools, as their views give each kind of card: terminal, read, diff, search, web, generic, and a tool with no view.
const TOOLS = {
  bash: {
    presentCall: (args) => ({ card: 'terminal', title: args.command, description: 'Runs it', cwd: '/repo' }),
    presentResult: (_, { meta }) => ({ card: 'terminal', ...meta }),
  },
  read: { presentResult: () => ({ card: 'read', path: 'a.ts', offset: 1, lines: [{ number: 1, text: 'x' }], totalLines: 1 }) },
  edit: { presentCall: () => ({ card: 'diff', title: 'Edit a.ts', diffs: [{ path: 'a.ts', oldText: 'a\n', newText: 'b\n' }] }) },
  grep: { presentResult: () => ({ card: 'search', shape: 'matches', files: [], truncated: false, total: 0 }) },
  fetch: {
    presentResult: () => ({ card: 'web', kind: 'fetch', title: 'Example', url: 'https://example.com', statusCode: 200, truncated: false }),
  },
  done: { presentResult: () => ({ card: 'generic', title: 'Done', content: text('shown') }) },
}

const COMMANDS = [
  { name: 'compact', description: 'Compact the session' },
  { name: 'goal', description: 'Set a goal', input: { hint: '<goal>' } },
]

// The fixture fails as a check does when a state it means to reach draws nothing it can be told by.
function reached(rows, texts) {
  const screen = rows.join('\n')
  const missing = texts.filter((each) => !screen.includes(each))
  if (missing.length > 0) throw new Error(`check-names: the fixture did not reach what draws ${missing.join(', ')}`)
}

/** The names that the built-ins set and read while binnacle runs through the fixture's states. */
export async function namesAtRuntime() {
  const { BinnacleService } = await import('../packages/binnacle/src/core/service.ts')
  const { mount } = await import('../packages/binnacle/src/testing/index.ts')
  const recorded = new Set()
  const methods = ['place', 'look', 'lookOf', 'action', 'model', 'layout']
  const originals = methods.map((method) => [method, BinnacleService.prototype[method]])
  for (const [method, original] of originals) {
    BinnacleService.prototype[method] = function (name, ...rest) {
      for (const each of Array.isArray(name) ? name : [name]) recorded.add(each)
      return original.call(this, name, ...rest)
    }
  }
  const app = await mount({
    size: { columns: 100, rows: 60 },
    provide: (ctx) => {
      ctx.provide('tools', { get: (name) => TOOLS[name] })
      ctx.provide('commands', {
        list: () => COMMANDS,
        find: (_agent, name) => COMMANDS.find((command) => command.name === name),
        execute: async () => ({ commandId: 'k', result: { kind: 'success' } }),
        register: () => () => {},
      })
    },
  })
  try {
    await app.screen()
    await app.type('hi')
    await app.press('ctrl+c')
    await app.type('/')
    await app.press('down')
    await app.press('escape')
    await app.press('ctrl+c')
    await app.agent.commit(at(1, 'user/message', { role: 'user', source: { kind: 'user' }, content: text('a prompt') }))
    await app.agent.commit(at(2, 'user/message', { role: 'user', source: { kind: 'runtime-context' }, content: text('context') }))
    await app.agent.status('running')
    await app.agent.commit(at(3, 'turn/start', { turn: 1 }))
    await app.agent.stream({ type: 'start', attemptId: 'a', revision: 1, turn: 1, step: 1 })
    for (const [index, chunk] of [
      { type: 'reasoning-delta', index: 0, text: 'thinking' },
      { type: 'text-delta', index: 1, text: 'Hel' },
      { type: 'tool-call-delta', index: 2, id: 't', name: 'bash', argumentsDelta: '{"command":"ls"}' },
    ].entries()) {
      await app.agent.stream({ type: 'chunk', attemptId: 'a', revision: 1, index, time: 1, chunk })
    }
    await app.agent.commit(
      at(4, 'assistant/message', {
        turn: 1,
        step: 1,
        message: { role: 'assistant', content: [{ type: 'reasoning', text: 'thought' }, ...text('Hello')] },
        stream: [],
      }),
    )
    reached(await app.screen(), ['a prompt', 'thought', 'Hello'])
    let seq = 5
    for (const [name, args, value, options] of [
      ['bash', '{"command":"ls"}', 'a.ts', { meta: { output: 'a.ts\n', exitCode: 0 } }],
      ['read', '{"path":"a.ts"}', 'x', {}],
      ['edit', '{}', 'edited', {}],
      ['grep', '{}', '', {}],
      ['fetch', '{}', 'page', {}],
      ['done', '{}', 'shown', {}],
      ['mystery', '{}', 'what', {}],
      ['mystery', '{}', 'it broke', { isError: true }],
    ]) {
      const called = seq++
      await app.agent.commit(call(called, name, args))
      await app.agent.commit(result(seq++, called, value, options))
    }
    for (const [type, data] of [
      ['command/run', { commandId: 'k', name: 'compact', source: {} }],
      ['command/done', { commandId: 'k', kind: 'error', text: 'no such model' }],
      ['llm/retry', { retry: 1, maxRetries: 3, failure: { message: 'overloaded', code: 'X' } }],
      ['compaction/end', { compactionId: 'p', turn: null }],
      ['turn/end', { turn: 1, reason: { kind: 'error', error: { message: 'the key is wrong', code: 'X' } } }],
    ]) {
      await app.agent.commit(at(seq++, type, data))
    }
    reached(await app.screen(), ['no such model', 'overloaded', 'the key is wrong'])
    await app.press('shift+tab')
    await app.press('up')
    await app.press('enter')
    await app.press('shift+tab')
    await app.clock.pass(1000)
    // A second question, with no Choices, draws the Line to type its answer in.
    const asked = app.ask([
      { id: 'q', question: 'Which?', options: [{ label: 'One', description: 'the first' }, { label: 'Two' }] },
      { id: 't', question: 'Why?' },
    ])
    await app.screen()
    await app.press('enter')
    await app.type('because')
    await app.press('enter')
    await app.press('enter')
    await asked
    const approved = app.approve('bash', { reason: 'It runs outside the sandbox.' })
    await app.screen()
    await app.press('enter')
    await approved
    await app.agent.status('idle')
    await app.screen()
  } finally {
    await app.close()
    for (const [method, original] of originals) BinnacleService.prototype[method] = original
  }
  return [...recorded].map((name) => ({ name }))
}

/** Each built-in's source, under `src/plugins/`, by its path there. */
function builtInSources(root) {
  return readdirSync(root, { recursive: true })
    .filter((path) => path.endsWith('.ts'))
    .map((path) => ({ path: path.split('\\').join('/'), text: readFileSync(join(root, path), 'utf8') }))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repository = join(dirname(fileURLToPath(import.meta.url)), '..')
  const binnacle = join(repository, 'packages', 'binnacle')
  const guide = readFileSync(join(binnacle, 'AUTHORING.md'), 'utf8')
  const sources = builtInSources(join(binnacle, 'src', 'plugins'))
  const inSource = sources.flatMap(({ path, text: source }) =>
    unnamed(namesInSource(path, source), guide).map((each) => ({
      ...each,
      where: `packages/binnacle/src/plugins/${path}:${source.slice(0, each.at).split('\n').length}`,
    })),
  )
  const atRuntime = unnamed(await namesAtRuntime(), guide).map((each) => ({ ...each, where: 'a built-in, as binnacle ran' }))
  for (const { where, name, shape, unreadable } of [...inSource, ...atRuntime]) {
    console.error(
      unreadable === undefined
        ? `${where}: ${name ?? shape} is not named in AUTHORING.md`
        : `${where}: a name given as ${unreadable} cannot be read; write it as a string, a template, an array of them, or a module constant`,
    )
  }
  const count = inSource.length + atRuntime.length
  console.log(count === 0 ? 'check-names: ok' : `check-names: ${count} names AUTHORING.md does not name`)
  process.exitCode = count === 0 ? 0 : 1
}
