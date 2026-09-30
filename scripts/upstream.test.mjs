import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, releasesAfter, unpublished } from './upstream.mjs'

test('versions order by number, and a prerelease comes before its release', () => {
  const sorted = ['0.10.0', '0.9.1', '0.1.7', '0.1.7-rc.10', '0.1.7-rc.2', '0.1.7-alpha.1', '1.0.0'].toSorted(compareVersions)
  assert.deepEqual(sorted, ['0.1.7-alpha.1', '0.1.7-rc.2', '0.1.7-rc.10', '0.1.7', '0.9.1', '0.10.0', '1.0.0'])
})

test('the releases after a pin are the tags of its line that are newer, oldest first', () => {
  const tags = ['dsh-v0.1.7-rc.1', 'dsh-v0.1.7-rc.2', 'dsh-v0.1.8', 'dsh-v0.1.7', 'web-v9.9.9', 'dsh-v0.1.8-rc.1']
  assert.deepEqual(releasesAfter('dsh-v0.1.7-rc.2', tags), ['dsh-v0.1.7', 'dsh-v0.1.8-rc.1', 'dsh-v0.1.8'])
})

test('a line is its prefix: another prefix ending the same way is not the same line', () => {
  assert.deepEqual(releasesAfter('v0.85.1', ['v0.86.0', 'dsh-v0.99.0', 'coding-agent-v1.0.0']), ['v0.86.0'])
})

test('a pin at the newest release has nothing after it', () => {
  assert.deepEqual(releasesAfter('v0.87.1', ['v0.85.1', 'v0.87.1']), [])
})

test('a release waits on every package its pin would move that npm does not list at its version yet', () => {
  const deps = { '@deepseek-ai/dsh-agent': '0.2.0-rc.1', '@deepseek-ai/dsh-tool-ask-user': '0.2.0-rc.1', '@deepseek-ai/cordis': '4.0.4', '@earendil-works/pi-tui': '0.99.1' }
  const listed = { '@deepseek-ai/dsh-agent': ['0.2.0-rc.1', '0.2.0-rc.2'], '@deepseek-ai/dsh-tool-ask-user': ['0.2.0-rc.1'] }
  assert.deepEqual(unpublished(deps, 'dsh', '0.2.0-rc.2', pkg => listed[pkg] ?? []), ['@deepseek-ai/dsh-tool-ask-user'])
})
