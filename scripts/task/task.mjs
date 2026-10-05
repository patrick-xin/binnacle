/**
 * The task tool: one tool holds the state of a Build task.
 *
 * Each command is `run(argv, deps)`, which answers `{ code, stdout, stderr }`,
 * so a test drives the tool as a process would. The deps hold the world: the
 * home folder that holds `tasks/` and `worktrees/`, the repository's checkout,
 * the issue reader, the clock and the sleep. Run as a main, the tool builds
 * them from the environment.
 * @module binnacle/scripts/task/task
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, linkSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { alive, overlap, followers, OWNERS, readLog, readTask, standalone, tasksOf, writeJson } from './state.mjs'
import { watch } from './watch.mjs'

/** A refusal the caller can do something about: exit code 1. */
class Refusal extends Error {}

/** A usage error: exit code 2. */
class Usage extends Error {}

/**
 * Run git in the repository, and answer its stdout.
 * @param {string} repo - the repository's checkout.
 * @param {string[]} args - the arguments to pass git.
 * @returns {string} its stdout, without the trailing newline.
 */
function git(repo, args) {
  const done = spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
  if (done.status !== 0) throw new Refusal(`git ${args.join(' ')} failed: ${(done.stderr || done.stdout).trim()}`)
  return done.stdout.trim()
}

/** Counts the lock candidates of this process, so no two of its commands share one. */
let ticket = 0

/**
 * Run `body` as the one command that writes. The lock is a file that holds its
 * owner's process id: the pid is written to a temporary file and published with
 * `linkSync`, which fails when the lock exists, so a lock never appears without
 * its owner. A command that finds a lock waits for it while its process lives;
 * a lock whose process is gone makes it exit 1 naming the lock and the pid, and
 * the Lead removes the lock by hand, because a check of the owner and a
 * removal are two steps that another process can come between. A command
 * removes only the lock it holds, also when it gets SIGINT or SIGTERM.
 * @param {{ home: string, sleep: (ms: number) => Promise<void> }} deps - the home and the sleep.
 * @param {() => Promise<number> | number} body - the writing, answering the exit code.
 * @returns {Promise<number>} the exit code.
 */
async function locked(deps, body) {
  const tasks = join(deps.home, 'tasks')
  mkdirSync(tasks, { recursive: true })
  const lock = join(tasks, '.lock')
  const waiting = join(tasks, `.lock.${process.pid}.${++ticket}.tmp`)
  writeFileSync(waiting, String(process.pid))
  let holding = false
  const release = () => {
    try {
      if (readFileSync(lock, 'utf8').trim() === String(process.pid)) rmSync(lock)
    } catch {
      // Not ours, or already gone: leave it.
    }
  }
  const leave = (code) => () => {
    if (holding) release()
    if (standalone) process.exit(code)
  }
  const interrupt = leave(130)
  const terminate = leave(143)
  try {
    while (true) {
      try {
        linkSync(waiting, lock)
        holding = true
        break
      } catch (error) {
        if (error.code !== 'EEXIST') throw error
      }
      let owner
      try {
        owner = readFileSync(lock, 'utf8').trim()
      } catch (error) {
        if (error.code === 'ENOENT') continue
        throw error
      }
      if (!/^\d+$/.test(owner) || !alive(Number(owner)))
        throw new Refusal(`${lock}: its process ${owner} is gone; check it, then remove the lock by hand`)
      await deps.sleep(20)
    }
    process.on('SIGINT', interrupt)
    process.on('SIGTERM', terminate)
    return await body()
  } finally {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', terminate)
    rmSync(waiting, { force: true })
    if (holding) release()
  }
}

/**
 * Each path in backticks between `## Code shape` and the next `## ` heading of
 * an issue body.
 * @param {string} body - the issue body, as Markdown.
 * @returns {string[]} the paths, in the order the issue lists them.
 */
