// The deps hold the world: home, checkout, issue reader, clock and sleep. So a test drives the tool as a process would.
import { execFile, execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handoffFor } from './handoffs.mjs'
import { doorOf, marker, partsOf, prBody, reportComment, reportsOf } from './land.mjs'
import { locked } from './lock.mjs'
import { makeHeadless } from './runners/headless.mjs'
import { makeHerdr } from './runners/herdr.mjs'
import { toolOf } from './runners/tools.mjs'
import {
  appendEvent,
  followers,
  OWNERS,
  overlap,
  readAgents,
  readEvents,
  readLog,
  readTask,
  readTasks,
  tasksOf,
  writeJson,
} from './state.mjs'
import { lastRecord, watch } from './watch.mjs'

class Refusal extends Error {}

class Usage extends Error {}

class HandoffFailed extends Error {
  constructor(message) {
    super(message)
    this.exitCode = 3
  }
}

const ROLES = ['lead', 'implementer', 'reviewer']

function git(repo, args) {
  const done = spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
  if (done.status !== 0) throw new Refusal(`git ${args.join(' ')} failed: ${(done.stderr || done.stdout).trim()}`)
  return done.stdout.trim()
}

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

function checkedPath(path) {
  if (path === '' || path === '.' || path === '..' || path.startsWith('/') || path.startsWith('./') || path.startsWith('../'))
    throw new Refusal(`${path}: not a path relative to the repository`)
  if (posix.normalize(path) !== path) throw new Refusal(`${path}: not in its normal form`)
  return path
}

function filesFromIssue(n, body) {
  const paths = filesOfIssue(body).map(checkedPath)
  if (paths.length === 0) throw new Refusal(`issue ${n} lists no files under ## Code shape`)
  return paths
}

function number(text) {
  if (!/^\d+$/.test(text ?? '')) throw new Usage(`${text ?? 'nothing'}: not a task number`)
  return Number(text)
}

function parseOptions(args, env = {}) {
  const read = { as: env.BINNACLE_ROLE ?? 'lead', force: false }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--as') {
      if (!ROLES.includes(args[i + 1] ?? '')) throw new Usage(`--as takes lead, implementer or reviewer, not ${args[i + 1] ?? 'nothing'}`)
      if (env.BINNACLE_ROLE !== undefined && env.BINNACLE_ROLE !== args[i + 1])
        throw new Refusal(`--as ${args[i + 1]} differs from BINNACLE_ROLE ${env.BINNACLE_ROLE}`)
      read.as = args[i + 1]
      i += 1
    } else if (args[i] === '--force') read.force = true
    else throw new Usage(`${args[i]}: not an option this command takes`)
  }
  return read
}

async function command(argv, deps, say) {
  const [name, ...rest] = argv
  const env = deps.env ?? {}
  // An agent's environment names its task, so its commands can leave it out.
  const args =
    name !== 'watch' && !/^\d+$/.test(rest[0] ?? '') && env.BINNACLE_TASK !== undefined && name !== 'status'
      ? [env.BINNACLE_TASK, ...rest]
      : rest
  switch (name) {
    case 'start': {
      const [nText, ...more] = args
      if (more.length > 0) throw new Usage('usage: task start <n>')
      return start(number(nText), deps, say)
    }
    case 'build': {
      const [nText, ...more] = args
      const byLead = more.length === 2 && more[0] === '--by' && more[1] === 'lead'
      if (more.length > 0 && !byLead) throw new Usage('usage: task build <n> [--by lead]')
      return build(number(nText), byLead, deps, say)
    }
    case 'land': {
      const [nText, ...more] = args
      if (more.length > 0) throw new Usage('usage: task land <n>')
      return land(number(nText), deps, say)
    }
    case 'set': {
      const [nText, state, ...more] = args
      if (state === undefined) throw new Usage('usage: task set <n> <state> [--as <role>]')
      return setState(number(nText), state, parseOptions(more, env), deps, say)
    }
    case 'ask': {
      const [nText, ...more] = args
      return ask(number(nText), parseOptions(more, env), deps, say)
    }
    case 'answer': {
      const [nText, ...more] = args
      if (more.length > 0) throw new Usage('usage: task answer <n>')
      return answer(number(nText), deps, say)
    }
    case 'resend': {
      const [nText, ...more] = args
      if (more.length > 0) throw new Usage('usage: task resend <n>')
      return resend(number(nText), deps, say)
    }
    case 'status': {
      if (args.length > 1) throw new Usage('usage: task status [<n>]')
      const n = args.length === 1 ? number(args[0]) : env.BINNACLE_TASK === undefined ? undefined : number(env.BINNACLE_TASK)
      return status(deps, n, say)
    }
    case 'stop': {
      const [nText, ...more] = args
      return stop(number(nText), parseOptions(more, env), deps, say)
    }
    case 'watch':
      if (args.length > 0) throw new Usage('usage: task watch')
      return watch(deps, say)
    default:
      throw new Usage(`usage: task <start|build|set|ask|answer|resend|status|watch|land|stop> ...`)
  }
}

