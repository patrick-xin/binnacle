---
name: review
description: How a change to binnacle is reviewed before its pull request merges — against its issue, by running it, and against what has gone wrong here before. Load it when asked to review a branch, a pull request or a Charge.
---

# Reviewing a change to binnacle

What binds is `AGENTS.md`; this skill is how to check a change against it. A review judges the change against its issue — the durable intent, or the maintainer's words as given to the reviewer where there is no issue — never against a brief, a commit message or the author's own account of what they did.

## Before reading the diff

1. **Read the issue at the change's base**: what a person can do, the maintainer's decisions, the agreed seams, the behaviours, the records to change, what is out of scope.
2. **Run it.** From the checkout under review: `CI=true pnpm install --frozen-lockfile && pnpm refs && pnpm test && pnpm build`. A red run is the first finding, with its output. Booting under the real `dsh` is not the reviewer's: a linked worktree cannot make a dsh profile, and `check:boot` runs when the maintainer builds the branch in their own checkout to try it.
3. **Look at it.** What a person sees is lines: draw the screens the issue's behaviours describe — through the tests' `drawText`, or a probe test you write and throw away — and compare them with the issue, not with the tests the change brought. Draw a changed layout at a width where its lines wrap as well: a region's rows are where a wrapped line goes wrong.

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

The Sheepdog runs a second reviewer from another model family, with full access in a checkout of its own, so it can install, build, run and write probe tests without touching the Sheep's Fold. It runs as `gpt-5.6-sol` at high effort, named on every run: codex's own default model may be a heavier one, and a review does not need it.

**One `codex exec` is one round.** codex sends the whole conversation to the model again on every tool call, so a review costs its calls times the size its context has grown to. A second round in the same run pays the first round's whole context on every call. On one change here, that was 93 calls and 11M input tokens, and three reviews at once used up the usage window. So a round ends when its findings are sent, and the next round is a fresh run that starts from them:

```sh
git worktree add --detach /tmp/review-<charge> charge-<charge>
codex exec -m gpt-5.6-sol -c model_reasoning_effort=high --dangerously-bypass-approvals-and-sandbox -C /tmp/review-<charge> -o /tmp/review-<charge>-<round>.md \
  "Load the review skill. Round <round> of Charge <charge> against issue #<n>, from its base <base>; its own commits are <shas>, <whose each is>. <For round 2 on: round <round-1>'s findings are in /tmp/review-<charge>-<round-1>.md, answered by <shas>.> Push nothing; write nothing outside this checkout, where probes and caches are yours."
git worktree remove --force /tmp/review-<charge>
```

A temporary directory set inside the checkout (`TMPDIR`) needs `GIT_CEILING_DIRECTORIES` set to the checkout too, or git in a test's own repository finds the checkout around it.

## Keeping a review small

What each call returns stays in the context for every call after it.

- **The issue without its comments**: `gh issue view <n>`. Read a comment only when the brief names it; the tracking issue's comments are readings, each many pages long.
- **The named commits' diffs**, and a file around a hunk by range (`sed -n '<from>,<to>p'`), never whole files or a diff of every doc at once.
- **The tests' summary**: `pnpm test 2>&1 | tail -15`, then a failing test alone with `--test-name-pattern`.
- **A search bounded to what the change touches**, and a reference only at the package a commit cites. Never search `.refs` whole, `node_modules`, or a home directory.
- **Only what the change claims.** A change to a skill or a record is checked against the lines it changed, not by reading the implementation of every tool it names.

## Rounds with the Sheep

When asked to review round `<round>` of a Charge with its Sheep:

1. **Review** the checkout, as above. From round 2, check each earlier finding is answered, then what the fixes touched.
2. **Send the Sheep its defects**, directly: `herdr agent prompt binnacle-<charge> "<findings>"`, each with where, what, and how it fails, ending "fix each red-first, add commits, and settle DONE again".
3. **Report and stop.** Never wait for the Sheep: the Sheepdog starts the next round when it settles.

The Sheepdog stops after three rounds, or when a round finds nothing.

**What goes to the Sheep is only a defect against the issue as written**: a bug, a missing or wrong test, a gate, a record left behind. **What is a decision goes to the Sheepdog instead, and never to the Sheep**: work outside the issue's scope, the issue contradicting itself or the code, a choice the issue leaves open, anything that changes the author API beyond what the issue says. You never write in the Sheep's Fold, and never tell it to widen or narrow its scope.

The report to the Sheepdog is the last message: this round's findings, and for an earlier round's, the commit that answered each; what is still open; the decisions it needs, each with a recommendation; a verdict, `clean` or `findings`; and what this skill or the docs lacked.

## After the review

Say, in a few lines, what in this skill, `AGENTS.md` or the docs was missing, wrong or misleading for this review. The Sheepdog carries it to the lessons issue (#26), and a lesson that recurs moves into a skill.
