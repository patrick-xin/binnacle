// The clock stands still until a test moves it, so each time a test asserts is a literal.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { run } from './task.mjs'

export function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

export function makeWorld() {
  const dir = mkdtempSync(join(tmpdir(), 'binnacle-task-'))
  const home = join(dir, 'home')
  mkdirSync(home)
  const origin = join(dir, 'origin.git')
  execFileSync('git', ['init', '--bare', '-b', 'main', origin], { stdio: 'ignore' })
  const repo = join(dir, 'repo')
  execFileSync('git', ['clone', origin, repo], { stdio: ['ignore', 'ignore', 'ignore'] })
  for (const [key, value] of [
    ['user.email', 'test@example.com'],
    ['user.name', 'Test'],
  ])
    execFileSync('git', ['config', key, value], { cwd: repo })
  mkdirSync(join(repo, '.agents'))
  writeFileSync(
    join(repo, '.agents', 'roles.json'),
    JSON.stringify({
      lead: { tool: 'claude-code', model: 'claude-opus-5-5', family: 'anthropic' },
      implementer: { tool: 'pi', model: 'zai/glm-5.3', family: 'zai', thinking: 'max', runner: 'fake' },
      reviewer: { tool: 'pi', model: 'openai-codex/gpt-6.1-sol', family: 'openai', thinking: 'medium', runner: 'fake' },
      families: { 'openai-codex': 'openai', zai: 'zai', google: 'google', anthropic: 'anthropic' },
    }),
  )
  writeFileSync(join(repo, 'README.md'), 'one\n')
  execFileSync('git', ['add', '.agents/roles.json', 'README.md'], { cwd: repo })
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repo, stdio: 'ignore' })
  execFileSync('git', ['push', '-u', 'origin', 'main'], { cwd: repo, stdio: 'ignore' })

  const issues = new Map()
  const titles = new Map()
  const parents = new Map()
  let clock = new Date('2026-10-05T10:00:00.000Z')
  const runner = makeFakeRunner()
  const gh = makeFakeGh()
  let slept = 0
  return {
    dir,
    home,
    repo,
    deps: {
      home,
      repo,
      readIssue(n) {
        const body = issues.get(String(n))
        return body === undefined ? Promise.reject(new Error(`no issue ${n}`)) : Promise.resolve(body)
      },
      parentOf: async (n) => parents.get(String(n)),
      titleOf: async (n) => titles.get(String(n)) ?? `issue ${n}`,
      subIssues: async (n) =>
        [...parents]
          .filter(([, spec]) => spec === n)
          .map(([ticket]) => Number(ticket))
          .toSorted((a, b) => a - b),
      now: () => clock,
      // A sleep that yields to the event loop, and ends a watch that finds
      // nothing: a test's timeout fails the test, but cannot stop its loop,
      // and a loop that runs on keeps the test file from exiting.
      sleep() {
        slept += 1
        if (slept > 1000) return Promise.reject(new Error('slept 1000 times: nothing came'))
        return new Promise((resolve) => setImmediate(resolve))
      },
      env: {},
      // A choice names herdr or headless; in a test, each is the fake.
      runners: { fake: runner, herdr: runner, headless: runner },
      gh: (args, input) => gh.call(args, input),
      processes: async () => [],
    },
    runner,
    gh,
    setIssue(n, body) {
      issues.set(String(n), body)
    },
    spec(n, title = `The spec ${n}`) {
      issues.set(String(n), '## Intent\n\nSome work.\n\n## Door\n\nTwo-way.\n')
      titles.set(String(n), title)
    },
    ticket(n, spec, body = '## Spec\n\nA slice.\n\n## Door\n\nTwo-way. Only the task tool changes.\n\n## Review level\n\nmedium\n') {
      issues.set(String(n), body)
      parents.set(String(n), spec)
    },
    tick(ms = 60_000) {
      clock = new Date(clock.getTime() + ms)
    },
    remove() {
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

export function makeFakeRunner() {
  const runner = {
    starts: [],
    prompts: [],
    closed: [],
    states: {},
    failStart: new Set(),
    failPrompt: new Set(),
    async start(agent) {
      if (runner.failStart.has(agent.role)) throw new Error(`the ${agent.role} did not start`)
      runner.starts.push(agent)
      return { role: agent.role }
    },
    async prompt(handle, text) {
      if (runner.failPrompt.has(handle.role)) throw new Error('agent_prompt_stalled')
      runner.prompts.push({ role: handle.role, text })
    },
    async activity(handle) {
      return runner.states[handle.role] ?? { state: 'idle' }
    },
    async close(handle) {
      runner.closed.push(handle.role)
    },
  }
  return runner
}

export function makeFakeGh() {
  const gh = {
    calls: [],
    prs: new Map(),
    comments: [],
    failures: [],
    async call(args, input) {
      gh.calls.push(args.join(' '))
      const failure = gh.failures.find((f) => f.match(args))
      if (failure !== undefined && !failure.lost) {
        gh.failures.splice(gh.failures.indexOf(failure), 1)
        return { code: 1, stdout: '', stderr: 'error connecting to api.github.com' }
      }
      const answer = gh.answer(args, input)
      if (failure !== undefined) {
        gh.failures.splice(gh.failures.indexOf(failure), 1)
        return { code: 1, stdout: '', stderr: 'error connecting to api.github.com' }
      }
      return answer
    },
    answer(args, input) {
      const [, verb, target] = args
      const byUrl = [...gh.prs.values()].find((pr) => pr.url === target)
      if (verb === 'view' && args.includes('url,state')) {
        const pr = gh.prs.get(target)
        return pr === undefined
          ? { code: 1, stdout: '', stderr: `no pull requests found for branch "${target}"` }
          : { code: 0, stdout: JSON.stringify({ url: pr.url, state: 'OPEN' }), stderr: '' }
      }
      if (verb === 'view' && args.includes('comments'))
        return {
          code: 0,
          stdout: JSON.stringify({ comments: gh.comments.filter((c) => c.url === target).map((c) => ({ body: c.body })) }),
          stderr: '',
        }
      if (verb === 'create') {
        const head = args[args.indexOf('--head') + 1]
        const url = `https://github.com/o/r/pull/${gh.prs.size + 1}`
        gh.prs.set(head, { url, title: args[args.indexOf('--title') + 1], body: input, labels: [] })
        return { code: 0, stdout: `${url}\n`, stderr: '' }
      }
      if (verb === 'edit') {
        byUrl.labels.push(args[args.indexOf('--add-label') + 1])
        return { code: 0, stdout: '', stderr: '' }
      }
      if (verb === 'comment') {
        gh.comments.push({ url: target, body: input })
        return { code: 0, stdout: '', stderr: '' }
      }
      return { code: 1, stdout: '', stderr: `the fake gh cannot ${args.join(' ')}` }
    },
  }
  return gh
}

export function logLines(world, n) {
  return readFileSync(join(world.home, 'tasks', String(n), 'log.ndjson'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

export const SPEC = 100

// A Ticket `n` of the Spec 100, built: the Spec is started and approved first, once.
export async function built(world, n, ...options) {
  if (!existsSync(join(world.home, 'tasks', String(SPEC)))) {
    world.spec(SPEC)
    await steps(world, ['start', String(SPEC)], ['set', String(SPEC), 'approved', '--as', 'reviewer'])
  }
  world.ticket(n, SPEC)
  await steps(world, ['build', String(n), ...options])
}

export async function steps(world, ...argvs) {
  for (const argv of argvs) {
    world.tick()
    const result = await run(argv, world.deps)
    assert.equal(result.code, 0, `${argv.join(' ')}: ${result.stderr}`)
  }
}
