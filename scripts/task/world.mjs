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
  writeFileSync(join(repo, '.agents', 'roles.json'), JSON.stringify({ implementer: { family: 'zai' }, reviewer: { family: 'openai' } }))
  writeFileSync(join(repo, 'README.md'), 'one\n')
  execFileSync('git', ['add', '.agents/roles.json', 'README.md'], { cwd: repo })
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repo, stdio: 'ignore' })
  execFileSync('git', ['push', '-u', 'origin', 'main'], { cwd: repo, stdio: 'ignore' })

  const issues = new Map()
  let clock = new Date('2026-10-05T10:00:00.000Z')
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
      sleep: async () => {},
    },
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
