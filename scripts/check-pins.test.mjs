import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkPins } from './check-pins.mjs'

const REFS = { dsh: { tag: 'dsh-v0.1.7-rc.2' }, pi: { tag: 'v0.85.1' } }
const CORDIS = '4.0.4'

test('packages pinned to the versions the references are tagged at pass', () => {
  const deps = { '@deepseek-ai/dsh-cmdline': '0.1.7-rc.2', '@earendil-works/pi-tui': '0.85.1', '@deepseek-ai/cordis': '4.0.4', commander: '15.0.0' }
  assert.deepEqual(checkPins(deps, REFS, CORDIS), [])
})

test('a dsh package off the dsh reference\'s tag is named', () => {
  assert.deepEqual(checkPins({ '@deepseek-ai/dsh-cmdline': '0.1.7-rc.1' }, REFS, CORDIS), [
    '@deepseek-ai/dsh-cmdline is 0.1.7-rc.1, but the dsh reference is dsh-v0.1.7-rc.2; move both together',
  ])
})

test('pi-tui off the pi reference\'s tag, and cordis off what dsh vendors, are named', () => {
  assert.deepEqual(checkPins({ '@earendil-works/pi-tui': '0.85.0', '@deepseek-ai/cordis': '4.0.3' }, REFS, CORDIS), [
    '@earendil-works/pi-tui is 0.85.0, but the pi reference is v0.85.1; move both together',
    '@deepseek-ai/cordis is 4.0.3, but dsh at its pin vendors 4.0.4',
  ])
})

test('a range is not a pin', () => {
  assert.deepEqual(checkPins({ commander: '^15.0.0' }, REFS, CORDIS), ['commander is ^15.0.0; pin it exact'])
})
