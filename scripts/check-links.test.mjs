import { test } from 'node:test'
import assert from 'node:assert/strict'
import { brokenLinks } from './check-links.mjs'

const onlyAdr = (path) => path === 'docs/adr/0001-x.md'

test('a relative link resolves from the file that holds it, anchor aside', () => {
  assert.deepEqual(brokenLinks([{ path: 'docs/architecture.md', text: 'see [ADR 1](adr/0001-x.md#context)' }], onlyAdr), [])
})

test('a relative link to nothing is named with its line', () => {
  const files = [{ path: 'README.md', text: 'one\n[gone](docs/gone.md) and [web](https://x.y) and [top](#top)' }]
  assert.deepEqual(
    brokenLinks(files, () => false),
    ['README.md:2: docs/gone.md does not exist'],
  )
})

test('a link inside code is not a link', () => {
  const files = [{ path: 'README.md', text: '`[a](b.md)`\n```\n[c](d.md)\n```\n' }]
  assert.deepEqual(
    brokenLinks(files, () => false),
    [],
  )
})

test('a decision record links only other records, as it is never edited to follow a move', () => {
  const files = [
    {
      path: 'docs/adr/0002-y.md',
      text: '[ADR 1](0001-x.md), [the layers](../../packages/binnacle/layers.json),\n[the glossary](../glossary.md#fact) and [web](https://x.y)',
    },
  ]
  assert.deepEqual(
    brokenLinks(files, () => true),
    [
      'docs/adr/0002-y.md:1: ../../packages/binnacle/layers.json is not a decision record; a record links only other records, and names the rest in words',
      'docs/adr/0002-y.md:2: ../glossary.md is not a decision record; a record links only other records, and names the rest in words',
    ],
  )
})
