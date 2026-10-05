/**
 * The world that a task-tool test runs in: a temporary home folder, a
 * repository with a bare `origin`, and a fake issue reader.
 *
 * The tests never touch the real home or the real repository: each one makes
 * its own, and removes it when it ends. The clock stands still until a test
 * moves it, so a line's time and a task's age are literals.
 * @module binnacle/scripts/task/world
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Run git in a folder, and answer its stdout.
 * @param {string} cwd - the folder to run it in.
 * @param {string[]} args - the arguments to pass it.
 * @returns {string} its stdout, without the trailing newline.
 */
export function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

/**
 * Make the world of one test: an empty home, a repository whose `origin` is
 * bare and holds one commit on `main`, and deps whose issue bodies and clock
 * the test sets by hand.
 * @returns {{
 *   dir: string, home: string, repo: string,
 *   deps: { home: string, repo: string, readIssue: (n: number) => Promise<string>, now: () => Date, sleep: (ms: number) => Promise<void> },
 *   runner: ReturnType<typeof makeFakeRunner>, gh: ReturnType<typeof makeFakeGh>,
 *   setIssue(n: number, body: string): void, shape(...paths: string[]): string, tick(ms?: number): void, remove(): void
 * }} the world.
 */
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
      implementer: { tool: 'pi', model: 'zai/glm-5.3', family: 'zai', thinking: 'max', runner: 'fake' },
      reviewer: { tool: 'pi', model: 'openai-codex/gpt-6.1-sol', family: 'openai', thinking: 'medium', runner: 'fake' },
    }),
  )
  writeFileSync(join(repo, 'README.md'), 'one\n')
  execFileSync('git', ['add', '.agents/roles.json', 'README.md'], { cwd: repo })
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repo, stdio: 'ignore' })
  execFileSync('git', ['push', '-u', 'origin', 'main'], { cwd: repo, stdio: 'ignore' })

  const issues = new Map()
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
      runners: { fake: runner },
      gh: (args, input) => gh.call(args, input),
      processes: async () => [],
    },
    runner,
    gh,
    setIssue(n, body) {
      issues.set(String(n), body)
    },
    shape(...paths) {
      return `## Intent\n\nSome work.\n\n## Code shape\n\n${paths.map((path) => `- \`${path}\`\n`).join('')}\n## Records\n\n- none.\n`
    },
    tick(ms = 60_000) {
      clock = new Date(clock.getTime() + ms)
    },
    remove() {
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

/**
 * A runner that starts nothing. It records each start, prompt and close, and
 * answers each `activity` with the state a test sets for a role. A test can
 * make a start or a prompt fail.
 * @returns {{
 *   starts: object[], prompts: { role: string, text: string }[], closed: string[],
 *   states: Record<string, { state: string, root?: number }>, failStart: Set<string>, failPrompt: Set<string>,
 *   start(agent: object): Promise<object>, prompt(handle: object, text: string, onRetry?: Function): Promise<void>,
 *   activity(handle: object): Promise<object>, close(handle: object): Promise<void>
 * }} the runner.
 */
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

/**
 * A `gh` that keeps its PRs and comments in memory. A test can make the next
 * call that matches fail, before it does anything (`lost: false`), or after
 * GitHub took it but its answer was lost (`lost: true`).
 * @returns {{
 *   calls: string[], prs: Map<string, { url: string, title: string, body: string, labels: string[] }>, comments: { url: string, body: string }[],
 *   failures: { match: (args: string[]) => boolean, lost: boolean }[],
 *   call(args: string[], input?: string): Promise<{ code: number, stdout: string, stderr: string }>
 * }} the fake.
 */
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
