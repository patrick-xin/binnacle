import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toolOf } from './tools.mjs'

test('pi starts with the model, the thinking level and the session folder of its role', () => {
  const pi = toolOf('reviewer', { tool: 'pi' })
  assert.deepEqual(
    pi.args({
      n: 140,
      role: 'reviewer',
      tool: 'pi',
      model: 'openai-codex/gpt-6.1-sol',
      thinking: 'medium',
      cwd: '/w',
      sessionDir: '/s',
      env: {},
    }),
    ['--model', 'openai-codex/gpt-6.1-sol', '--thinking', 'medium', '--session-dir', '/s'],
  )
})

test('a role whose tool the task tool cannot start is refused, with the role and the tool', () => {
  assert.throws(() => toolOf('implementer', { tool: 'claude-code' }), /the implementer uses claude-code, and the task tool starts only pi/)
})
