---
name: review
description: How a change to binnacle is reviewed before its pull request merges — beside the Sheep building it, against its issue's design, by running it, and against what binds here. Load it when asked to review a branch, a pull request or a Charge, or when started beside a Sheep.
---

# Reviewing a change to binnacle

What binds is `AGENTS.md`; this skill is how to check a change against it. A review judges the change against its issue — the durable intent, or the maintainer's words as given to the reviewer where there is no issue — never against a brief, a commit message or the author's own account of what they did.

## Before reading the diff

1. **Read the issue at the change's base**: what a person can do, the maintainer's decisions, the agreed seams, the behaviours, the records to change, what is out of scope.
2. **Run it.** In the Sheep's Fold, which its dispatch already installed: `pnpm test && pnpm build`; install again only when the lockfile changed. A red run is the first finding, with its output. Booting under the real `dsh` is not the reviewer's: a linked worktree cannot make a dsh profile, and `check:boot` runs when the maintainer builds the branch in their own checkout to try it.
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

- **Red before green, on the record.** The Sheep says, for each test it adds, how it failed first, in the failure's own words; a guard, how it was broken. A test that could not have failed is a finding.
- **Expected values from outside the code.** A test that recomputes its expected value the way the code does agrees with any bug.
- **Behaviour decided where it is used, not where it belongs.** A rule a block, a registration or a module promises, decided again by each placement or caller that holds it, and differently: the host gave placed screens a scroll and placed lines none, so an ask in the composer's place was cut off (#85). Apply the *deletion test*: delete the module the rule belongs to — does the rule vanish, or reappear in each caller? A rule that reappears is a finding, even where each copy works.
- **The shape the architecture already chose.** A placement where ADR 13 places, the one key table (ADR 8) and never a manager of its own, pi-tui's windowing and selection (ADR 2). An overlay, a second key table or a global setter in their stead is a finding even when it works.
- **What more than one feature needs moves down** into a layer, never copied (ADR 5). Two copies of one piece of logic — gesture handling, say — is a finding.
- **A frame costs what changed** (ADR 10). Work at each event or frame that grows with the session — copying every fact on each arrival, redrawing every entry — is a finding: say at what length it hurts.
- **Arrays the size of a session.** Spreading one into a call (`push(...lines)`) throws past about a hundred thousand elements. Anything that can hold a log's worth of lines is pushed one at a time or concatenated.
- **Every dsh kind as dsh means it.** A kind drawn, quieted or left unread is checked against what dsh's own web shows in its chat and its trajectory, not guessed from the kind's name.
- **The author API.** A change to what `src/api.ts` exports, `Node` included, is named in the issue's design, and the authoring page follows it.
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

Findings go to the Sheep as you find them (*Rounds with the Sheep*, below). What you write down is the **final report**, once the rounds end: `/tmp/review-<n>.md`, under `## Spec` and `## Standards`, each holding what is still open, if anything — each with where (`path:line`), what is wrong in one sentence, how it fails concretely enough to reproduce, and whether you saw it fail or read it — and then:

- how many rounds it took, and in a line each, what the rounds found and fixed;
- the decisions the Sheepdog or the maintainer must take, each with a recommendation;
- the evidence: `pnpm test`'s summary, and the screens drawn in *Look at it*;
- a verdict, `clean` or `findings`.

The verdict line points at the file and never carries the findings: `REPORT /tmp/review-<n>.md: clean`.

## The reviewer, beside the Sheep

The reviewer is a GPT model on pi, of another family than the Sheep, started by the Sheepdog in the **Sheep's own Fold**, in a pane beside it, so it reads, builds and runs exactly what the Sheep wrote. It writes no code and commits nothing; a probe test it writes to see something fail it removes before the Sheep goes on.

**One reviewer per issue, held** while the issue has anything to build: a fix the maintainer asks for after trying the branch is its next round. GPT on pi, codex and opencode's `openai` models share one ChatGPT usage window.

**Thinking: `medium`, chosen once at start, and held.** pi's levels are `minimal`, `low`, `medium`, `high`, `xhigh` and `max`. A review runs at `medium`; the Sheepdog starts it at `high` only where the feature is tricky: concurrency or ordering, the host's touch on the terminal, layout's geometry and regions, or a seam the author API changes. The level never changes while the reviewer is held: a change misses its prompt cache, and every round after pays for the whole context again.

**The brief**, from the Sheepdog: "Load the review skill. You review #<n>, which binnacle-<n> is building in this Fold, from the issue's design. <What is already decided.> Work the rounds with it, then write the final report to /tmp/review-<n>.md and end with its verdict line."

A temporary directory set inside the checkout (`TMPDIR`) needs `GIT_CEILING_DIRECTORIES` set to the checkout too, or git in a test's own repository finds the checkout around it.

## Keeping a review small

What each call returns stays in the context for every call after it, and a held reviewer carries it into every round.

- **The issue without its comments**: `gh issue view <n>`. Read a comment only when the brief names it; the tracking issue's comments are readings, each many pages long.
- **The Fold's diff against `main`** (`git diff origin/main`), and a file around a hunk by range (`sed -n '<from>,<to>p'`), never whole files or a diff of every doc at once.
- **The tests' summary**: `pnpm test 2>&1 | tail -15`, then a failing test alone with `--test-name-pattern`.
- **A search bounded to what the change touches**, and a reference only at the package a commit cites. Never search `.refs` whole, `node_modules`, or a home directory.
- **Only what the change claims.** A change to a skill or a record is checked against the lines it changed, not by reading the implementation of every tool it names.

## Rounds with the Sheep

1. **Wait for the Sheep to say it is ready** by ending your turn: it prompts you when every behaviour is built and `pnpm test` is green, and that prompt is your next message. Never wait inside a tool call — `herdr agent wait`, a sleep, a poll: a message arriving while a tool call runs is queued as steering and reaches you only when that call ends.
2. **Review the Fold** as above, from the issue's design.
3. **Send the Sheep its defects, all at once**: `herdr agent prompt binnacle-<n> "<findings>" --wait --until working --timeout 20000`, each with where, what, and how it fails, ending "fix each red-first, and tell me when it is ready." Then wait for it again.
4. **When a round finds nothing**, write the final report and end with its verdict line; the Sheep then settles.

After three rounds with findings, the approach is what fails: stop, and write the final report with what is still open, for the Sheepdog to take to the maintainer.

**What goes to the Sheep is only a defect against the issue as written**: a bug, a missing or wrong test, a gate, a record left behind. **What is a decision goes to the Sheepdog, never to the Sheep**: work outside the issue's scope, the issue contradicting itself or the code, a choice the design leaves open, anything that changes the author API beyond what the issue says. You are no Charge and have no `ask_shepherd`: write the decisions, each with a recommendation, to `/tmp/review-<n>-ask.md`, which wakes the Sheepdog's watcher, and end your turn; the answer arrives as your next message, and the Sheepdog posts it on the issue. Never tell a Sheep to widen or narrow its scope.
