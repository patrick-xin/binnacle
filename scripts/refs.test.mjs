import { test } from 'node:test'
import assert from 'node:assert/strict'
import { plan, taggedCommit } from './refs.mjs'

const MANIFEST = {
  pi: { url: 'https://example.com/pi.git', commit: 'aaa', role: 'the renderer' },
  dsh: { url: 'https://example.com/dsh.git', commit: 'bbb', role: 'the harness' },
}

test('with no local file, every public reference is fetched from its url at its pin', () => {
  assert.deepEqual(plan(MANIFEST, undefined), [
    { name: 'pi', url: 'https://example.com/pi.git', commit: 'aaa', local: false },
    { name: 'dsh', url: 'https://example.com/dsh.git', commit: 'bbb', local: false },
  ])
})

test('a local file may point a public reference at a clone, never move its pin', () => {
  const local = { pi: { url: '/clones/pi', commit: 'zzz' } }
  assert.deepEqual(plan(MANIFEST, local)[0], { name: 'pi', url: '/clones/pi', commit: 'aaa', local: false })
})

test('a local file may add a reference of its own, marked local', () => {
  const local = { private: { url: '/clones/private', commit: 'ccc' } }
  assert.deepEqual(plan(MANIFEST, local)[2], { name: 'private', url: '/clones/private', commit: 'ccc', local: true })
})

test('a reference without a url or a pin is refused', () => {
  assert.throws(() => plan({ pi: { url: 'x' } }, undefined), /pi: needs a url and a commit/)
  assert.throws(() => plan(MANIFEST, { private: { url: 'x' } }), /private: needs a url and a commit/)
})

test('only the named references are planned when names are given', () => {
  assert.deepEqual(plan(MANIFEST, undefined, ['dsh']).map(ref => ref.name), ['dsh'])
  assert.throws(() => plan(MANIFEST, undefined, ['nope']), /nope: not a reference/)
})

test('a tag in the manifest is carried to the fetch, which proves it names the pin', () => {
  const tagged = { dsh: { url: 'u', commit: 'bbb', tag: 'dsh-v1.0.0' } }
  assert.deepEqual(plan(tagged, undefined), [{ name: 'dsh', url: 'u', commit: 'bbb', local: false, tag: 'dsh-v1.0.0' }])
})

test('a tag names the commit it peels to, whether annotated or not', () => {
  const annotated = 'aaa\trefs/tags/v1\nbbb\trefs/tags/v1^{}\n'
  assert.equal(taggedCommit(annotated), 'bbb')
  assert.equal(taggedCommit('ccc\trefs/tags/v2\n'), 'ccc')
  assert.equal(taggedCommit(''), undefined)
})
