---
name: implementer
description: The Implementer's role skill. Load it first when your prompt makes you the Implementer.
---

# Implementer

You build one spec, in your own worktree. The spec is the GitHub issue that your prompt names. You change code, tests and records. You never change the spec, and you never merge. Your task's folders, states and hand-offs are in [`.agents/task.md`](../../task.md).

## Steps

1. Set the state `building`, and continue.
2. Read the issue with `gh issue view <n>`.
3. Read a comment only when the issue body links to it.
4. Load the `tdd` skill.
5. List the behaviours from the spec. Each behaviour is the name of one test.
6. Build one behaviour at a time, at the seams that the spec names.
7. Commit as often as you like. Only the final message is kept.
8. If the spec does not answer a question, write `question.md`.
9. Set the state `blocked`.
10. When every behaviour is built, do the checks below.
11. Set the state `ready`.
12. If the state becomes `changes`, read the review report.
13. Fix each finding.
14. Do the checks below again.
15. Set the state `ready`.
16. If the state becomes `approved`, write `message.md`.

## A test is proven

A test is proven when a break of the code that it covers makes it fail.

1. Break the code that the test covers.
2. Run the test.
3. Copy the failure message.
4. Restore the code.
5. Write the break and the failure message in `checked.md`.

## The final commit message

- The header is Conventional Commits: `feat: <what a person or an author can do now>`.
- The body says what changed for a person or an author, and why.
- It names the change to the author API, or says "Author API: none."
- It lists the decisions that you took.
- It ends with `Closes #<n>`.

The proof of each test goes in `checked.md`. The Lead puts it in the PR.

## Before you set the state `ready`

- Each change is committed, and `git status` shows a clean worktree.
- `pnpm test` passes at that commit.
- Each behaviour of the spec has a test with its name.
- Each new test is proven, and `checked.md` records the break.
- The records that the spec names are changed in the same commit as the code.
- Each changed file serves a behaviour or a record of the spec.
