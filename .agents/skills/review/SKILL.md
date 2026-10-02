---
name: review
description: How a change to binnacle is reviewed before its pull request merges — against its issue, by running it, against what binds here and against what has gone wrong here before. Load it when asked to review a branch, a pull request or a Charge, or to start or answer a round of one.
---

# Reviewing a change to binnacle

What binds is `AGENTS.md`; this skill is how to check a change against it. A review judges the change against its issue — the durable intent, or the maintainer's words as given to the reviewer where there is no issue — never against a brief, a commit message or the author's own account of what they did.

## Before reading the diff

1. **Read the issue at the change's base**: what a person can do, the maintainer's decisions, the agreed seams, the behaviours, the records to change, what is out of scope.
2. **Run it.** From the checkout under review: `CI=true pnpm install --frozen-lockfile && pnpm refs && pnpm test && pnpm build`. A red run is the first finding, with its output. Booting under the real `dsh` is not the reviewer's: a linked worktree cannot make a dsh profile, and `check:boot` runs when the maintainer builds the branch in their own checkout to try it.
3. **Look at it.** What a person sees is lines: draw the screens the issue's behaviours describe — through the tests' `drawText`, or a probe test you write and throw away — and compare them with the issue, not with the tests the change brought. Draw a changed layout at a width where its lines wrap as well: a region's rows are where a wrapped line goes wrong.

## Two axes, reported apart

A change can do exactly what its issue asks and break what binds here, or keep every rule and build the wrong thing. So the review reads it twice and reports each axis under its own heading, never merged or reranked across the two: one axis's findings must not hide the other's.

### Spec: against the issue

Quote the issue's line for each finding.

- **Missing or partial**: a behaviour the issue lists that no test names, or that the screens drawn in *Look at it* do not show.
- **Wrong**: a behaviour that looks built but draws or answers other than the issue says.
- **Out of scope**: what the change does that the issue did not ask for. It is a finding however good it is; the scope is the maintainer's.
- **The seam.** Every test sits at a seam the issue agreed. A test at another one, or inside a seam, is a finding, however green.

### Standards: against what binds here

`AGENTS.md`, the `AGENTS.md` of each folder the change touches, and the decision records it names. Each item below was a real finding here once; check each, in order. What a gate already holds is no finding.

- **Red before green, on the record.** Each commit says how each test it adds failed first, in the failure's own words; a guard says how it was broken. A test that could not have failed is a finding.
- **Expected values from outside the code.** A test that recomputes its expected value the way the code does agrees with any bug.
- **Behaviour decided where it is used, not where it belongs.** A rule a block, a registration or a module promises, decided again by each placement or caller that holds it, and differently: the host gave placed screens a scroll and placed lines none, so an ask in the composer's place was cut off (#85). Apply the *deletion test*: delete the module the rule belongs to — does the rule vanish, or reappear in each caller? A rule that reappears is a finding, even where each copy works.
- **The shape the architecture already chose.** A placement where ADR 13 places, the one key table (ADR 8) and never a manager of its own, pi-tui's windowing and selection (ADR 2). An overlay, a second key table or a global setter in their stead is a finding even when it works.
- **What more than one feature needs moves down** into a layer, never copied (ADR 5). Two copies of one piece of logic — gesture handling, say — is a finding.
- **A frame costs what changed** (ADR 10). Work at each event or frame that grows with the session — copying every fact on each arrival, redrawing every entry — is a finding: say at what length it hurts.
- **Arrays the size of a session.** Spreading one into a call (`push(...lines)`) throws past about a hundred thousand elements. Anything that can hold a log's worth of lines is pushed one at a time or concatenated.
- **Every dsh kind as dsh means it.** A kind drawn, quieted or left unread is checked against what dsh's own web shows in its chat and its trajectory, not guessed from the kind's name.
- **The author API.** A change to what `src/api.ts` exports, `Node` included, says so in its commit, and the authoring page follows it.
- **The records.** The feature's page, the glossary and the folder notes change in the same commit as what they describe, and cite rather than restate. **What you had to learn from code that no record says** — which block to use for what, who owns a behaviour, why a line is there — is a finding against the records, however right the code is.

