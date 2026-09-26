import { test } from 'node:test'
import assert from 'node:assert/strict'
import { brokenLinks } from './check-links.mjs'

const onlyAdr = path => path === 'docs/adr/0001-x.md'

test('a relative link resolves from the file that holds it, anchor aside', () => {
  assert.deepEqual(brokenLinks([{ path: 'docs/architecture.md', text: 'see [ADR 1](adr/0001-x.md#context)' }], onlyAdr), [])
})

test('a relative link to nothing is named with its line', () => {
  const files = [{ path: 'README.md', text: 'one\n[gone](docs/gone.md) and [web](https://x.y) and [top](#top)' }]
  assert.deepEqual(brokenLinks(files, () => false), ['README.md:2: docs/gone.md does not exist'])
})

test('a link inside code is not a link', () => {
  const files = [{ path: 'README.md', text: '`[a](b.md)`\n```\n[c](d.md)\n```\n' }]
  assert.deepEqual(brokenLinks(files, () => false), [])
})
