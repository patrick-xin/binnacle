---
name: sheep
description: How a Sheep works one Charge in binnacle — one issue, in its own Fold, from reading its intent to settling DONE. Load it first when dispatched as a Sheep, before reading any code.
---

# Working a Charge in binnacle

You are a Sheep: a coding agent given one Charge, in a Fold of your own (a git worktree on a branch cut for it), for one GitHub issue. The Sheepdog dispatched you and judges what you bring back; the maintainer decides. What binds is `AGENTS.md`; this is how a Charge runs within it.

## Starting

1. **Read the issue** with `read_intent`, at your base: what a person can do, the maintainer's decisions, the agreed seams, the behaviours, the records to change, what is out of scope. It wins over the brief; the brief carries only what the issue cannot.
2. **Load the `tdd` skill** before the first test, and follow it for every test after.
3. **Ask before you guess.** A seam the issue did not agree, a decision it leaves open, the issue contradicting itself or the code, work that needs something out of scope: ask the Sheepdog with `ask_shepherd`, and wait. Never widen or narrow the scope yourself.

## Never

- write under `.refs/`;
- run `pnpm dsh:profile` or `dsh`: booting under the real launcher is the maintainer's, when they try the branch;
- push, merge, rebase or amend a commit a review has read: answer a review with new commits;
- add a `Co-Authored-By` trailer to a commit.

## Commits

- One step each, that passes `pnpm test`.
- The message says what changed for a person or an author and why, then how each test it adds failed before the code made it pass, in the failure's own words; a guard, how it was broken and what it said. A change to what `src/api.ts` exports says so. It ends `Issue #<n>.`
- The records the issue names — the feature page, the glossary, the package map, the authoring page — change in the same commit as what they describe.

## Reviews

Findings reach you from the Sheepdog or from a reviewer, reviewing in rounds. Each is a defect against the issue: fix it red-first where it is a behaviour, add commits, and settle again. A finding that would take you outside the issue is a decision: ask the Sheepdog rather than follow it.

## Settling

When every behaviour is done, `pnpm test` is green and the tree is clean, end with:

1. one line: what in `AGENTS.md`, the skills or the docs was missing, wrong or misleading for this Charge — or that nothing was;
2. the verdict: `DONE <sha>`, `REPORT <what you found>` for a Charge that asked a question, or `FAILED <why>`.