export function filesOfIssue(body) {
  const lines = body.split('\n')
  const heading = lines.findIndex((line) => line.trim() === '## Code shape')
  if (heading === -1) return []
  const paths = []
  for (const line of lines.slice(heading + 1)) {
    if (line.startsWith('## ')) break
    for (const span of line.matchAll(/`([^`]+)`/g)) paths.push(span[1])
  }
  return paths
}

/**
 * Check a path the way decision 8 of the task tool's spec says: relative to
 * the repository, and in its normal form.
 * @param {string} path - the path.
 * @returns {string} the path, when it is well formed.
 * @throws {Refusal} when the path is not relative, or not in normal form.
 */
function checkedPath(path) {
  if (path === '' || path === '.' || path === '..' || path.startsWith('/') || path.startsWith('./') || path.startsWith('../'))
    throw new Refusal(`${path}: not a path relative to the repository`)
  if (posix.normalize(path) !== path) throw new Refusal(`${path}: not in its normal form`)
  return path
}

/**
 * The paths an issue lists under `## Code shape`, checked.
 * @param {number} n - the issue number.
 * @param {string} body - the issue body, as Markdown.
 * @returns {string[]} the paths.
 * @throws {Refusal} when the issue lists no path, or a path that is not well formed.
 */
function filesFromIssue(n, body) {
  const paths = filesOfIssue(body).map(checkedPath)
  if (paths.length === 0) throw new Refusal(`issue ${n} lists no files under ## Code shape`)
  return paths
}

/**
 * Check that an argument is a task number, and answer it.
 * @param {string | undefined} text - the argument.
 * @returns {number} the task number.
 * @throws {Usage} when the argument is not a number.
 */
function number(text) {
  if (!/^\d+$/.test(text ?? '')) throw new Usage(`${text ?? 'nothing'}: not a task number`)
  return Number(text)
}

/**
 * Read the options the commands take after their fixed arguments.
 * @param {string[]} args - the options.
 * @returns {{ as: string, force: boolean }} the role a command acts as, and whether it forces.
 * @throws {Usage} when an option is not one the command takes.
 */
function parseOptions(args) {
  const read = { as: 'lead', force: false }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--as') {
      if (!['lead', 'implementer', 'reviewer'].includes(args[i + 1] ?? ''))
        throw new Usage(`--as takes lead, implementer or reviewer, not ${args[i + 1] ?? 'nothing'}`)
      read.as = args[i + 1]
      i += 1
    } else if (args[i] === '--force') read.force = true
    else throw new Usage(`${args[i]}: not an option this command takes`)
  }
  return read
}

/**
 * Run one command of the task tool.
 * @param {string[]} argv - the arguments after the command name.
 * @param {{ home: string, repo: string, readIssue: (n: number) => Promise<string>, now: () => Date, sleep: (ms: number) => Promise<void> }} deps - the world.
 * @param {(line: string) => void} say - prints a line of stdout.
 * @returns {Promise<number>} the exit code.
 */
async function command(argv, deps, say) {
  const [name, ...args] = argv
  switch (name) {
    case 'start': {
      const [nText, ...rest] = args
      if (rest.length > 0) throw new Usage('usage: task start <n>')
      return start(number(nText), deps, say)
    }
    case 'set': {
      const [nText, state, ...rest] = args
      if (state === undefined) throw new Usage('usage: task set <n> <state> [--as <role>]')
      return setState(number(nText), state, parseOptions(rest), deps, say)
    }
    case 'ask': {
      const [nText, ...rest] = args
      return ask(number(nText), parseOptions(rest), deps, say)
    }
    case 'answer': {
      const [nText, ...rest] = args
      if (rest.length > 0) throw new Usage('usage: task answer <n>')
      return answer(number(nText), deps, say)
    }
    case 'status': {
      if (args.length > 1) throw new Usage('usage: task status [<n>]')
      return status(deps, args.length === 1 ? number(args[0]) : undefined, say)
    }
    case 'stop': {
      const [nText, ...rest] = args
      return stop(number(nText), parseOptions(rest), deps, say)
    }
    case 'watch':
      if (args.length > 0) throw new Usage('usage: task watch')
      return watch(deps, say)
    default:
      throw new Usage(`usage: task <start|set|ask|answer|status|watch|stop> ...`)
  }
}

/**
 * Start a task: check what the spec checks, make the branch, the worktree and
 * the task folder, and set the state `spec` at round 0.
 * @param {number} n - the issue number.
 * @param {{ home: string, repo: string, readIssue: (n: number) => Promise<string>, now: () => Date }} deps - the world.
 * @param {(line: string) => void} say - prints a line of stdout.
 * @returns {Promise<number>} the exit code.
 */
