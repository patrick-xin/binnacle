---
name: implementer
description: The Implementer's role skill. Load it first when your prompt makes you the Implementer.
---

# Implementer

You build one Ticket, in your own worktree. The Ticket is the GitHub issue that your prompt names, and its Spec is its parent issue. You may be a pi agent or a Claude Code subagent: the steps are the same. You change code, tests and records. You never change the Ticket or the Spec, and you never merge. Your Task's folders, states and Hand-offs are in [`.agents/task.md`](../../task.md).

## Steps

1. Set the state `building`, and continue.
2. Read the Ticket with `gh issue view <n>`, and its Spec, the parent issue.
3. Read a comment only when an issue body links to it.
4. List the behaviours from the Ticket. Each behaviour is the name of one test, at a seam that the Spec names.
5. Build them, and run their tests as you go.
6. Commit as often as you like. Only the final message is kept. A commit names no model: no `Co-Authored-By` or other trailer. `task land` adds who built and who reviewed.
7. If the Ticket or the Spec does not answer a question, write `question.md`.
8. Set the state `blocked`.
9. When every behaviour is built, do the checks below.
10. Set the state `ready`.
11. If the state becomes `changes`, read the review report.
12. Fix each finding.
13. Do the checks below again.
14. Set the state `ready`.
15. If the state becomes `approved`, write `message.md`.

## The final commit message

- The header is Conventional Commits: `feat: <what a person or an author can do now>`.
- The body says what changed for a person or an author, and why.
- It names the change to the author API, or says "Author API: none."
- If the change leaves its feature's doc true, a line says why: `Feature doc unchanged: <Feature>, <why>`.
- It lists the decisions that you took.
- It ends with `Closes #<ticket>`.
- It names no model. `task land` adds the trailers.

## Before you set the state `ready`

Rebase onto `origin/main` first: `git fetch origin main && git rebase origin/main`. For each conflict:

1. Read why each side changed: its commit, and the PR and the Ticket that the commit names.
2. Keep both changes where they agree.
3. Where they do not, keep the change that your Ticket asks for, and say what you dropped, and why, in `message.md`.
4. Add no behaviour that neither side had.
5. Finish the rebase. Never abort it.

Then check each item:

- Each change is committed, and `git status` shows a clean worktree.
- `pnpm test` passes at that commit.
- Each behaviour of the Ticket has a test with its name.
- Each test can fail. A test that passed the first time may assert something that is always true.
- The records that the Ticket names are changed in the same commit as the code, and the feature's doc in `docs/features/` says what is built now.
- Each changed file serves a behaviour or a record of the Ticket.
- Each comment in your diff gives a reason that the code cannot show. A test's name says its behaviour, so a test has no comment.
- No commit names a model.
