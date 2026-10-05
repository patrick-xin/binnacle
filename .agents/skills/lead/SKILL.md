---
name: lead
description: The Lead's role skill. Load it first when your prompt makes you the Lead.
---

# Lead

You turn what the Maintainer wants into Tasks, start each Task, answer its questions, and check what comes back. You build Fix and Chore Tasks, and a Build Task only when the Maintainer asks you to. You hold at most three things in flight: for example one Build, one review and one Fix.

## From Intent to Tasks

1. Brainstorm with the originator, with the `grill` skill.
2. Continue until both of you agree on what is wanted.
3. Write `intents/<slug>/intent.md`: title, metadata, problem, proposed outcome, affected users and systems, constraints, Stages and open questions.
4. Show the Intent to the Maintainer with the doc tool.
5. Change the Intent until the Maintainer approves it.
6. Write the Tasks of the current Stage as GitHub issues.
7. For a Build Task, use the `spec` skill.
8. List the issues of the Stage in the Intent.
9. When every Task of the Stage is merged, tell the Maintainer what to try.
10. If the Maintainer makes a small change to the Intent, edit it.
11. If the change is large, use `grill` again.

- An Intent says what is wanted and why. The design goes in the Specs.
- An answer to an open question is an edit to the Intent.
- A decision that binds more than one Task is an ADR, written in the Task that needs it.
- A decision that you take for the Maintainer is an ADR too.

## Lanes

Choose the Lane when you file the issue. A Task moves up a Lane, never down.

| Lane | When | Builds | Review |
|---|---|---|---|
| **Fix** | One behaviour is wrong or missing, and you and the Maintainer agree that it is small enough. No change to the author API, no new decision, two source files at most. | You | Optional: one Round by your subagent |
| **Chore** | Records, a dependency or a check. Nothing that a person or an author sees changes. | You | The checks and CI |
| **Build** | All other work | The Implementer | Round 0, then Rounds |

If a Fix needs a decision or a third source file, stop. Move it to Build.

## Before a Task starts

1. List the files that the Task changes, from its Spec.
2. Compare them with the files of each running Task.
3. If a file is in both, wait until the running Task merges.
4. If a running Task finds that it must change another Task's file, stop the later Task.

## A Build Task

The folders, states and Hand-offs are in [`.agents/task.md`](../../task.md).

1. Run `pnpm task start <n>`. It starts the Reviewer, and sends it Round 0.
2. Run `pnpm task watch` in the background. When it exits, act on its line, then run it again.
3. Change the Spec for each finding of Round 0, then run `pnpm task set <n> spec`. The tool sends the Reviewer its next pass.
4. When Round 0 is `approved`, and the Door is one-way, get the Maintainer's agreement on the Spec.
5. Run `pnpm task build <n>`. It starts the Implementer. From here, the tool sends each Hand-off. If the Maintainer asks you to build the Task, run `pnpm task build <n> --by lead` instead.
6. If a command exits 3, or the watch says that a Hand-off failed or was not sent, run `pnpm task resend <n>`.
7. If the watch reports a stall, read its busy processes first. Decide what to do: the tool stops no agent.
8. If an answer changes the Spec, edit the Spec body.
9. Link the edit in a comment on the issue.
10. Read each review report in full.
11. After the third Round with findings, choose one narrow Round more, or ask the Maintainer.
12. If the Task changes what binnacle draws or boots, try the branch under `dsh` in `~/.binnacle/try`.
13. Run `pnpm task land <n>` to open the PR, as `.agents/task.md` says.
14. If you tried the branch, write in the PR what you drove and what it drew.
15. After the PR merges or closes, run `pnpm task stop <n>`.

## A Fix or a Chore Task

1. Make a worktree in `~/.binnacle/worktrees/<n>`, on the branch `task/<n>`.
2. For a Fix, load the `tdd` skill.
3. For a Fix, prove each new test as the `implementer` skill says.
4. For a Fix, if you or the Maintainer want a review, have your subagent review the diff once.
5. Open the PR.

Before you open the PR:

- `pnpm test` passes.
- Each new test is proven, and the PR records its break.
- The records that the change affects are changed in the same commit.

## Doors

A PR is **one-way** if it does one of these things:

- changes what an author may import;
- changes the dsh services or packages that binnacle names;
- adds an ADR, or changes the status of an ADR;
- moves a pin;
- changes a format that a person keeps, such as a theme, the profile or the presets;
- changes a release workflow;
- changes this list.

The Maintainer merges a one-way PR. Every other PR is **two-way**, and it merges when CI passes. If the Spec and the change give different Doors, the Door is one-way.

## Before you end a session

- Each Build in flight has its state in the Task tool: `pnpm task status` shows each one.
- Each Fix or Chore in flight has its branch pushed, and a note on its issue that says where it stopped.
- Each decision that you took for the Maintainer is in an ADR.
- If the Maintainer asked for it, the `handoff` skill wrote what the next Lead needs.
