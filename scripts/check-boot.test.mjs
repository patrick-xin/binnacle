import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readBoot } from './check-boot.mjs'

const OK = { launcher: '0.1.7-rc.2', status: 0, stdout: 'binnacle: ok\n' }

test('the pinned launcher mounting the bundle and reporting it healthy passes', () => {
  assert.deepEqual(readBoot('dsh-v0.1.7-rc.2', OK), [])
})

test('a launcher off the pin is named, since the bundle compiles against the pin', () => {
  assert.deepEqual(readBoot('dsh-v0.1.7-rc.2', { ...OK, launcher: '0.1.7-rc.1' }), [
    'dsh 0.1.7-rc.1 is on PATH, but the dsh reference is dsh-v0.1.7-rc.2; install @deepseek-ai/dsh@0.1.7-rc.2',
  ])
})

test('no launcher, a failed boot, or a boot that never reports are named', () => {
  assert.deepEqual(readBoot('dsh-v0.1.7-rc.2', { ...OK, launcher: undefined }), ['dsh is not on PATH; install @deepseek-ai/dsh@0.1.7-rc.2'])
  assert.deepEqual(readBoot('dsh-v0.1.7-rc.2', { ...OK, status: 1, stdout: '' }), [
    'dsh --profile binnacle --check exited 1 without reporting `binnacle: ok`; run it to see why',
  ])
})

test('a boot that never finishes is named with what dsh says is pending, since a row waiting on a missing service keeps it alive', () => {
  assert.deepEqual(readBoot('dsh-v0.1.7-rc.2', { ...OK, status: null, stdout: '', timedOut: true }), [
    'dsh --profile binnacle --check did not finish in 120 s; a row waiting on a service nothing provides keeps it alive — its stderr names the row',
  ])
})
