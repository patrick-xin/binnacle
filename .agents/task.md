# A Spec and its Tickets: their folders, states and Hand-offs

The Lead, the Implementer and the Reviewer share these. The Task tool holds the state of each Spec and each Ticket, starts the agents that it can start, and sends each Hand-off. A Spec has only Round 0. A Ticket is a sub-issue of its Spec: it begins where its Spec's Round 0 ended, and its Rounds start at 1.

Run the tool as `pnpm task <command>`. It reads its issue with `gh`, and works on the repository it lives in.

## Folders

| Path | Holds | Made by |
|---|---|---|
| `~/.binnacle/worktrees/<ticket>` | The builder's worktree, on the branch `task/<ticket>` | `task build` |
| `~/.binnacle/worktrees/<n>-review` | The Reviewer's checkout, made at `origin/main`. A Spec's Reviewer reviews each of its Tickets here too. Before each Round, the Reviewer moves it to the tip that its prompt names. | `task start`, and `task build` for a Reviewer of the Ticket's own |
| `~/.binnacle/tasks/<n>/` | The files of the Spec or the Ticket, below | `task start`, `task build` |

The files of Spec or Ticket `<n>`:

| File | Holds | Written by |
|---|---|---|
| `task.json` | What does not change: the number, the kind (`spec` or `ticket`), a Ticket's Spec, branch and worktree, and the time it was made | the Task tool |
| `log.ndjson` | One JSON line for each change of state: the time, the role, the state before, the state after and the Round | the Task tool |
| `events.ndjson` | One JSON line for each event that is not a change of state: a Hand-off, a try, a start, a stall | the Task tool |
| `agents.json` | The builder and the Reviewer that were chosen: the runner, the tool, the model and the family, and how to reach each agent once it starts. The Reviewer never reads it. | the Task tool |
| `agents/<role>/` | The agent's session files (`sessions/`), and for a headless agent its queue, its run and its output | the Task tool, and the agent's tool |
| `question.md` | The open question | the role that asks |
| `answer.md` | The answer | the Lead |
| `review-<r>.md` | The report of Round `<r>`. A Spec's Round 0 has passes: its first pass is `review-0.md`, and pass `<p>` is `review-0-<p>.md`. The prompt names the file. | the Reviewer |
| `checked.md` | Each test's break and its failure message | the builder |
| `message.md` | The final commit message, which names no model | the builder |

The log governs the state: the last line is the current state and Round. If the log does not end with a newline, or a line is not JSON, each command for that Task refuses and names the file. The Lead repairs it by hand.

## Commands

| Command | Role | Does |
|---|---|---|
| `pnpm task start <spec> [--reviewer <runner>:<model>]` | Lead | Makes the Reviewer's checkout and the Spec's folder. Starts the Reviewer, and sends it Round 0. |
| `pnpm task build <ticket> [--by <builder>] [--reviewer <runner>:<model> \| --fresh-reviewer] [--same-family]` | Lead | After its Spec's Round 0 is `approved`, checks the families, makes the branch, the worktree and the Ticket's folder, and sends the builder the Ticket. See *Builders and Reviewers*. |
| `pnpm task set <n> <state>` | the role that owns the state | Sets `spec`, `building`, `ready`, `changes` or `approved`, as the table below allows, and sends its Hand-off |
| `pnpm task ask <n>` | any role | Sets `blocked` |
| `pnpm task answer <n>` | Lead | Sets the state from before `blocked`, and sends the answer to the role that asked |
| `pnpm task resend <n>` | Lead | Sends the newest Hand-off that did not land again, and starts its agent first if it is not running |
| `pnpm task status [<n>]` | any role | Shows the Tasks, and each agent with the time since its last session record |
| `pnpm task watch` | Lead | Exits when the Lead must act |
| `pnpm task land <ticket>` | Lead | After a Round of the Ticket is `approved`, squashes the branch with `message.md` and its trailers, pushes it, and opens the PR. See *The PR*. |
| `pnpm task stop <n> [--force]` | Lead | Closes the agents, removes the worktrees and the branch, and sets `stopped` |