async function start(n, deps, say) {
  const roles = readRoles(deps)
  if (roles.implementer.family === roles.reviewer.family)
    throw new Refusal(`the implementer and the reviewer are of the same family ${roles.implementer.family}; change .agents/roles.json`)
  for (const role of ['implementer', 'reviewer']) toolOf(role, roles[role])
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
      git(deps.repo, ['worktree', 'add', '--detach', review, 'origin/main'])
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
      spawnSync('git', ['worktree', 'remove', '--force', review], { cwd: deps.repo })
      spawnSync('git', ['branch', '-D', branch], { cwd: deps.repo })
      rmSync(folder, { recursive: true, force: true })
      throw error
    }
    say(`task ${n}: spec round 0, worktree ${worktree}`)
    await deliver(n, folder, handoffFor({ kind: 'start' }, context(n, folder, deps)), deps)
    return 0
  })
}

function readRoles(deps) {
  return JSON.parse(readFileSync(join(deps.repo, '.agents', 'roles.json'), 'utf8'))
}

function context(n, folder, deps) {
  const lines = readLog(folder)
  const last = lines.at(-1)
  return {
    n,
    repo: deps.repo,
    folder,
    worktree: join(deps.home, 'worktrees', String(n)),
    review: join(deps.home, 'worktrees', `${n}-review`),
    round: last.round,
    pass: lines.filter((line) => line.to === 'spec' && line.round === 0).length,
  }
}

async function deliver(n, folder, handoff, deps, extra = {}) {
  if (handoff === undefined) return
  const id = `h${readEvents(folder).filter((event) => event.event === 'handoff').length + 1}`
  appendEvent(folder, {
    at: deps.now().toISOString(),
    event: 'handoff',
    role: handoff.role,
    detail: { id, start: handoff.start, text: handoff.text, ...extra },
  })
  await tryHandoff(n, folder, id, handoff, deps, extra)
}

async function tryHandoff(n, folder, id, handoff, deps, extra) {
  const event = (name, detail) =>
    appendEvent(folder, { at: deps.now().toISOString(), event: name, role: handoff.role, detail: { id, ...detail } })
  try {
    const agents = readAgents(folder)
    let agent = agents[handoff.role]
    // The Lead takes this role: the prompt wakes the Lead, and starts no agent.
    if (agent?.runner === 'lead') {
      // A hand-off that the Lead's own command made does not wake the Lead.
      event('for-lead', { text: handoff.text, ...(extra.quiet ? { quiet: true } : {}) })
      return
    }
    let state = agent === undefined ? 'gone' : (await runnerOf(agent.runner, deps).activity(agent.handle)).state
    if (state === 'unknown') throw new Error(`the ${handoff.role}'s state is unknown; look at it before you resend`)
    if (state === 'gone') {
      const setting = readRoles(deps)[handoff.role]
      const tool = setting?.tool
      toolOf(handoff.role, { tool })
      const runner = runnerOf(setting.runner, deps)
      const sessionDir = join(folder, 'agents', handoff.role, 'sessions')
      const handle = await runner.start({
        n,
        role: handoff.role,
        tool,
        model: setting.model,
        ...(setting.thinking === undefined ? {} : { thinking: setting.thinking }),
        cwd: join(deps.home, 'worktrees', handoff.role === 'reviewer' ? `${n}-review` : String(n)),
        sessionDir,
        env: { BINNACLE_TASK: String(n), BINNACLE_ROLE: handoff.role },
      })
      agent = {
        role: handoff.role,
        runner: setting.runner,
        tool,
        model: setting.model,
        thinking: setting.thinking,
        handle,
        startedAt: deps.now().toISOString(),
      }
      writeJson(join(folder, 'agents.json'), { ...agents, [handoff.role]: agent })
      event('started', { runner: setting.runner })
    }
    await runnerOf(agent.runner, deps).prompt(agent.handle, handoff.text, (tried, code) => event('resent', { try: tried, code }))
    event('prompted', extra)
  } catch (error) {
    event('handoff-failed', { error: error.message })
    throw new HandoffFailed(`task ${n}: the hand-off ${id} to the ${handoff.role} failed: ${error.message}; run task resend ${n}`)
  }
}

