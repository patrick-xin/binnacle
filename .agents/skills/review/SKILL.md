---
name: review
description: How a change to binnacle is reviewed before its pull request merges — against its issue, by running it, and against what has gone wrong here before. Load it when asked to review a branch, a pull request or a Charge.
---

# Reviewing a change to binnacle

What binds is `AGENTS.md`; this skill is how to check a change against it. A review judges the change against its issue — the durable intent — never against a brief, a commit message or the author's own account of what they did.

## Before reading the diff

1. **Read the issue at the change's base**: what a person can do, the maintainer's decisions, the agreed seams, the behaviours, the records to change, what is out of scope.
2. **Run it.** From the checkout under review: `pnpm install --frozen-lockfile && pnpm refs && pnpm test && pnpm build`. A red run is the first finding, with its output.
3. **Look at it.** What a person sees is lines: draw the screens the issue's behaviours describe — through the tests' `drawText`, or a probe test you write and throw away — and compare them with the issue, not with the tests the change brought.

## Reading the diff

Check each, in order; each was a real finding here once.

- **The seam.** Every test sits at a seam the issue agreed. A test at another one, or inside a seam, is a finding, however green.
- **Red before green, on the record.** Each commit says how each test it adds failed first, in the failure's own words; a guard says how it was broken. A test that could not have failed is a finding.
- **Expected values from outside the code.** A test that recomputes its expected value the way the code does agrees with any bug.
- **The shape the architecture already chose.** A placement where ADR 11 places, the one key table (ADR 13) and never a manager of its own, pi-tui's windowing and selection (ADR 7). An overlay, a second key table or a global setter in their stead is a finding even when it works.
- **What more than one feature needs moves down** into a layer, never copied (ADR 5). Two copies of one piece of logic — gesture handling, say — is a finding.
- **A frame costs what changed** (ADR 9). Work at each event or frame that grows with the session — copying every fact on each arrival, redrawing every entry — is a finding: say at what length it hurts.
- **Arrays the size of a session.** Spreading one into a call (`push(...lines)`) throws past about a hundred thousand elements. Anything that can hold a log's worth of lines is pushed one at a time or concatenated.
- **Every dsh kind as dsh means it.** A kind drawn, quieted or left unread is checked against what dsh's own web shows in its chat and its trajectory, not guessed from the kind's name.
- **The author API.** A change to what `src/api.ts` exports, `Node` included, says so in its commit, and the authoring page follows it.
- **The records.** The feature's page, the glossary and the package map change in the same commit as what they describe, and cite rather than restate.
- **Out of scope stays out.**

## What to report

Findings, most severe first, each with:

- where: `path:line`;
- what is wrong, in one sentence;
- how it fails: the input or state, and the wrong output or crash — concrete enough to reproduce;
- whether you saw it fail, or read it.

Then a verdict: `clean`, or `findings`. A finding you could not make fail is said to be so. Style the gates already hold is no finding.

## Running it with codex

The Sheepdog runs a second reviewer from another model family beside its own review, with full access in a checkout of its own, so it can install, build, run and write probe tests without touching the Sheep's Fold:

```sh
git worktree add --detach /tmp/review-<charge> <tip>
codex exec --dangerously-bypass-approvals-and-sandbox -C /tmp/review-<charge> -o /tmp/review-<charge>.md \
  "Load the review skill and review this checkout against issue #<n>, from its base <base>. Push nothing; write nothing outside this checkout."
git worktree remove --force /tmp/review-<charge>
```

Its findings go to the Sheep with the Sheepdog's own, and the pull request says what each reviewer found.

## After the review

Say, in a few lines, what in this skill, `AGENTS.md` or the docs was missing, wrong or misleading for this review. The Sheepdog carries it to the lessons issue (#26), and a lesson that recurs moves into a skill.
