import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fuzzy } from '../src/index.ts'

const names = (query: string, ...items: string[]) => fuzzy(query, items, (item) => item)

test('fuzzy gives the items whose text holds the query’s letters in order: the ones that start with it first, then the closest', () => {
  assert.deepEqual(names('co', 'plan', 'scroll', 'compact', 'goal', 'ecology', 'context'), ['compact', 'context', 'ecology', 'scroll'])
})

test('fuzzy measures an item by the closest of its alignments, and keeps the order of items as close as each other', () => {
  assert.deepEqual(names('ab', 'axxb', 'xaxab', 'yab', 'ba'), ['xaxab', 'yab', 'axxb'])
})

test('fuzzy matches whatever the case of the query and of the text', () => {
  assert.deepEqual(names('CoM', 'Compact', 'xcom', 'goal'), ['Compact', 'xcom'])
})

test('fuzzy with an empty query gives every item, in its order', () => {
  assert.deepEqual(names('', 'goal', 'compact', 'plan'), ['goal', 'compact', 'plan'])
})

test('fuzzy reads each item’s text through `text`, and gives back the items themselves', () => {
  const commands = [{ name: 'plan' }, { name: 'compact' }]
  assert.deepEqual(
    fuzzy('c', commands, (command) => command.name),
    [{ name: 'compact' }],
  )
})