async function start(n, deps, say) {
  const roles = JSON.parse(readFileSync(join(deps.repo, '.agents', 'roles.json'), 'utf8'))
  if (roles.implementer.family === roles.reviewer.family)
    throw new Refusal(`the implementer and the reviewer are of the same family ${roles.implementer.family}; change .agents/roles.json`)
  const files = filesFromIssue(n, await deps.readIssue(n))
  return locked(deps, async () => {
    const folder = join(deps.home, 'tasks', String(n))
    const worktree = join(deps.home, 'worktrees', String(n))
    const review = `${worktree}-review`
    for (const [what, path] of [
      ['task folder', folder],
      ['worktree', worktree],
      ['worktree', review],
    ])
      if (existsSync(path)) throw new Refusal(`task ${n}: the ${what} ${path} exists already`)
    const branch = `task/${n}`
    const probe = spawnSync('git', ['rev-parse', '--verify', '--quiet', branch], { cwd: deps.repo })
    if (probe.status === 0) throw new Refusal(`task ${n}: the branch ${branch} exists already`)
    for (const [m, task] of tasksOf(deps.home)) {
      if (task.state === 'stopped') continue
      for (const path of files)
        for (const held of task.files) if (overlap(path, held)) throw new Refusal(`${path} overlaps ${held} of running task ${m}`)
    }
    mkdirSync(join(deps.home, 'worktrees'), { recursive: true })
    try {
      git(deps.repo, ['fetch', 'origin', 'main'])
      git(deps.repo, ['worktree', 'add', '-b', branch, worktree, 'origin/main'])
      mkdirSync(folder, { recursive: true })
      writeJson(join(folder, 'task.json'), {
        n,
        branch,
        worktree,
        files,
        createdAt: deps.now().toISOString(),
      })
      appendLine(join(folder, 'log.ndjson'), { at: deps.now().toISOString(), role: 'lead', from: null, to: 'spec', round: 0 })
    } catch (error) {
      // The checks above proved that none of these existed, so each one that
      // is there now is this start's own doing.
      spawnSync('git', ['worktree', 'remove', '--force', worktree], { cwd: deps.repo })
      spawnSync('git', ['branch', '-D', branch], { cwd: deps.repo })
      rmSync(folder, { recursive: true, force: true })
      throw error
    }
    say(`task ${n}: spec round 0, worktree ${worktree}`)
    return 0
  })
}

/**
 * Append one JSON line to the log.
 * @param {string} log - the log's path.
 * @param {{ at: string, role: string, from: string | null, to: string, round: number }} change - the change of state.
 */
function appendLine(log, change) {
  writeFileSync(log, `${JSON.stringify(change)}\n`, { flag: 'a' })
}

/**
 * Set a state, as the table of states allows.
 * @param {number} n - the task number.
 * @param {string} state - the state to set.
 * @param {{ as: string }} read - the role the command acts as.
 * @param {{ home: string, repo: string, readIssue: (n: number) => Promise<string>, now: () => Date, sleep: (ms: number) => Promise<void> }} deps - the world.
 * @param {(line: string) => void} say - prints a line of stdout.
 * @returns {Promise<number>} the exit code.
 */
async function setState(n, state, read, deps, say) {
  if (state === 'blocked' || state === 'stopped')
    throw new Refusal(`task set cannot set ${state}; only task ${state === 'blocked' ? 'ask' : 'stop'} sets it`)
  if (!(state in OWNERS)) throw new Usage(`${state}: not a state`)
  return locked(deps, async () => {
    const folder = join(deps.home, 'tasks', String(n))
    const record = readTask(folder)
    const last = readLog(folder).at(-1)
    if (OWNERS[state] !== read.as) throw new Refusal(`the ${read.as} cannot set ${state}; the ${OWNERS[state]} sets it`)
    const can = followers(last.to, last.round)
    if (!can.includes(state)) throw new Refusal(refusal(n, state, last))
    if (state === 'spec') {
      record.files = await filesAgain(n, deps, folder)
      writeJson(join(folder, 'task.json'), record)
    }
    const round = state === 'ready' ? last.round + 1 : last.round
    appendLine(join(folder, 'log.ndjson'), {
      at: deps.now().toISOString(),
      role: read.as,
      from: last.to,
      to: state,
      round,
    })
    say(`task ${n}: ${state} round ${round}`)
    return 0
  })
}

/**
 * Read a task's files from its issue again, for the Lead's new round of the
 * spec, and check them against each other running task.
 * @param {number} n - the task number.
 * @param {{ home: string, repo: string, readIssue: (n: number) => Promise<string> }} deps - the world.
 * @param {string} folder - the task's folder.
 * @returns {Promise<string[]>} the new files.
 * @throws {Refusal} when the new files overlap a running task; the task keeps its files and state from before.
 */
