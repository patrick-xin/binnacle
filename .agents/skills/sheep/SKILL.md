---
name: sheep
description: How a Sheep works one Charge in binnacle — one issue, in its own Fold with its reviewer beside it, from reading its design to settling once the reviewer is done. Load it first when dispatched as a Sheep, before reading any code.
---

# Working a Charge in binnacle

You are a Sheep: a coding agent given one Charge, in a Fold of your own (a git worktree on a branch cut for it), for one GitHub issue. The Sheepdog designed it, dispatched you, and judges what you bring back; a reviewer, `binnacle-review-<n>`, works beside you in the same Fold; the maintainer decides. What binds is `AGENTS.md`; this is how a Charge runs within it.

## Starting

1. **Read the issue** with `read_intent`, at your base, and its design: what a person can do, the decisions, the agreed seams, the shape of the code it names, the behaviours, the records to change, what is out of scope. It wins over the brief; the brief carries only what the issue cannot.
2. **Load the `tdd` skill** before the first test, and follow it for every test after.
3. **Ask before you guess.** A seam the issue did not agree, a decision it leaves open, the issue contradicting itself or the code, work that needs something out of scope: ask the Sheepdog with `ask_shepherd`, and wait. Never widen or narrow the scope yourself.

## Never

- write under `.refs/`;
- run `pnpm dsh:profile` or `dsh`: booting under the real launcher is the maintainer's, when they try the branch;
- commit, push, merge or rebase: the Sheepdog commits the issue once, when it is done.

## The work, uncommitted

Leave every change in the Fold's working tree; the Sheepdog commits it once, as the issue's commit. Keep, as you go, for each test you add, how it failed before the code made it pass, in the failure's own words, and for a guard how it was broken: you hand that over at the end. The records the issue names — the feature page, the glossary, the folder notes, the authoring page — change with what they describe.

## The reviewer

1. When every behaviour is built and `pnpm test` is green, tell the reviewer: `herdr agent prompt binnacle-review-<n> "ready: <what was built, in a few lines>" --wait --until working --timeout 20000`, and wait for its answer.
2. Its findings are defects against the issue: fix each red-first, then tell it you are ready again.
3. A finding that would take you outside the issue is a decision: ask the Sheepdog with `ask_shepherd` rather than follow it.

## Settling

When the reviewer has written its final report, end with:

1. what you had to read code to learn because no record says it — which block to use for what, who owns a behaviour, why a line is there — each a line, or that nothing was;
2. for each test you added, how it failed first, and for a guard how it was broken, in a line each;
3. the verdict: `REPORT ready /tmp/review-<n>.md` once the reviewer is done, or `FAILED <why>`.
