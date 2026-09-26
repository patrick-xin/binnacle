import { test } from 'node:test'
import assert from 'node:assert/strict'
import { profileFiles } from './profile.mjs'

test('the profile links the package and stacks it over dsh-base', () => {
  const files = profileFiles('/work/binnacle/packages/binnacle')
  assert.deepEqual(JSON.parse(files['package.json']), {
    name: 'dsh-profile-binnacle',
    version: '0.0.0',
    private: true,
    dependencies: { binnacle: 'link:/work/binnacle/packages/binnacle' },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'binnacle'] } },
  })
  assert.match(files['cordis.yml'], /^\[\]$/m)
})

test('the person\'s own patch layer is offered, never owned', () => {
  const files = profileFiles('/work/binnacle/packages/binnacle')
  assert.match(files['cordis.patch.yml'], /^\[\]$/m)
  assert.deepEqual(Object.keys(files).toSorted(), ['cordis.patch.yml', 'cordis.yml', 'package.json'])
})