async function filesAgain(n, deps, folder) {
  const files = filesFromIssue(n, await deps.readIssue(n))
  const others = tasksOf(deps.home)
  for (const [m, other] of others) {
    if (other.folder === folder || other.state === 'stopped') continue
    for (const path of files)
      for (const held of other.files) if (overlap(path, held)) throw new Refusal(`${path} overlaps ${held} of running task ${m}`)
  }
  return files
}

/**
 * Say why a state cannot follow the current one, naming the states that can.
 * @param {number} n - the task number.
 * @param {string} state - the state that was asked for.
 * @param {{ to: string, round: number }} last - the last line of the log.
 * @returns {string} the refusal.
 */
function refusal(n, state, last) {
  const can = followers(last.to, last.round)
  const after =
    last.to === 'blocked'
      ? 'task answer sets the state from before blocked'
      : last.to === 'stopped'
        ? 'nothing follows stopped'
        : can.length === 0
          ? 'nothing can follow it'
          : `${can.join(', ')} can follow it`
  return `task ${n}: ${state} cannot follow ${last.to}; ${after}`
}
/**
 * Ask: set `blocked`, after the role wrote its question.
 * @param {number} n - the task number.
 * @param {{ as: string }} read - the role the command acts as.
 * @param {{ home: string, now: () => Date, sleep: (ms: number) => Promise<void> }} deps - the world.
 * @param {(line: string) => void} say - prints a line of stdout.
 * @returns {Promise<number>} the exit code.
 */
async function ask(n, read, deps, say) {
  return locked(deps, async () => {
    const folder = join(deps.home, 'tasks', String(n))
    readTask(folder)
    const last = readLog(folder).at(-1)
    if (last.to === 'blocked' || last.to === 'stopped') throw new Refusal(refusal(n, 'blocked', last))
    if (!existsSync(join(folder, 'question.md'))) throw new Refusal(`no question.md in ${folder}; write it first`)
    appendLine(join(folder, 'log.ndjson'), {
      at: deps.now().toISOString(),
      role: read.as,
      from: last.to,
      to: 'blocked',
      round: last.round,
    })
    say(`task ${n}: blocked round ${last.round}`)
    return 0
  })
}

/**
 * Answer: set the state from before `blocked` again, at the same round, after
 * the Lead wrote its answer. The question and the answer are kept, numbered
 * by how many questions the task has asked.
 * @param {number} n - the task number.
 * @param {{ home: string, now: () => Date, sleep: (ms: number) => Promise<void> }} deps - the world.
 * @param {(line: string) => void} say - prints a line of stdout.
 * @returns {Promise<number>} the exit code.
 */
async function answer(n, deps, say) {
  return locked(deps, async () => {
    const folder = join(deps.home, 'tasks', String(n))
    readTask(folder)
    const last = readLog(folder).at(-1)
    if (last.to !== 'blocked') throw new Refusal(`task ${n} is ${last.to}, not blocked`)
    if (!existsSync(join(folder, 'answer.md'))) throw new Refusal(`no answer.md in ${folder}; write it first`)
    const k = readdirSync(folder).filter((file) => /^question-\d+\.md$/.test(file)).length + 1
    renameSync(join(folder, 'question.md'), join(folder, `question-${k}.md`))
    renameSync(join(folder, 'answer.md'), join(folder, `answer-${k}.md`))
    appendLine(join(folder, 'log.ndjson'), {
      at: deps.now().toISOString(),
      role: 'lead',
      from: 'blocked',
      to: last.from,
      round: last.round,
    })
    say(`task ${n}: ${last.from} round ${last.round}; the answer is answer-${k}.md`)
    return 0
  })
}

/**
 * Show each task, its state, its round, and the time since its last change.
 * @param {{ home: string, now: () => Date }} deps - the world.
 * @param {number | undefined} n - the one task to show, or each of them.
 * @param {(line: string) => void} say - prints a line of stdout.
 * @returns {number} the exit code.
 */
function status(deps, n, say) {
  const tasks = [...tasksOf(deps.home).values()]
  const shown = n === undefined ? tasks : tasks.filter((task) => task.n === n)
  if (n !== undefined && shown.length === 0) throw new Refusal(`no task ${n}`)
  for (const task of shown) {
    const last = task.lines.at(-1)
    say(`${task.n} ${task.state} round ${task.round} (${since(new Date(last.at), deps.now())} ago)`)
  }
  return 0
}

/**
 * The time between two dates, in the largest two of days, hours, minutes and
 * seconds that fit.
 * @param {Date} from - the earlier date.
 * @param {Date} to - the later date.
 * @returns {string} the time, such as `2h2m`.
 */
