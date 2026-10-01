import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moveDeps, movePin } from './pin.mjs'

test("moving a pin rewrites one reference's commit and tag, and nothing else", () => {
  const manifest = {
    dsh: { url: 'u', commit: 'aaa', tag: 'dsh-v0.1.7-rc.2', role: 'r' },
    pi: { url: 'v', commit: 'bbb', tag: 'v0.85.1', role: 's' },
  }
  assert.deepEqual(movePin(manifest, 'pi', 'v0.87.1', 'ccc'), {
    dsh: { url: 'u', commit: 'aaa', tag: 'dsh-v0.1.7-rc.2', role: 'r' },
    pi: { url: 'v', commit: 'ccc', tag: 'v0.87.1', role: 's' },
  })
})

test('a reference without a tag has no release line to move along', () => {
  assert.throws(
    () => movePin({ codex: { url: 'u', commit: 'aaa' } }, 'codex', 'v1', 'bbb'),
    /codex: pinned by commit alone; edit references.json/,
  )
})

test('moving dsh moves every dsh package to its version, and every other deepseek-ai package to what dsh vendors', () => {
  const deps = {
    '@deepseek-ai/dsh-cmdline': '0.1.7-rc.2',
    '@deepseek-ai/cordis': '4.0.4',
    '@earendil-works/pi-tui': '0.85.1',
    commander: '15.0.0',
  }
  assert.deepEqual(moveDeps(deps, 'dsh', '0.1.8', { '@deepseek-ai/cordis': '4.1.0' }), {
    '@deepseek-ai/dsh-cmdline': '0.1.8',
    '@deepseek-ai/cordis': '4.1.0',
    '@earendil-works/pi-tui': '0.85.1',
    commander: '15.0.0',
  })
})

test('moving pi moves pi-tui alone', () => {
  const deps = { '@deepseek-ai/dsh-cmdline': '0.1.7-rc.2', '@earendil-works/pi-tui': '0.85.1' }
  assert.deepEqual(moveDeps(deps, 'pi', '0.87.1', {}), { '@deepseek-ai/dsh-cmdline': '0.1.7-rc.2', '@earendil-works/pi-tui': '0.87.1' })
})

test('a deepseek-ai package the new dsh no longer vendors is refused, not left behind', () => {
  assert.throws(
    () => moveDeps({ '@deepseek-ai/cosmokit': '1.8.5' }, 'dsh', '0.1.8', {}),
    /@deepseek-ai\/cosmokit: dsh at 0.1.8 vendors no such package/,
  )
})
