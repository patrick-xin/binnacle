/**
 * The author API's surface: every declaration an author reaches from `api.ts`, followed from the built
 * declarations through each layer it re-exports from, comments dropped, and held to a snapshot. A change to any
 * of them fails here until the snapshot is updated (`node --test --test-update-snapshots test/api.test.ts`), so the
 * commit that changes what authors depend on shows it in the snapshot's diff.
 * @module binnacle/test/api
 */
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))

/** One built declaration file, read: what it declares, by name, and where each name it imports comes from. */
interface Declarations {
  /** Each declared name's statements, comments dropped; a function's overloads are its several statements. */
  readonly declared: ReadonlyMap<string, string>
  /** Each imported or re-exported name: the module it names and the name it has there. */
  readonly imported: ReadonlyMap<string, { readonly module: string, readonly name: string }>
  /** The names the file exports, in source order. */
  readonly exported: readonly string[]
}

/**
 * Read a built declaration file.
 * @param file - its absolute path.
 * @returns what it declares and imports.
 */
function read(file: string): Declarations {
  const text = readFileSync(file, 'utf8')
  const { program, comments } = parseSync(file, text)
  const bare = (start: number, end: number): string => {
    let kept = ''
    let at = start
    for (const comment of comments.filter(each => each.start >= start && each.end <= end)) {
      kept += text.slice(at, comment.start)
      at = comment.end
    }
    return (kept + text.slice(at, end)).split('\n').filter(line => line.trim() !== '').join('\n')
  }
  const declared = new Map<string, string>()
  const imported = new Map<string, { module: string, name: string }>()
  const exported: string[] = []
  const declare = (name: string, statement: string): void => {
    const before = declared.get(name)
    declared.set(name, before === undefined ? statement : `${before}\n${statement}`)
  }
  for (const node of program.body) {
    if (node.type === 'ImportDeclaration') {
      for (const specifier of node.specifiers ?? []) {
        if (specifier.type !== 'ImportSpecifier') throw new Error(`${file}: follow ${specifier.type} too`)
        imported.set(specifier.local.name, { module: node.source.value, name: nameOf(specifier.imported) })
      }
      continue
    }
    if (node.type === 'ExportAllDeclaration') throw new Error(`${file}: follow export * too`)
    const exporting = node.type === 'ExportNamedDeclaration'
    const declaration = exporting ? node.declaration : node
    if (exporting && node.source !== null && node.source !== undefined) {
      for (const specifier of node.specifiers) {
        const name = nameOf(specifier.exported)
        imported.set(name, { module: node.source.value, name: nameOf(specifier.local) })
        exported.push(name)
      }
      continue
    }
    if (declaration === null || declaration === undefined) continue
    const names = 'id' in declaration && declaration.id !== null && declaration.id !== undefined && 'name' in declaration.id
      ? [declaration.id.name]
      : 'declarations' in declaration ? declaration.declarations.map(each => each.id.type === 'Identifier' ? each.id.name : '?') : []
    for (const name of names) {
      declare(name, bare(node.start, node.end))
      if (exporting && !exported.includes(name)) exported.push(name)
    }
  }
  return { declared, imported, exported }
}

/**
 * The name an import or export specifier gives.
 * @param named - the specifier's identifier or string literal.
 * @returns the name.
 */
function nameOf(named: { readonly type: string, readonly name?: string, readonly value?: string }): string {
  const name = named.name ?? named.value
  if (typeof name !== 'string') throw new Error(`a specifier with no name: ${named.type}`)
  return name
}

/**
 * Every declaration reachable from an entry's exports: each exported name followed to the file that declares it,
 * and every name its declaration mentions that its file declares or imports, followed in turn. A name from a
 * package is named with the package, not followed.
 * @param entry - the entry's built declaration file.
 * @returns the declarations, each under the file it is declared in, in the order they are reached.
 */
function surface(entry: string): string {
  const files = new Map<string, Declarations>()
  const fileOf = (file: string): Declarations => files.get(file) ?? files.set(file, read(file)).get(file)!
  const seen = new Set<string>()
  const lines: string[] = []
  const visit = (file: string, name: string): void => {
    if (seen.has(`${file}#${name}`)) return
    seen.add(`${file}#${name}`)
    const module = fileOf(file)
    const statement = module.declared.get(name)
    if (statement !== undefined) {
      lines.push(`// ${relative(dist, file)}`, statement)
      for (const mentioned of new Set(statement.match(/[A-Za-z_$][\w$]*/g))) {
        if (mentioned !== name && (module.declared.has(mentioned) || module.imported.has(mentioned))) visit(file, mentioned)
      }
      return
    }
    const from = module.imported.get(name)
    if (from === undefined) throw new Error(`${relative(dist, file)}: ${name} is neither declared nor imported`)
    if (from.module.startsWith('.')) visit(join(dirname(file), from.module.replace(/\.(ts|js)$/, '.d.ts')), from.name)
    else lines.push(`// ${name} ← ${from.module}${from.name === name ? '' : `#${from.name}`}`)
  }
  for (const name of fileOf(entry).exported) visit(entry, name)
  return `${lines.join('\n')}\n`
}

test('an author reaches exactly these declarations: changing one changes what authors depend on, and this snapshot', (t) => {
  t.assert.snapshot(surface(join(dist, 'api.d.ts')), { serializers: [(value: unknown) => String(value)] })
})
