# A task: its folders, states and hand-offs

The Lead, the Implementer and the Reviewer of a Build task share these. The task tool will take them over in stage 2 of agent-workflow. Until then, each role writes its state by hand, and the Lead sends each hand-off.

## Folders

| Path | Holds | Made by |
|---|---|---|
| `~/.binnacle/worktrees/<n>` | The Implementer's worktree, on the branch `task/<n>` | the Lead |
| `~/.binnacle/worktrees/<n>-review` | The Reviewer's checkout, detached at the tip that it reviews | the Reviewer |
| `~/.binnacle/tasks/<n>/` | The task's files, below | the Lead |

The files of task `<n>`:

| File | Holds | Written by |
|---|---|---|
| `state` | One word: the state | the role that owns the state |
| `question.md` | The open question | the role that asks |
| `answer.md` | The answer | the Lead |
| `review-<r>.md` | The report of round `<r>`. Round 0 checks the spec. | the Reviewer |
| `checked.md` | Each test's break and its failure message | the Implementer |
| `message.md` | The final commit message | the Implementer |

## States

| State | Set by | Means | Then the Lead |
|---|---|---|---|
| `building` | Implementer | The build runs. | waits |
| `ready` | Implementer | The tip is ready for a review round. | tells the Reviewer the tip |
| `changes` | Reviewer | The round has findings. | tells the Implementer the report |
| `approved` | Reviewer | The round is clean. | asks the Implementer for `message.md` |
| `blocked` | any role | `question.md` waits for the Lead. | writes `answer.md`, and tells the role that asked |

To set a state:

1. Write the word to `~/.binnacle/tasks/<n>/state`.
2. End your turn. The Lead watches the state files.

## The PR

The Lead opens the PR when the Reviewer approves and `message.md` exists:

1. Squash the branch into one commit, with `message.md` as its message.
2. Put `checked.md` and a line for each review round in the PR's *Checked* list.
3. Label the PR with its door.
