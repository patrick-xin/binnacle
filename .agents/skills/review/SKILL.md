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

## Running a review

The Sheepdog runs a second reviewer, of another family than the change's author, with a shell in a checkout of its own, so it can install, build, run and write probe tests without touching the Sheep's Fold. It commits nothing, and reports once.

**One run is one round.** A model is sent the whole conversation again on every call, so a review costs its calls times the size its context has grown to, and a round kept alive across the Sheep's fixes pays the first round again on every call of the second. On one change here, one reviewer ran 93 calls and 11M input tokens, and three reviews at once used up the account's usage window. So a round ends when its findings are sent, and the next is a new run that starts from them.

**A Sheep's work** — glm's — is reviewed by a subagent from the Sheepdog's own harness, in a checkout under `/tmp`:

```sh
git worktree add --detach /tmp/review-<name> <tip>
cd /tmp/review-<name> && CI=true pnpm install --frozen-lockfile && pnpm refs
```

then a subagent, told to load this skill, with the brief below and the checkout's path.

**The Sheepdog's own commits** are reviewed by a GPT model on pi, as a shepherd Charge whose Fold is cut at the Pasture, the tip checked out there. GPT on pi, codex and opencode's `openai` models share one ChatGPT usage window, so these runs are kept for the Sheepdog's commits alone, lean, and a round that only checks fixes takes a lighter model (`gpt-5.6-luna`, `medium`):

```sh
git switch --detach <tip>
shepherd dispatch --charge review-<name>-<round> --spec '#<n>' --issue <n> \
  --model openai-codex/gpt-5.6-sol --thinking high --policy worktree_write \
  --verify 'pnpm install --frozen-lockfile && pnpm refs' \
  --brief "<the brief>"
```

**The brief**, either way: "Load the review skill. Round <round> of #<n>: its own commits are <shas>, <whose each is>; the Sheep is binnacle-<charge>. <From round 2: round <round-1>'s findings are in /tmp/review-<name>-<round-1>.md, answered by <shas>.> <What is already decided.> Commit nothing; report once." Save the report to `/tmp/review-<name>-<round>.md`.

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
3. **Report and stop.** Never wait for the Sheep: the Sheepdog starts the next round, as a new Charge, when it settles.

The Sheepdog stops after three rounds, or when a round finds nothing.

**What goes to the Sheep is only a defect against the issue as written**: a bug, a missing or wrong test, a gate, a record left behind. **What is a decision goes to the Sheepdog instead, and never to the Sheep**: work outside the issue's scope, the issue contradicting itself or the code, a choice the issue leaves open, anything that changes the author API beyond what the issue says. You never write in the Sheep's Fold, and never tell it to widen or narrow its scope.

The report to the Sheepdog is the last message: this round's findings, and for an earlier round's, the commit that answered each; what is still open; the decisions it needs, each with a recommendation; a verdict, `clean` or `findings`; and what this skill or the docs lacked.

## After the review

Say, in a few lines, what in this skill, `AGENTS.md` or the docs was missing, wrong or misleading for this review. The Sheepdog carries it to the lessons issue (#26), and a lesson that recurs moves into a skill.