- An agent runs the tool of the main checkout, as its prompt names it: `pnpm -C <main checkout> task ...`. Its own checkout can hold another version of the tool, and a branch's tool sends that branch's Hand-offs.
- Each agent that the tool starts gets `BINNACLE_TASK` and `BINNACLE_ROLE` in its environment. An agent leaves out the Task number and `--as`: `pnpm -C <main checkout> task set ready`.
- The Lead, outside an agent, passes `--as <role>` when it acts for a role. A command without `--as` acts as the Lead.
- `task set` refuses `blocked` and `stopped`: only `task ask` and `task stop` set them.
- A command whose change of state stays, but whose Hand-off failed, exits 3. Run `pnpm task resend <n>`.

Blocking edges on GitHub order the Tickets. The tool does not check them: the Lead builds a Ticket only after its blockers merge.

Each command that writes takes the lock `~/.binnacle/tasks/.lock`, and the watch takes `~/.binnacle/tasks/watch.pid`. A command holds the lock while it starts an agent and sends a Hand-off: at most about 90 seconds. No command removes a claim that is not its own. When a command exits 1 and names the lock or the pid file, check that the process it names is gone, then remove the file by hand.

## Builders and Reviewers

`.agents/roles.json` names the default tool, model, thinking level and runner of each role, and the family of each provider. The Maintainer can choose others for a session, and the Lead passes them to the tool:

| Choice | Builder | Reviewer |
|---|---|---|
| The Lead | `--by lead` | — |
| A Claude Code subagent | `--by subagent:<model>` | `--reviewer subagent:<model>` |
| A pi agent | `--by pi:<provider>/<model>`, on the runner of the default Implementer | `--reviewer herdr:<provider>/<model>`, or `headless:` |

- A Ticket's Reviewer is its Spec's own agent: the one that reviewed Round 0 reviews each Round of each Ticket, in the Spec's checkout. The Ticket's `agents.json` holds `{ "of": <spec> }`, and the agent is kept in the Spec's folder.
- `--reviewer` gives the Ticket a Reviewer of its own, with a checkout of its own. `--fresh-reviewer` does too, and starts it from a copy of the Spec Reviewer's newest session, with pi's `--fork`. Use it for two Tickets of one Spec in review at once, or for a Reviewer that has reviewed long. It forks only a herdr Reviewer.
- A Spec stops after its Tickets: `task stop <spec>` refuses while a Ticket of it is not stopped, unless it gets `--force`.
- An approved Spec goes back to `spec`, for another pass of Round 0, until a Ticket of it is built.
- A subagent's family is `anthropic`. A pi model's family comes from its provider, the part before `/`, through `families` in `.agents/roles.json`. The tool refuses a provider that has no family there.
- `task build` refuses a builder and a Reviewer of one family. `--same-family` lets it through.
- The tool starts a Ticket's Reviewer at its first `ready`, so that prompt also tells it its role.

## Runners

The Task tool starts only `pi`. The Lead takes the roles that run as `lead` or `subagent`.

| Runner | An agent is | A prompt |
|---|---|---|
| `herdr` | an interactive pi in a herdr tab of its own, named `<role>-<n>`, where the Maintainer can watch it. Started again, it continues its session with pi's `--continue`. | `herdr agent prompt`, three tries in all |
| `headless` | a supervisor, which runs each prompt as one `pi -p` with no standard input, under a time limit of 45 minutes. One supervisor runs for an agent: it takes its claim under the Task lock. | a file in the agent's queue. The command does not wait. |
| `subagent` | a Claude Code subagent that the Lead starts, and continues for each later prompt | the command prints `task <n>: for the <role> (subagent): <prompt>` when the Lead ran it, and the watch prints `<n> <role> (subagent): <prompt>` otherwise |
| `lead` | the Lead itself | as for `subagent`, with `(lead)` |

Each prompt names its role, as in `task set <n> ready --as implementer`, because a subagent has no `BINNACLE_ROLE`.

## States

| State | Set by | Can follow | Then the tool |
|---|---|---|---|
| `spec` | `task start`, or the Lead after an edit of the Spec | `changes` on a Spec | sends the Spec to the Reviewer for the next pass of Round 0 |
| `changes` | Reviewer | `spec`, `ready` | on a Spec, wakes the Lead to edit the Spec. On a Ticket, sends the report to the Implementer. |
| `approved` | Reviewer, or `task build` as a Ticket's first line | `spec`, `ready` | on a Spec, wakes the Lead, and nothing follows it. On a Ticket, also asks the Implementer for `message.md`. |
| `building` | Implementer | `approved` at Round 0 and `changes`, on a Ticket | nothing |
| `ready` | Implementer | `building`, and `changes` on a Ticket | sends the Reviewer the tip, and the commits since the last Round |
| `blocked` | any role, with `task ask` | each state except `blocked` and `stopped` | wakes the Lead |
| `stopped` | Lead, with `task stop` | each state except `stopped` | nothing: the Task is done |

