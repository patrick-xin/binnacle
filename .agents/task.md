# A task: its folders, states and hand-offs

The Lead, the Implementer and the Reviewer of a Build task share these. The task tool holds each task's state. The Lead sends each hand-off.

Run the tool as `pnpm task <command>`. It reads its issue with `gh`, and works on the repository it lives in.

## Folders

| Path | Holds | Made by |
|---|---|---|
| `~/.binnacle/worktrees/<n>` | The Implementer's worktree, on the branch `task/<n>` | the task tool, by `task start` |
| `~/.binnacle/worktrees/<n>-review` | The Reviewer's checkout, detached at the tip that it reviews | the Reviewer |
| `~/.binnacle/tasks/<n>/` | The task's files, below | the task tool, by `task start` |

The files of task `<n>`:

| File | Holds | Written by |
|---|---|---|
| `task.json` | What does not change: the number, the branch, the worktree, the files, the time it was made | the task tool |
| `log.ndjson` | One JSON line for each change of state: the time, the role, the state before, the state after and the round | the task tool |
| `question.md` | The open question | the role that asks |
| `answer.md` | The answer | the Lead |
| `review-<r>.md` | The report of round `<r>`. Round 0 checks the spec. | the Reviewer |
| `checked.md` | Each test's break and its failure message | the Implementer |
| `message.md` | The final commit message | the Implementer |

The log governs the state: the last line is the current state and round. If the log does not end with a newline, or a line is not JSON, each command for that task refuses and names the file. The Lead repairs it by hand.

## Commands

| Command | Role | Does |
|---|---|---|
| `pnpm task start <n>` | Lead | Checks the families, the files and the overlap. Makes the branch, the worktree and the task folder. |
| `pnpm task set <n> <state> --as <role>` | the role in `--as` | Sets `spec`, `building`, `ready`, `changes` or `approved`, as the table below allows |
| `pnpm task ask <n> --as <role>` | any role | Sets `blocked` |
| `pnpm task answer <n>` | Lead | Sets the state from before `blocked` |
| `pnpm task status [<n>]` | any role | Shows the tasks |
| `pnpm task watch` | Lead | Exits when a change that the Lead acts on is set |
| `pnpm task stop <n> [--force]` | Lead | Removes the worktrees and the branch, and sets `stopped` |

`--as` takes `lead`, `implementer` or `reviewer`. A command without `--as` acts as the Lead. `task set` refuses `blocked` and `stopped`: only `task ask` and `task stop` set them.

The files of a task come from its issue: each path in backticks between `## Code shape` and the next `## `. A path that ends in `/` is a folder. Two tasks cannot hold files that overlap, and `task start` refuses them.

Each command that writes takes the lock `~/.binnacle/tasks/.lock`, and the watch takes `~/.binnacle/tasks/watch.pid`. No command removes a claim that is not its own: a check of the owner and a removal are two steps that another process can come between. When a command exits 1 and names the lock or the pid file, check that the process it names is gone, then remove the file by hand.

## States

| State | Set by | Can follow | Then the Lead |
|---|---|---|---|
| `spec` | `task start`, or the Lead after an edit of the spec | `changes` at round 0 | sends the spec to the Reviewer for round 0 |
| `changes` | Reviewer | `spec`, `ready` | after round 0, edits the spec. After a later round, tells the Implementer the report. |
| `approved` | Reviewer | `spec`, `ready` | after round 0, starts the Implementer. After a later round, asks the Implementer for `message.md`. |
| `building` | Implementer | `approved` at round 0, `changes` after round 0 | waits |
| `ready` | Implementer | `building`, `changes` after round 0 | tells the Reviewer the tip |
| `blocked` | any role, with `task ask` | each state except `blocked` and `stopped` | writes `answer.md`, runs `pnpm task answer <n>`, and tells the role that asked |
| `stopped` | Lead, with `task stop` | each state except `stopped` | nothing: the task is done |

To set a state, run `pnpm task set <n> <state> --as <role>`.

The Lead sends each hand-off itself: the table's last column says what it sends for each state, and `pnpm task watch` tells it when.

- `building` marks progress. Continue to work after you set it.
- Each other state hands the task on. End your turn after you set it.
- Each `ready` starts the next round. The round number goes up by one.
- A task is running until it is `stopped`. After its PR merges, the Lead runs `pnpm task stop <n>`, and the task folder stays as the record.

## Questions

1. Write your question to `question.md` in the task folder.
2. Run `pnpm task ask <n> --as <role>`.
3. When the Lead tells you that `answer-<k>.md` exists, read it, and continue your work from the state you had. The Lead set that state again, so do not set it again yourself.

The Lead answers:

1. Write the answer to `answer.md` in the task folder.
2. Run `pnpm task answer <n>`. The tool sets the state from before `blocked`, and renames both files to `question-<k>.md` and `answer-<k>.md`, where `<k>` counts the questions of the task.
3. Tell the role that asked to read `answer-<k>.md`.

## The PR

The Lead opens the PR when the Reviewer approves and `message.md` exists:

1. Squash the branch into one commit, with `message.md` as its message.
2. Put `checked.md` in the PR's *Checked* list.
3. Put the text of each review report in the PR, each in a `<details>` block.
4. Label the PR with its door.

A Fix, a Chore and a Researcher's question have no task folder. The Lead builds a Fix or a Chore alone, and the Researcher's answer ends its question.