Then the **smells**: a baseline from Fowler's *Refactoring* that holds where `AGENTS.md` says nothing. Each is a judgement call, reported as "possible <smell>" with the hunk quoted, never as a violation; where `AGENTS.md` endorses what a smell would flag, the smell is dropped.

- **Mysterious name**: a name that does not say what it holds. If no honest name comes, the design is murky.
- **Duplicated code**: one shape of logic in more than one hunk or file.
- **Feature envy**: a function that reads another module's data more than its own; it belongs with that data.
- **Data clumps**: the same few values travelling together, a type waiting to be named.
- **Primitive obsession**: a string or number standing for a concept of the glossary's.
- **Repeated switches**: the same switch on `kind` in more than one place, where one table both could read.
- **Shotgun surgery**: one change to a person's behaviour scattered across many files.
- **Divergent change**: one file edited for several unrelated reasons, the host's above all.
- **Speculative generality**: an option, parameter or hook no behaviour of the issue asks for.
- **Middle man**: a module that only passes its calls on.

## What to report

The round's report is a file, `/tmp/review-<n>-<round>.md`, written by the reviewer, under `## Spec` and `## Standards`. Each finding has:

- where: `path:line`;
- what is wrong, in one sentence;
- how it fails: the input or state, and the wrong output or crash — concrete enough to reproduce;
- whether you saw it fail, or read it.

