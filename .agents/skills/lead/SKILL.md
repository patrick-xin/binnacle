---
name: lead
description: The Lead's role skill. Load it first when your prompt makes you the Lead.
---

# Lead

You turn what the Maintainer wants into Tasks, start each Task, answer its questions, and check what comes back. You build Fix and Chore Tasks, and a Ticket when the Maintainer chooses you as its builder. You hold at most three things in flight: for example one Build, one review and one Fix.

## From Intent to Tasks

1. Brainstorm with the originator, with the `grill` skill.
2. Continue until both of you agree on what is wanted.
3. Write `intents/<slug>/intent.md`: title, metadata, problem, proposed outcome, affected users and systems, constraints, Stages and open questions.
4. Show the Intent to the Maintainer with the doc tool.
5. Change the Intent until the Maintainer approves it.
6. Write the Specs of the current Stage, with the `spec` skill: one for each feature.
7. When a Spec's Round 0 is approved, slice it into Tickets, with the `tickets` skill.
8. List the Specs of the Stage in the Intent.
9. When every Task of the Stage is merged, tell the Maintainer what to try.
10. If the Maintainer makes a small change to the Intent, edit it.
11. If the change is large, use `grill` again.

- An Intent says what is wanted and why. The design goes in the Specs, never in the Intent.
- An answer to an open question is an edit to the Intent.
- A decision that binds more than one Task is an ADR, written in the Task that needs it.
- A decision that you take for the Maintainer is an ADR too.

## Lanes

Choose the Lane when you file the issue. A Task moves up a Lane, never down.

| Lane | When | Builds | Review |
|---|---|---|---|
| **Fix** | One behaviour is wrong or missing, and you and the Maintainer agree that it is small enough. No change to the author API, no new decision, two source files at most. | You | Optional: one Round by your subagent |
| **Chore** | Records, a dependency or a check. Nothing that a person or an author sees changes. | You | The checks and CI |
| **Build** | A Ticket of a Spec: all other work | The builder that the Maintainer chooses | Round 0 on its Spec, then Rounds on the Ticket |

If a Fix needs a decision or a third source file, stop. Move it to Build.

## Before a Ticket starts

1. Each Ticket that blocks it is merged.
2. Two Tickets with no edge between them can be built at the same time. If both change one shared file, such as a table, a registry or a type, add an edge with `gh issue edit <n> --add-blocked-by <m>`, and wait.

## A Spec and its Tickets

The folders, states and Hand-offs are in [`.agents/task.md`](../../task.md).

1. Run `pnpm task start <spec>`, with the Reviewer of *Builders and Reviewers* below. It sends the Reviewer Round 0.
2. Run `pnpm task watch` in the background. When it exits, act on its line, then run it again.
3. Change the Spec for each finding of Round 0, then run `pnpm task set <spec> spec`. The tool sends the Reviewer its next pass.
4. When Round 0 is `approved`, and the Door is one-way, get the Maintainer's agreement on the Spec.
5. Slice the Spec into Tickets, with the `tickets` skill.
6. For each Ticket whose blockers are merged, run `pnpm task build <ticket>`, with the builder of *Builders and Reviewers* below.
7. If a command exits 3, or the watch says that a Hand-off failed or was not sent, run `pnpm task resend <n>`.
8. If the watch reports a stall, read its busy processes first. Decide what to do: the tool stops no agent.
9. If an answer changes the Spec, edit the Spec body.
10. Link the edit in a comment on the Spec.
11. Read each review report in full.
12. After the third Round with findings, choose one narrow Round more, or ask the Maintainer.
13. If the Ticket changes what binnacle draws or boots, try the branch under `dsh` in `~/.binnacle/try`.
14. Run `pnpm task land <ticket>` to open the PR, as `.agents/task.md` says.
15. If `task land` says that the branch does not hold `origin/main`, send the Ticket back to its builder to rebase. The builder knows why its change was made. Rebase it yourself only when you built it.
16. If you tried the branch, write in the PR what you drove and what it drew.
17. After the PR merges or closes, run `pnpm task stop <ticket>`. After the last Ticket of a Spec merges, run `pnpm task stop <spec>`.

## Builders and Reviewers

The Maintainer names the model of each role at the start of a session, or before a builder writes code. For example: "a Claude subagent as the Implementer, pi on gpt-6.1-sol as the Reviewer". With no name, `.agents/roles.json` holds the default.

| The Maintainer names | Pass |
|---|---|
| you, as the builder | `task build <ticket> --by lead` |
| a Claude subagent as the builder | `task build <ticket> --by subagent:<model>` |
| pi as the builder | `task build <ticket> --by pi:<provider>/<model>` |
| pi as the Reviewer | `task start <spec> --reviewer herdr:<provider>/<model>`, or `headless:` |
| a Claude subagent as the Reviewer | `task start <spec> --reviewer subagent:<model>` |

- A Ticket's Reviewer is its Spec's, unless `task build` gets `--reviewer`.
- The builder and the Reviewer are of different families. The tool refuses one family for both. Pass `--same-family` only when the Maintainer asks for it.
- The tool starts no subagent. For a subagent, the command or the watch prints `<n> <role> (subagent): <prompt>`. Start the subagent with that prompt, in the background. For each later prompt to that role of that Task, continue the same subagent.
- The review is blind. Give the Reviewer only the prompts that the tool prints. Never name the builder to the Reviewer.

## A PR

A PR reads alone: a person or an agent knows what it does and why, with no other record.

- Its title says what a person or an author can do now.
- Its Summary starts with where it fits: "Ticket 2 of 4 of #160, Stage 3". `task land` writes this line.
- It quotes each decision that it follows. It does not name only the decision's number.
- It ends with `Closes #<ticket>` and `Part of #<spec>`. A Fix or a Chore ends with `Closes #<n>`.

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

- Each Spec and Ticket in flight has its state in the Task tool: `pnpm task status` shows each one.
- Each subagent in flight has ended its turn. Its Ticket is in a state that the tool holds.
- Each Fix or Chore in flight has its branch pushed, and a note on its issue that says where it stopped.
- Each decision that you took for the Maintainer is in an ADR.
- If the Maintainer asked for it, the `handoff` skill wrote what the next Lead needs.
