/**
 * Reports this surface's agent lifecycle to the herdr pane that launched it.
 *
 * Copied from the Maintainer's `dsh-tui` profile. `pnpm try` puts it in the
 * `binnacle-try` profile, so a driver waits on the pane's state, as
 * `.agents/try.md` says.
 *
 * herdr tracks a pane's agent through a custom integration: a process claims
 * lifecycle authority over its own pane with `herdr pane report-agent` and
 * gives it back with `release-agent`, so no herdr release is needed to teach
 * it the `dsh` label. Both are addressed by pane id, never by label.
 *
 * Inert unless herdr launched the process: `HERDR_ENV`, `HERDR_PANE_ID` and
 * `HERDR_BIN_PATH` must all be present, so the same profile runs unchanged
 * outside a pane.
 *
 * Every message carries a strictly increasing `--seq`. herdr drops a message
 * whose seq does not advance and still exits 0, so a missing or repeated seq
 * fails silently — release in particular leaves the stale agent on the pane.
 * @module herdr-report
 */

import { spawn } from 'node:child_process'

/** Identifies this integration to herdr; scopes the authority it claims. */
const SOURCE = 'custom:dsh-tui'

/** The agent label herdr shows on the pane. */
const LABEL = 'dsh'

/**
 * Mount the reporter.
 *
 * Maps the session log to herdr's lifecycle. An open approval outranks a
 * running turn, because `blocked` is the one state that should fetch a person:
 * a turn is running either way, and only the approval says nothing will happen
 * until someone answers. Approvals and turns are counted rather than flagged —
 * subagents raise their own, and the pane reports the process, not one session.
 * @param ctx - the plugin's Cordis context; the fiber's disposal releases the
 * pane.
 */
export function apply(ctx) {
  const pane = process.env.HERDR_PANE_ID
  const bin = process.env.HERDR_BIN_PATH
  if (process.env.HERDR_ENV !== '1' || !pane || !bin) return

  const running = new Set()
  const pending = new Set()
  let rootSessionId
  let seq = 0
  let last

  /** Fire one herdr command, detached; a broken pane must never fault a turn. */
  const run = (args) => {
    try {
      const child = spawn(bin, args, { stdio: 'ignore' })
      child.on('error', () => {})
      child.unref?.()
    } catch {
      // herdr absent or unspawnable: reporting is best-effort by contract.
    }
  }

  /** Report a lifecycle state, skipping a repeat of the one already sent. */
  const report = (state) => {
    if (state === last) return
    last = state
    seq += 1
    const args = ['pane', 'report-agent', pane, '--source', SOURCE, '--agent', LABEL, '--state', state, '--seq', String(seq)]
    if (rootSessionId !== undefined) args.push('--agent-session-id', String(rootSessionId))
    run(args)
  }

  /** The state the counters currently imply, approvals outranking turns. */
  const settle = () => {
    report(pending.size > 0 ? 'blocked' : running.size > 0 ? 'working' : 'idle')
  }

  settle()

  ctx.on('session/event', (session, event) => {
    switch (event.type) {
      case 'turn/start':
        if (rootSessionId === undefined) rootSessionId = session.id
        running.add(session.id)
        break
      case 'turn/end':
        running.delete(session.id)
        break
      // Paired one-to-one by the harness: `approval/decided` is appended
      // exactly once per ask, for a decision, a cancellation or a fail-closed
      // outcome alike, so no ask is left pending by a path that skips it.
      case 'approval/asked':
        pending.add(event.data.id)
        break
      case 'approval/decided':
        pending.delete(event.data.id)
        break
      default:
        return
    }
    settle()
  })

  ctx.effect(() => () => {
    seq += 1
    run(['pane', 'release-agent', pane, '--source', SOURCE, '--agent', LABEL, '--seq', String(seq)])
  })
}

/** Plugin name; also the id the profile's `insert` row addresses. */
export const name = 'herdr-report'