- `building` marks progress. Continue to work after you set it.
- Each other state hands the Task on. End your turn after you set it.
- Each `ready` starts the next Round. The Round number goes up by one.
- A change that the Lead sets never wakes the Lead.
- A Task is running until it is `stopped`. After its PR merges, the Lead runs `pnpm task stop <n>`, and the Task folder stays as the record.

## The watch

`pnpm task watch` prints one line for the oldest thing that the Lead must act on, and exits:

| Line | Means |
|---|---|
| `140 approved round 1 (reviewer)` | A change of state that wakes the Lead |
| `140 implementer (lead): <prompt>` | A Hand-off to a role that the Lead takes, with the prompt the agent would get |
| `140 reviewer hand-off h3 failed: <error>` | The agent did not start, or the prompt did not land after its last try |
| `140 reviewer hand-off h3 was not sent; run task resend 140` | A command stopped during its Hand-off |
| `140 implementer stalled: no session record for 20 min` | The agent works, but pi wrote no session record for 20 minutes |
| `140 implementer stalled: ...; busy 48370 node --test ..., cpu 4:50 in 5 min` | A process under the agent used the CPU for at least 4 of the last 5 minutes |
| `140 implementer waits in its pane` | The agent waits for a person in its herdr pane |
| `140 reviewer run timed out after 45 min` | A headless run hit its time limit, and was stopped with its children |
| `140 reviewer run failed: spawn pi ENOENT` | A headless run could not start. Its prompt is dropped: fix the cause, then send the prompt again by hand. |

pi writes a session record when a message ends, not while it streams, so a long message can show as a stall. Read the pane, or the busy process, before you act. The tool stops no agent by itself.

## Questions

1. Write your question to `question.md` in the Task folder.
2. Run `pnpm task ask <n>`.
3. When the tool tells you that `answer-<k>.md` exists, read it, and continue your work from the state you had. The Lead set that state again, so do not set it again yourself.

The Lead answers:

1. Write the answer to `answer.md` in the Task folder.
2. Run `pnpm task answer <n>`. The tool sets the state from before `blocked`, renames both files to `question-<k>.md` and `answer-<k>.md`, where `<k>` counts the questions of the Task, and sends the answer to the role that asked.

## A role that the Lead takes

When the builder is the Lead, or a role runs as a subagent, the tool starts no agent for it.

- The Lead, or its subagent, sets the role's states with `--as <role>`.
- A Hand-off to the role starts no agent. The watch prints it as `<n> <role> (lead): <prompt>` or `<n> <role> (subagent): <prompt>`. When the Lead's own command makes the Hand-off, the command prints it, and the watch stays quiet.
- `task status` shows the entry as `implementer lead` or `implementer subagent <model>`. `task stop` and the watch leave it alone.

## The PR

Run `pnpm task land <ticket>` when the Reviewer approves a Round of the Ticket, and `message.md` and `checked.md` exist. It checks each input before it changes anything, then:

1. squashes the branch into one commit on `origin/main`, with `message.md` as its message and two trailers, `Built-by:` and `Reviewed-by:`, and pushes it;
2. opens the PR, in the shape of the PR template: where the Ticket fits ("Ticket 2 of 4 of #160, <the Spec's title>"), the message's body, `checked.md` under *Evidence*, the Ticket's Door, and at the end `Closes #<ticket>` and `Part of #<spec>`;
3. labels a one-way PR `one-way`;
4. posts each review report as a comment of its own, oldest first;
5. writes `landed` with the PR's address.

A land that stops part of the way names the step: run it again, and it finishes without a second commit, PR or comment. Before you merge, fill in *Blast radius*, and answer the items of *Checked* that the tool cannot know. A two-way PR merges when CI passes, and the Maintainer merges a one-way PR.

If the branch does not hold `origin/main`, `task land` refuses. The builder rebases it, as the `implementer` skill says.

A Fix, a Chore and a Researcher's question have no Task folder. The Lead builds a Fix or a Chore alone, and the Researcher's answer ends its question.