function runnerOf(name, deps) {
  const runner = deps.runners?.[name]
  if (runner === undefined) throw new Error(`no runner ${name ?? '(none)'}; the runners are ${Object.keys(deps.runners ?? {}).join(', ')}`)
  return runner
}

async function build(n, byLead, deps, say) {
  return locked(deps, async () => {
    const folder = join(deps.home, 'tasks', String(n))
    readTask(folder)
    const last = readLog(folder).at(-1)
    if (last.to !== 'approved' || last.round !== 0)
      throw new Refusal(`task ${n} is ${last.to} at round ${last.round}; task build follows approved at round 0`)
    const agents = readAgents(folder)
    if (agents.implementer !== undefined) throw new Refusal(`task ${n} has an implementer already; run task resend ${n}`)
    if (byLead) {
      const roles = readRoles(deps)
      if (roles.lead?.family === roles.reviewer?.family)
        throw new Refusal(
          `the lead and the reviewer are of the same family ${roles.reviewer?.family}; the Lead cannot build a task that this Reviewer reviews`,
        )
      writeJson(join(folder, 'agents.json'), {
        ...agents,
        implementer: { role: 'implementer', runner: 'lead', startedAt: deps.now().toISOString() },
      })
    }
    const base = git(deps.repo, ['rev-parse', 'origin/main'])
    say(`task ${n}: the ${byLead ? 'Lead' : 'implementer'} builds from ${base.slice(0, 7)}`)
    await deliver(n, folder, handoffFor({ kind: 'build' }, context(n, folder, deps)), deps, byLead ? { base, quiet: true } : { base })
    return 0
  })
}

