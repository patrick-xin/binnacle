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
 *   runner: ReturnType<typeof makeFakeRunner>,
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
      processes: async () => [],
    },
    runner,
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
