import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spelledKeys } from './check-words.mjs'

const refused = (at, text, key) => `${at}: ${text} names the key ${key}; a plugin spells no key — which keys answer something is the key table's, and an ask names them on its edge — so say what it does, and leave the key to the table`

test('a string or template literal that names a key as a word is refused, with its line and the key it names', () => {
  const text = "const hint = 'press Enter to send'\nconst more = `then ${n} Esc`\nconst plain = 'the call returned'\n"
  assert.deepEqual(spelledKeys('a.ts', text), [
    refused('a.ts:1', "'press Enter to send'", 'Enter'),
    refused('a.ts:2', '`then ${n} Esc`', 'Esc'),
  ])
})

test('a chord is refused as its modifiers and key, however it is joined, and a word that only starts like one is not', () => {
  const text = "const a = 'ctrl+c to stop'\nconst b = 'shift+Tab steps in'\nconst c = 'alt-x'\nconst d = 'super+ctrl+f2 opens it'\nconst e = 'the alt-text of an image'\n"
  assert.deepEqual(spelledKeys('a.ts', text), [
    refused('a.ts:1', "'ctrl+c to stop'", 'ctrl+c'),
    refused('a.ts:2', "'shift+Tab steps in'", 'shift+Tab'),
    refused('a.ts:3', "'alt-x'", 'alt-x'),
    refused('a.ts:4', "'super+ctrl+f2 opens it'", 'super+ctrl+f2'),
  ])
})

test('the key a plugin offers the key table, as a screen\'s key, is not a word, and is the only such place', () => {
  const text = "ctx.binnacle.screen('trajectory', { key: 'ctrl+o', description: 'open the trajectory' })\nctx.binnacle.screen('help', { hint: 'ctrl+h' })\n"
  assert.deepEqual(spelledKeys('a.ts', text), [refused('a.ts:2', "'ctrl+h'", 'ctrl+h')])
})

test('what no person reads is not a word: a module a file imports, a type, a property\'s name', () => {
  const text = "import type { Row } from './tab.ts'\nexport * from './space.ts'\ntype Edge = 'up' | 'down'\nconst moves = { 'left': 1 }\nconst row: Edge = moves.left === 1 ? 'up' : 'down'\n"
  assert.deepEqual(spelledKeys('a.ts', text), [refused('a.ts:5', "'up'", 'up'), refused('a.ts:5', "'down'", 'down')])
})

test('a key property is a binding only in the object a screen is placed with, and anywhere else its words are refused', () => {
  const text = "ctx.binnacle.screen('go', { key: 'ctrl+g', draw })\nconst row = { key: 'press Enter to continue' }\nctx.binnacle.ask('go', { key: 'ctrl+g' })\nctx.binnacle.screen({ key: 'ctrl+g' }, { title: 'x' })\n"
  assert.deepEqual(spelledKeys('a.ts', text), [
    refused('a.ts:2', "'press Enter to continue'", 'Enter'),
    refused('a.ts:3', "'ctrl+g'", 'ctrl+g'),
    refused('a.ts:4', "'ctrl+g'", 'ctrl+g'),
  ])
})
