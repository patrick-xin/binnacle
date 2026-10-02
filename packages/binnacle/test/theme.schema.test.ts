/**
 * The schema binnacle ships for theme files, held to the reading a file gets:
 * the row's translation followed by the theme parser. The schema is a
 * structural and lexical preflight an author agent runs before writing; the
 * reading is authoritative. What only the reading can check — a var a colour
 * names, what a new mark needs, a glyph's cell width — the schema accepts, so
 * its invariant is one-way: it never refuses what the reading accepts, over
 * the accepted set and the worked example; the held set of structural breaks
 * is refused by both.
 * @module binnacle/test/theme.schema
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Ajv, type AnySchema } from 'ajv'
import { changes } from '../src/plugins/theme/read.ts'
import { parseThemeChanges } from '../src/ui/theme-changes.ts'
import { binnacleTheme } from '../src/ui/theme.ts'

const here = dirname(fileURLToPath(import.meta.url))

/** The schema as it ships, and one validator of it. */
const schema = JSON.parse(readFileSync(join(here, '../theme.schema.json'), 'utf8')) as AnySchema
const ajv = new Ajv()

/** Whether the schema says a theme file stands. */
const validates = (data: unknown): boolean => ajv.validate(schema, data) === true

/** Whether the reading says a theme file stands: the row's translation, then the parser. */
const read = (data: unknown): boolean => {
  try {
    parseThemeChanges(changes(data), binnacleTheme)
    return true
  } catch {
    return false
  }
}

/** Each theme file of the fixtures, parsed. */
const files = readdirSync(join(here, 'fixtures/theme')).map((file) => ({
  file,
  data: JSON.parse(readFileSync(join(here, 'fixtures/theme', file), 'utf8')) as unknown,
}))

test('what the reading accepts, the schema never refuses: the worked example and the accepted set validate', () => {
  const accepted = files.filter(({ file }) => file === 'example.json' || file.startsWith('accepted-'))
  assert.equal(accepted.length, 2, 'the worked example and the accepted set are there')
  for (const { file, data } of accepted) {
    assert.equal(read(data), true, `the reading accepts ${file}`)
    assert.equal(validates(data), true, `the schema does not refuse ${file}`)
  }
})

test('each structural break is refused by both the schema and the reading', () => {
  const broken = files.filter(({ file }) => file.startsWith('broken-'))
  assert.equal(broken.length, 12, 'twelve broken files, one structural way a theme file breaks each')
  for (const { file, data } of broken) {
    assert.equal(validates(data), false, `the schema refuses ${file}`)
    assert.equal(read(data), false, `the reading refuses ${file}`)
  }
})

test('dusk, the worked example the author skill ships, validates against the schema and the reading accepts it', () => {
  const data = JSON.parse(readFileSync(join(here, '../skills/binnacle-author/themes/dusk.json'), 'utf8')) as unknown
  assert.equal(read(data), true, 'the reading accepts dusk')
  assert.equal(validates(data), true, 'the schema does not refuse dusk')
})