async function land(n, deps, say) {
  return locked(deps, async () => {
    const folder = join(deps.home, 'tasks', String(n))
    readTask(folder)
    const events = readEvents(folder)
    const landed = events.find((event) => event.event === 'landed')
    if (landed !== undefined) throw new Refusal(`task ${n} has landed already: ${landed.detail.url}`)
    const last = readLog(folder).at(-1)
    if (last.to !== 'approved' || last.round === 0)
      throw new Refusal(`task ${n} is ${last.to} at round ${last.round}; task land follows approved after round 0`)
    const messagePath = join(folder, 'message.md')
    if (!existsSync(messagePath)) throw new Refusal(`no message.md in ${folder}`)
    const message = readFileSync(messagePath, 'utf8')
    const { header } = partsOf(message)
    if (header === '') throw new Refusal(`${messagePath}: its first line, the header, is empty`)
    if (!existsSync(join(folder, 'checked.md'))) throw new Refusal(`no checked.md in ${folder}`)
    const reports = reportsOf(readdirSync(folder))
    if (!reports.some((file) => !file.startsWith('review-0'))) throw new Refusal(`no review report of a round after round 0 in ${folder}`)
    const spec = await deps.readIssue(n)
    const door = doorOf(spec)
    if (door === undefined) throw new Refusal(`issue ${n}: the first word under ## Door is not One-way or Two-way`)
    const worktree = join(deps.home, 'worktrees', String(n))
    if (git(worktree, ['status', '--porcelain']) !== '') throw new Refusal(`${worktree} has changes that are not committed`)
    git(worktree, ['fetch', 'origin', 'main'])
    if (spawnSync('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD'], { cwd: worktree }).status !== 0)
      throw new Refusal(`task/${n} does not hold origin/main; merge or rebase it first`)

    const step = async (name, body) => {
      try {
        return await body()
      } catch (error) {
        throw new Refusal(`task ${n}: land stopped at ${name}: ${error.message}; run task land ${n} again`)
      }
    }
    const event = (name, detail) => appendEvent(folder, { at: deps.now().toISOString(), event: name, role: 'lead', detail })

    await step('the squash', () => {
      const one = git(worktree, ['rev-list', '--count', 'origin/main..HEAD']) === '1'
      // Compare with the message as Git keeps it: the commit below cleans it
      // with `--cleanup=whitespace`, as `git stripspace` does.
      const kept = spawnSync('git', ['stripspace'], { cwd: worktree, input: message, encoding: 'utf8' }).stdout.trim()
      if (one && git(worktree, ['log', '-1', '--format=%B']).trim() === kept) return
      const before = git(worktree, ['rev-parse', 'HEAD'])
      git(worktree, ['reset', '--soft', 'origin/main'])
      // The cleanup is named, not taken from Git's settings, so that it is the one the check above undoes.
      const done = spawnSync('git', ['commit', '--cleanup=whitespace', '-F', messagePath], { cwd: worktree, encoding: 'utf8' })
      if (done.status !== 0) {
        // Put the branch back, so the worktree is clean for the next run.
        git(worktree, ['reset', '--soft', before])
        throw new Error((done.stderr || done.stdout).trim())
      }
    })
    await step('the push', () => git(worktree, ['push', '--force-with-lease', 'origin', `task/${n}`]))
    const url = await step('the PR', async () => {
      const open = await deps.gh(['pr', 'view', `task/${n}`, '--json', 'url,state'])
      if (open.code === 0) {
        const pr = JSON.parse(open.stdout)
        if (pr.state === 'OPEN') return pr.url
      }
      const checked = readFileSync(join(folder, 'checked.md'), 'utf8')
      const made = await deps.gh(
        ['pr', 'create', '--base', 'main', '--head', `task/${n}`, '--title', header, '--body-file', '-'],
        prBody({ n, message, spec, checked, reports }),
      )
      if (made.code !== 0) throw new Error(made.stderr.trim())
      const address = made.stdout.trim().split('\n').at(-1)
      event('pr', { url: address })
      return address
    })
    if (door === 'one-way')
      await step('the label', async () => {
        const labelled = await deps.gh(['pr', 'edit', url, '--add-label', 'one-way'])
        if (labelled.code !== 0) throw new Error(labelled.stderr.trim())
      })
    await step('the reports', async () => {
      // GitHub is the record of what was posted: a comment that GitHub took,
      // but whose answer was lost, is found here and not posted twice.
      const read = await deps.gh(['pr', 'view', url, '--json', 'comments'])
      if (read.code !== 0) throw new Error(read.stderr.trim())
      const posted = JSON.parse(read.stdout).comments.map((comment) => comment.body)
      for (const file of reports) {
        if (posted.some((body) => body.startsWith(marker(file)))) continue
        const sent = await deps.gh(
          ['pr', 'comment', url, '--body-file', '-'],
          reportComment(file, readFileSync(join(folder, file), 'utf8')),
        )
        if (sent.code !== 0) throw new Error(sent.stderr.trim())
      }
    })
    event('landed', { url })
    say(`task ${n}: landed ${url}${door === 'one-way' ? ' (one-way)' : ''}`)
    return 0
  })
}

async function resend(n, deps, say) {
  return locked(deps, async () => {
    const folder = join(deps.home, 'tasks', String(n))
    readTask(folder)
    const events = readEvents(folder)
    const landed = new Set(events.filter((event) => ['prompted', 'for-lead'].includes(event.event)).map((event) => event.detail.id))
    const open = events.findLast((event) => event.event === 'handoff' && !landed.has(event.detail.id))
    if (open === undefined) throw new Refusal(`task ${n} has no hand-off to resend`)
    const { id, start: starts, text, ...extra } = open.detail
    say(`task ${n}: resend ${id} to the ${open.role}`)
    await tryHandoff(n, folder, id, { role: open.role, start: starts, text }, deps, extra)
    return 0
  })
}

function appendLine(log, change) {
  writeFileSync(log, `${JSON.stringify(change)}\n`, { flag: 'a' })
}

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
    const c = context(n, folder, deps)
    if (state === 'ready') {
      c.tip = git(join(deps.home, 'worktrees', String(n)), ['rev-parse', 'HEAD'])
      c.base = lastTip(folder) ?? c.tip
    }
    await deliver(n, folder, handoffFor({ kind: 'set', to: state }, c), deps, state === 'ready' ? { tip: c.tip } : {})
    return 0
  })
}

function lastTip(folder) {
  const marks = readEvents(folder).filter((event) => event.event === 'handoff' && (event.detail.tip ?? event.detail.base) !== undefined)
  const last = marks.at(-1)
  return last?.detail.tip ?? last?.detail.base
}

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
    if (last.role !== 'lead') await deliver(n, folder, handoffFor({ kind: 'answer' }, { ...context(n, folder, deps), k }, last.role), deps)
    return 0
  })
}