Most severe first within each axis. From round 2, each earlier finding comes first, with the commit that answered it, or *still open*. Then the decisions the round needs (below), each with a recommendation; a verdict, `clean` or `findings`; and, in a few lines, what in this skill, `AGENTS.md` or the records was missing, wrong or misleading for this review. The Sheepdog carries that to the lessons issue (#26).

The verdict line points at the file and never carries the findings: `REPORT /tmp/review-<n>-<round>.md: findings (4)`. A verdict is one line wherever it is read, and findings on it are lost.

## The reviewer, held for the issue's life

The reviewer is of another family than the change's author, with a shell in a checkout of its own, so it can install, build, run and write probe tests without touching the author's. It commits nothing.

**One reviewer per issue, dispatched once and held** while the issue has anything to build: each round after the first is a prompt to it, and it keeps what it read in the rounds before. It is retired with the implementation, when the issue's pull request merges or closes, never after a clean round: a fix the maintainer asks for after trying the branch is its next round. The Sheepdog holds at most two reviewers at once.

**Before it is retired**, the Sheepdog prompts it once more for its feedback, across every round it held: what in this skill, `AGENTS.md`, the records or shepherd cost it a call, a round or a finding; what it had to read code to learn; and what it would change first. It writes that to `/tmp/review-<n>-feedback.md` and ends `REPORT /tmp/review-<n>-feedback.md`. The Sheepdog carries it to #26, and what is shepherd's to shepherd's field report, before retiring it.

**Which reviewer.** An issue has one reviewer, of another family than every author of its commits. Where the Sheepdog wrote any of them, alone or beside a Sheep, it is a GPT model on pi, as a shepherd Charge whose Fold is cut at the Pasture, the tip checked out there; it reads every commit of the issue, whoever wrote each. GPT on pi, codex and opencode's `openai` models share one ChatGPT usage window, so it is spent on the issues the Sheepdog wrote in. A review never runs on a lighter model than it was dispatched on; its thinking `<level>` is chosen once, at dispatch, as below:

```sh
git switch --detach <tip>
shepherd dispatch --charge review-<n> --spec '#<n>' --issue <n> \
  --model openai-codex/gpt-6.1-sol --thinking <level> --policy worktree_write \
  --verify 'pnpm install --frozen-lockfile && pnpm refs' \
  --brief "<the brief>"
```

**Thinking: `medium`, chosen once at dispatch, and held.** pi's levels are `minimal`, `low`, `medium`, `high`, `xhigh` and `max`. A review runs at `medium`. Dispatch it at `high` only where the feature is tricky: concurrency or ordering, the host's touch on the terminal, layout's geometry and regions, or a seam the author API changes. The level never changes while the reviewer is held, between rounds or for its feedback: a change of level misses the reviewer's prompt cache, and every round after pays for its whole context again.

**An issue a Sheep built alone** — glm's — is reviewed by a subagent from the Sheepdog's own harness, named `review-<n>` so each round reaches it again, in a checkout under `/tmp`:

```sh
git worktree add --detach /tmp/review-<n> <tip>
cd /tmp/review-<n> && CI=true pnpm install --frozen-lockfile && pnpm refs
```

**The brief**, either way: "Load the review skill. Round 1 of #<n>: its commits are <shas>, <whose each is>; the author is <binnacle-<charge>, or the Sheepdog>. <What is already decided.> Commit nothing; write the report to /tmp/review-<n>-1.md, and end with its verdict line."

**Each round after**, by prompt: `herdr agent prompt binnacle-review-<n> "…" --wait --until working --timeout 20000` for a Charge (a stall is the `sheepdog` skill's to handle), a message to `review-<n>` for a subagent:

> Round <round> of #<n> at <tip>: the fixes are <shas>. Move your checkout to the tip, check each round-<round-1> finding, then what the fixes touched. Report to /tmp/review-<n>-<round>.md.

On that prompt the reviewer runs `git switch --detach <tip>` in its own checkout, installs again only when the lockfile changed, and runs `pnpm test` before reading the fixes.

A temporary directory set inside the checkout (`TMPDIR`) needs `GIT_CEILING_DIRECTORIES` set to the checkout too, or git in a test's own repository finds the checkout around it.

## Keeping a review small

What each call returns stays in the context for every call after it, and a held reviewer carries it into every round.

- **The issue without its comments**: `gh issue view <n>`. Read a comment only when the brief names it; the tracking issue's comments are readings, each many pages long.
- **The named commits' diffs**, and a file around a hunk by range (`sed -n '<from>,<to>p'`), never whole files or a diff of every doc at once.
- **The tests' summary**: `pnpm test 2>&1 | tail -15`, then a failing test alone with `--test-name-pattern`.
- **A search bounded to what the change touches**, and a reference only at the package a commit cites. Never search `.refs` whole, `node_modules`, or a home directory.
- **Only what the change claims.** A change to a skill or a record is checked against the lines it changed, not by reading the implementation of every tool it names.

## Rounds with the author

1. **Review** the checkout, as above.
2. **Send the author its defects**, directly: to a Sheep, `herdr agent prompt binnacle-<charge> "<findings>"`, each with where, what, and how it fails, ending "fix each red-first, add commits, and settle DONE again"; to the Sheepdog, the report alone.
3. **Report and stop.** Never wait for the author: the Sheepdog prompts the next round when the fixes are in.

A round that finds nothing ends the rounds until new commits come. After three rounds with findings, the approach is what fails, and that is the Sheepdog's to decide with the maintainer, not a fourth round.

On shepherd's record, a reviewer's findings are the ones it raised in round 1 (`shepherd review --finding`); a new one after that is refused (exit 8). A later round's new finding reaches the author by prompt alone, stays in the round's report, and the Sheepdog checks it answered before `shepherd review --clean`.

**What goes to the author is only a defect against the issue as written**: a bug, a missing or wrong test, a gate, a record left behind. **What is a decision goes to the Sheepdog instead, and never to a Sheep**: work outside the issue's scope, the issue contradicting itself or the code, a choice the issue leaves open, anything that changes the author API beyond what the issue says. You never write in the author's checkout, and never tell a Sheep to widen or narrow its scope.
