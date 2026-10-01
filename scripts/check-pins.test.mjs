import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkPins, checkTree, materialized } from './check-pins.mjs'

const REFS = { dsh: { tag: 'dsh-v0.1.7-rc.2' }, pi: { tag: 'v0.85.1' } }
const VENDORED = { '@deepseek-ai/cordis': '4.0.4', '@deepseek-ai/cordis-plugin-loader': '1.0.5' }

test('packages pinned to the versions the references are tagged at pass', () => {
  const deps = {
    '@deepseek-ai/dsh-cmdline': '0.1.7-rc.2',
    '@earendil-works/pi-tui': '0.85.1',
    '@deepseek-ai/cordis': '4.0.4',
    commander: '15.0.0',
  }
  assert.deepEqual(checkPins(deps, REFS, VENDORED), [])
})

test("a dsh package off the dsh reference's tag is named", () => {
  assert.deepEqual(checkPins({ '@deepseek-ai/dsh-cmdline': '0.1.7-rc.1' }, REFS, VENDORED), [
    '@deepseek-ai/dsh-cmdline is 0.1.7-rc.1, but the dsh reference is dsh-v0.1.7-rc.2; move both together',
  ])
})

test("pi-tui off the pi reference's tag, and a package off what dsh vendors, are named", () => {
  assert.deepEqual(
    checkPins(
      { '@earendil-works/pi-tui': '0.85.0', '@deepseek-ai/cordis': '4.0.3', '@deepseek-ai/cordis-plugin-loader': '1.0.5' },
      REFS,
      VENDORED,
    ),
    [
      '@earendil-works/pi-tui is 0.85.0, but the pi reference is v0.85.1; move both together',
      '@deepseek-ai/cordis is 4.0.3, but dsh at its pin vendors 4.0.4',
    ],
  )
})

test('a deepseek-ai package dsh neither releases nor vendors is named', () => {
  assert.deepEqual(checkPins({ '@deepseek-ai/stray': '1.0.0' }, REFS, VENDORED), [
    '@deepseek-ai/stray is not a dsh package, and dsh at its pin vendors no such package',
  ])
})

test('without dsh fetched, a vendored pin cannot be read and says so', () => {
  assert.deepEqual(checkPins({ '@deepseek-ai/cordis': '4.0.4' }, REFS, undefined), [
    '@deepseek-ai/cordis is 4.0.4, but dsh is not fetched; run `pnpm refs`',
  ])
})

test('a range is not a pin', () => {
  assert.deepEqual(checkPins({ commander: '^15.0.0' }, REFS, VENDORED), ['commander is ^15.0.0; pin it exact'])
})

const LOCK = [
  "lockfileVersion: '9.0'",
  'importers:',
  '  packages/binnacle:',
  '    dependencies:',
  'packages:',
  '',
  "  '@deepseek-ai/cordis@4.0.4':",
  '    resolution: {integrity: sha512-x}',
  '',
  "  '@deepseek-ai/dsh-cmdline@0.1.7-rc.2':",
  '    resolution: {integrity: sha512-x}',
  '',
  '  commander@15.0.0:',
  '    resolution: {integrity: sha512-x}',
  '',
  'snapshots:',
  '',
  "  '@deepseek-ai/cordis@4.0.4(@deepseek-ai/cordis-plugin-loader@1.0.5)':",
  '    dependencies: {}',
].join('\n')

test('the tree is every deepseek-ai package the lockfile resolves, by version', () => {
  assert.deepEqual(materialized(LOCK), { '@deepseek-ai/cordis': ['4.0.4'], '@deepseek-ai/dsh-cmdline': ['0.1.7-rc.2'] })
})

test('a tree every declaration covers passes', () => {
  assert.deepEqual(checkTree({ '@deepseek-ai/cordis': ['4.0.4'] }, { '@deepseek-ai/cordis': '4.0.4' }), [])
})

test('a package the tree materializes but the manifest does not declare is named with the pin to add', () => {
  assert.deepEqual(checkTree({ '@deepseek-ai/cosmokit': ['1.8.5'] }, {}), [
    '@deepseek-ai/cosmokit@1.8.5 is in the tree but not declared; declare it in devDependencies at 1.8.5',
  ])
})

test('a package the tree resolves off its declaration, or at two versions, is named', () => {
  assert.deepEqual(checkTree({ '@deepseek-ai/cordis': ['4.0.3', '4.0.4'] }, { '@deepseek-ai/cordis': '4.0.4' }), [
    '@deepseek-ai/cordis is declared 4.0.4, but the tree resolves 4.0.3, 4.0.4',
  ])
})