async function status(deps, n, say) {
  const { tasks, unreadable } = readTasks(deps.home)
  if (n !== undefined) {
    const bad = unreadable.find((folder) => folder.n === n)
    if (bad !== undefined) throw new Refusal(`${n} unreadable: ${bad.reason}`)
    if (!tasks.has(n)) throw new Refusal(`no task ${n}`)
  }
  const rows = [
    ...[...tasks.values()].map((task) => ({ n: task.n, task })),
    ...unreadable.map((folder) => ({ n: folder.n, reason: folder.reason })),
  ]
    .filter((row) => n === undefined || row.n === n)
    .toSorted((a, b) => a.n - b.n)
  for (const row of rows) {
    if (row.task === undefined) {
      say(`${row.n} unreadable: ${row.reason}`)
      continue
    }
    const { task } = row
    // Each file of the task is read before its first line, so a task that
    // cannot be read shows as one line, as a folder does.
    let events
    let agents
    try {
      events = readEvents(task.folder)
      agents = Object.values(readAgents(task.folder))
    } catch (error) {
      if (n !== undefined) throw new Refusal(`${task.n} unreadable: ${error.message}`)
      say(`${task.n} unreadable: ${error.message}`)
      continue
    }
    say(`${task.n} ${task.state} round ${task.round} (${since(new Date(task.lines.at(-1).at), deps.now())} ago)`)
    for (const agent of agents) {
      if (agent.runner === 'lead') {
        say(`  ${agent.role} lead`)
        continue
      }
      let state
      try {
        state = (await runnerOf(agent.runner, deps).activity(agent.handle)).state
      } catch (error) {
        say(`  ${agent.role} ${agent.runner} error: ${error.message}`)
        continue
      }
      const record = lastRecord(task.folder, agent, events)
      say(`  ${agent.role} ${agent.runner} ${state}, last session record ${since(record, deps.now())} ago`)
    }
  }
  return 0
}

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
    for (const agent of Object.values(readAgents(folder))) {
      if (agent.runner === 'lead') continue
      await runnerOf(agent.runner, deps).close(agent.handle)
      appendEvent(folder, { at: deps.now().toISOString(), event: 'closed', role: agent.role })
    }
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

function exec(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) =>
      resolve({
        code: error === null ? 0 : typeof error.code === 'number' ? error.code : 1,
        stdout,
        stderr: stderr || (error?.message ?? ''),
      }),
    )
  })
}

async function processes() {
  const done = await exec('ps', ['-axo', 'pid=,ppid=,time=,command='])
  return done.stdout
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/))
    .filter((match) => match !== null)
    .map(([, pid, ppid, time, line]) => ({ pid: Number(pid), ppid: Number(ppid), command: line, cpuSeconds: cpuSeconds(time) }))
}

export function cpuSeconds(time) {
  const [days, clock] = time.includes('-') ? time.split('-') : ['0', time]
  return Number(days) * 86_400 + clock.split(':').reduce((sum, part) => sum * 60 + Number(part), 0)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const home = process.env.BINNACLE_HOME ?? join(homedir(), '.binnacle')
  const deps = {
    home,
    repo: join(dirname(fileURLToPath(import.meta.url)), '..', '..'),
    env: process.env,
    readIssue(n) {
      try {
        return Promise.resolve(execFileSync('gh', ['issue', 'view', String(n), '--json', 'body', '--jq', '.body'], { encoding: 'utf8' }))
      } catch (error) {
        return Promise.reject(new Error(`cannot read issue ${n}: ${error.stderr?.trim() ?? error.message}`))
      }
    },
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    processes,
    runners: {
      herdr: makeHerdr({ exec }),
      headless: makeHeadless({
        home,
        spawnSupervisor(script, dir) {
          spawn(process.execPath, [script, dir], { detached: true, stdio: 'ignore' }).unref()
        },
        kill(pid, signal) {
          try {
            process.kill(pid, signal)
          } catch {
            // Gone already.
          }
        },
        now: () => new Date(),
      }),
    },
  }
  deps.gh = (args, input) =>
    new Promise((resolve) => {
      const child = spawn('gh', args, { stdio: ['pipe', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (data) => (stdout += data))
      child.stderr.on('data', (data) => (stderr += data))
      child.on('error', (error) => resolve({ code: 127, stdout, stderr: error.message }))
      child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
      child.stdin.end(input ?? '')
    })
  const done = await run(process.argv.slice(2), deps)
  process.stdout.write(done.stdout)
  process.stderr.write(done.stderr)
  process.exitCode = done.code
}
