import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readBoot } from './check-boot.mjs'

const OK = {
  launcher: '0.1.7-rc.2',
  status: 0,
  stdout: 'binnacle: ok (deepseek/deepseek-v4, presets: standard, ptc, minimal, cordis, author)\n',
}

test('the pinned launcher mounting the bundle and reporting it healthy passes', () => {
  assert.deepEqual(readBoot('dsh-v0.1.7-rc.2', OK), [])
})

test('a boot that reports ok without reporting the roster is named, for the roster is what the boot check holds', () => {
  assert.deepEqual(readBoot('dsh-v0.1.7-rc.2', { ...OK, stdout: 'binnacle: ok (deepseek/deepseek-v4)\n' }), [
    'the roster the boot reports holds no author, cordis, minimal, ptc, standard; run `dsh --profile binnacle --check` to see what the registry mounted',
  ])
})

test('a boot whose roster is missing a shipped preset is named with the preset', () => {
  assert.deepEqual(
    readBoot('dsh-v0.1.7-rc.2', { ...OK, stdout: 'binnacle: ok (deepseek/deepseek-v4, presets: standard, ptc, minimal, cordis)\n' }),
    ['the roster the boot reports holds no author; run `dsh --profile binnacle --check` to see what the registry mounted'],
  )
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

test('a boot whose stderr leaves a row pending is named with the row, for it waits on a service nothing provides', () => {
  const stderr = 'cordis-inspect-providers (@deepseek-ai/dsh-tool-cordis/host): pending (waiting for service: cordisInspect)\n'
  assert.deepEqual(readBoot('dsh-v0.1.7-rc.2', { ...OK, stderr }), [
    'a row the boot left pending: cordis-inspect-providers (@deepseek-ai/dsh-tool-cordis/host): pending (waiting for service: cordisInspect) — a row waits on a service nothing provides; add the row that publishes it, or name its provider',
  ])
})

test('a row waiting on several services is named too, as dsh words it when more than one is missing', () => {
  const stderr = 'row (package): pending (waiting for services: first, second)\n'
  assert.deepEqual(readBoot('dsh-v0.1.7-rc.2', { ...OK, stderr }), [
    'a row the boot left pending: row (package): pending (waiting for services: first, second) — a row waits on a service nothing provides; add the row that publishes it, or name its provider',
  ])
})
