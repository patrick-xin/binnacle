import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeHerdr } from './herdr.mjs'

function fake(answers) {
  const calls = []
  const exec = async (file, args) => {
    calls.push([file, ...args].join(' '))
    const next = answers.shift()
    if (next === undefined) throw new Error(`no answer for ${args.join(' ')}`)
    if ('code' in next && 'stdout' in next) return next
    return { code: 'error' in next ? 1 : 0, stdout: JSON.stringify(next), stderr: '' }
  }
  return { calls, runner: makeHerdr({ exec }) }
}

const agent = {
  n: 140,
  role: 'implementer',
  tool: 'pi',
  model: 'zai/glm-5.3',
  thinking: 'max',
  cwd: '/w/140',
  sessionDir: '/t/140/agents/implementer/sessions',
  env: { BINNACLE_TASK: '140', BINNACLE_ROLE: 'implementer' },
}
const tab = { result: { root_pane: { pane_id: 'w1:p2' }, tab: { tab_id: 'w1:t3' } } }

test('the herdr runner starts pi in a new tab, with the task and the role in its environment', async () => {
  const { calls, runner } = fake([tab, { result: { agent: {} } }])
  assert.deepEqual(await runner.start(agent), { name: 'implementer-140', pane: 'w1:p2', tab: 'w1:t3' })
  assert.deepEqual(calls, [
    'herdr tab create --cwd /w/140 --label implementer-140 --no-focus --env BINNACLE_TASK=140 --env BINNACLE_ROLE=implementer',
    'herdr agent start implementer-140 --kind pi --pane w1:p2 -- --model zai/glm-5.3 --thinking max --session-dir /t/140/agents/implementer/sessions',
  ])
})

test('a herdr agent started again continues the session in its folder, and a forked one starts from a copy of another', async () => {
  const resumed = fake([tab, { result: { agent: {} } }])
  await resumed.runner.start({ ...agent, resume: true })
  assert.match(
    resumed.calls[1],
    / -- --model zai\/glm-5\.3 --thinking max --session-dir \/t\/140\/agents\/implementer\/sessions --continue$/,
  )
  const forked = fake([tab, { result: { agent: {} } }])
  await forked.runner.start({ ...agent, fork: '/t/100/agents/reviewer/sessions/b.jsonl' })
  assert.match(
    forked.calls[1],
    / --session-dir \/t\/140\/agents\/implementer\/sessions --fork \/t\/100\/agents\/reviewer\/sessions\/b\.jsonl$/,
  )
})

test('a herdr start that fails removes its tab, and rejects', async () => {
  const { calls, runner } = fake([tab, { error: { code: 'agent_start_timeout', message: 'not ready' } }, { result: {} }])
  await assert.rejects(runner.start(agent), /agent_start_timeout/)
  assert.equal(calls.at(-1), 'herdr tab close w1:t3')
})

test('a herdr prompt that the agent did not start to work on is sent again, three tries in all', async () => {
  const stalled = { error: { code: 'agent_prompt_stalled', message: 'idle' } }
  const { calls, runner } = fake([stalled, { error: { code: 'timeout' } }, { result: { agent: {} } }])
  const retries = []
  await runner.prompt({ name: 'implementer-140' }, 'go', (tried, code) => retries.push(`${tried} ${code}`))
  assert.equal(calls.length, 3)
  assert.equal(calls[0], 'herdr agent prompt implementer-140 go --wait --until working --timeout 20000')
  assert.deepEqual(retries, ['1 agent_prompt_stalled', '2 timeout'])

  const failing = fake([stalled, stalled, stalled, stalled])
  await assert.rejects(failing.runner.prompt({ name: 'implementer-140' }, 'go'), /agent_prompt_stalled/)
  assert.equal(failing.calls.length, 3)
})

test('a herdr prompt that fails for another reason is not sent again', async () => {
  const { calls, runner } = fake([{ error: { code: 'agent_blocked', message: 'blocked' } }])
  await assert.rejects(runner.prompt({ name: 'implementer-140' }, 'go'), /agent_blocked/)
  assert.equal(calls.length, 1)
})

test("the herdr runner maps herdr's states, and finds the pane's shell as the root", async () => {
  const handle = { name: 'implementer-140', pane: 'w1:p2', tab: 'w1:t3' }
  const info = { result: { process_info: { shell_pid: 4242 } } }
  for (const [status, state] of [
    ['working', 'working'],
    ['blocked', 'blocked'],
    ['idle', 'idle'],
    ['done', 'idle'],
    ['unknown', 'unknown'],
  ]) {
    const { calls, runner } = fake([{ result: { agent: { agent_status: status } } }, info])
    assert.deepEqual(await runner.activity(handle), { state, root: 4242 }, status)
    assert.deepEqual(calls, ['herdr agent get implementer-140', 'herdr pane process-info --pane w1:p2'])
  }
  const gone = fake([{ error: { code: 'agent_not_found', message: 'no agent' } }])
  assert.deepEqual(await gone.runner.activity(handle), { state: 'gone' })
  const broken = fake([{ code: 1, stdout: '', stderr: 'cannot reach the herdr server' }])
  await assert.rejects(broken.runner.activity(handle), /cannot reach the herdr server/)
})

test('the herdr runner closes the tab, and a tab that is gone is already closed', async () => {
  const { calls, runner } = fake([{ result: {} }])
  await runner.close({ name: 'implementer-140', pane: 'w1:p2', tab: 'w1:t3' })
  assert.deepEqual(calls, ['herdr tab close w1:t3'])
  const gone = fake([{ error: { code: 'tab_not_found', message: 'no tab' } }])
  await gone.runner.close({ name: 'implementer-140', pane: 'w1:p2', tab: 'w1:t3' })
})