function since(from, to) {
  let seconds = Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000))
  const parts = []
  for (const [name, size] of [
    ['d', 86_400],
    ['h', 3_600],
    ['m', 60],
  ]) {
    const count = Math.floor(seconds / size)
    seconds %= size
    if (count > 0) parts.push(`${count}${name}`)
  }
  if (parts.length === 0) return `${seconds}s`
  return parts.slice(0, 2).join('')
}

/**
 * Stop a task: remove its worktrees and its branch, then set `stopped`. The
 * task folder stays as the record. Each step that finds nothing to remove is
 * already done, so a stop that failed part of the way can run again.
 * `stopped` is logged only after each step is done.
 * @param {number} n - the task number.
 * @param {{ force: boolean }} read - whether uncommitted work and an unmerged branch go too.
 * @param {{ home: string, repo: string, now: () => Date, sleep: (ms: number) => Promise<void> }} deps - the world.
 * @param {(line: string) => void} say - prints a line of stdout.
 * @returns {Promise<number>} the exit code.
 */
async function stop(n, read, deps, say) {
  if (read.as !== 'lead') throw new Refusal(`the ${read.as} cannot stop a task; the lead stops it`)
  return locked(deps, async () => {
    const folder = join(deps.home, 'tasks', String(n))
    readTask(folder)
    const last = readLog(folder).at(-1)
    if (last.to === 'stopped') {
      say(`task ${n}: stopped already`)
      return 0
    }
    const branch = `task/${n}`
    for (const path of [join(deps.home, 'worktrees', String(n)), join(deps.home, 'worktrees', `${n}-review`)]) {
      if (existsSync(path)) {
        const done = spawnSync('git', ['worktree', 'remove', ...(read.force ? ['--force'] : []), path], {
          cwd: deps.repo,
          encoding: 'utf8',
        })
        if (done.status !== 0) throw new Refusal(`cannot remove the worktree ${path}: ${(done.stderr || done.stdout).trim()}`)
      } else {
        // A folder that is gone can leave its record in git; prune clears it.
        spawnSync('git', ['worktree', 'prune'], { cwd: deps.repo })
      }
    }
    const probe = spawnSync('git', ['rev-parse', '--verify', '--quiet', branch], { cwd: deps.repo })
    if (probe.status === 0) {
      if (!read.force) {
        const mergedIntoMain = spawnSync('git', ['merge-base', '--is-ancestor', branch, 'origin/main'], {
          cwd: deps.repo,
        })
        if (mergedIntoMain.status !== 0)
          throw new Refusal(`the branch ${branch} is not merged into origin/main; pass --force to remove it anyway`)
      }
      git(deps.repo, ['branch', '-D', branch])
    }
    appendLine(join(folder, 'log.ndjson'), {
      at: deps.now().toISOString(),
      role: 'lead',
      from: last.to,
      to: 'stopped',
      round: last.round,
    })
    say(`task ${n}: stopped round ${last.round}`)
    return 0
  })
}

/**
 * Run the task tool.
 * @param {string[]} argv - the arguments after the command name.
 * @param {{ home: string, repo: string, readIssue: (n: number) => Promise<string>, now: () => Date, sleep: (ms: number) => Promise<void> }} deps - the world.
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>} the exit code and the output.
 */
export async function run(argv, deps) {
  const out = []
  const err = []
  let code
  try {
    code = await command(argv, deps, (line) => out.push(line))
  } catch (error) {
    code = typeof error.exitCode === 'number' ? error.exitCode : error instanceof Usage ? 2 : 1
    err.push(error.message)
  }
  return { code, stdout: out.length === 0 ? '' : `${out.join('\n')}\n`, stderr: err.length === 0 ? '' : `${err.join('\n')}\n` }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const deps = {
    home: process.env.BINNACLE_HOME ?? join(homedir(), '.binnacle'),
    repo: join(dirname(fileURLToPath(import.meta.url)), '..', '..'),
    readIssue(n) {
      try {
        return Promise.resolve(execFileSync('gh', ['issue', 'view', String(n), '--json', 'body', '--jq', '.body'], { encoding: 'utf8' }))
      } catch (error) {
        return Promise.reject(new Error(`cannot read issue ${n}: ${error.stderr?.trim() ?? error.message}`))
      }
    },
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }
  const done = await run(process.argv.slice(2), deps)
  process.stdout.write(done.stdout)
  process.stderr.write(done.stderr)
  process.exitCode = done.code
}
