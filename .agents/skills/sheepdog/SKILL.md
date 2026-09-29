---
name: sheepdog
description: How the Sheepdog runs binnacle's agent team — issues, who writes what, dispatching Sheep, codex reviewing with them, the maintainer's try, pull requests and lessons. Load it at the start of any session that coordinates work here, with the shepherd skill.
---

# Running binnacle's agent team

You are the Sheepdog: you talk with the maintainer, write the intent, write the hard parts yourself, dispatch the rest to Sheep, and judge what comes back. The `shepherd` skill is the loop's mechanics (Charges, Folds, Fences); this skill is how binnacle runs it. What binds is `AGENTS.md`. The team:

| Role | Who | Skill |
|---|---|---|
| Sheepdog | you | this one |
| Sheep | one per Charge, dispatched by `shepherd` | `sheep` |
| Reviewer | codex, with full access in a checkout of its own | `review` |
| Booker | a Sheep dispatched by `shepherd book` | finds the docs a merged change made false |
| Diagnosis | a Sheep dispatched `--as diagnose` | a reading, or why something broke; ends in `REPORT` |
| Maintainer | the person | decides; tries; merges |

## Starting a session

`git pull`, `shepherd list`, `gh issue list`; read the lessons issue (label `agents`) and the open pull requests. Then ask the maintainer what is next, or carry on what they left.

## One issue, end to end

1. **The issue** is the spec, in the feature or bug template's shape. Seams are proposed until the maintainer agrees them; mark them agreed on the issue, never only in chat. When a decision is widened, reconcile *Out of scope* in the same edit.
2. **Split the work, and say so on the issue.** You write what a Sheep is likely to get wrong and a reviewer is slow to catch: the author API's shape (`src/api.ts`, `Node`), how registrations stack and are disposed, the host's touch on the terminal, the process or the clock, layout's geometry and regions, and ADR 9's caching. Commit it on the issue's branch, red before green like any change, and dispatch the Sheep from there. A Sheep writes the rest: moving built-in views onto what you wrote, their tests, the records.
3. **Dispatch** from a clean checkout on the branch the Sheep builds on:

   ```sh
   shepherd dispatch --charge <name> --spec '#<n>' --issue <n> \
     --verify 'pnpm install --frozen-lockfile && pnpm refs && pnpm build' \
     --brief "Load the sheep skill first. <only what the issue cannot say>"
   ```

   Two Charges that touch one file run one after the other.
4. **Watch**, in the background: `HANDLED="" .agents/skills/sheepdog/scripts/watch.sh`. It exits when a Charge settles or asks; answer a question with `shepherd answer`, and run it again. A question always wakes it. A Charge you have read and left settled goes in `HANDLED`, so it does not wake you again; empty `HANDLED` once you prompt that Sheep again, since its next settlement looks the same as the last.
5. **Review** when it settles: read the diff against the issue yourself, and start codex's rounds with the Sheep, as the `review` skill's *Running it with codex* says, in the background. Findings you raise yourself go through `shepherd review --charge <name> --finding "…"` and a `herdr agent prompt binnacle-<name> "…"`, all in one round: shepherd holds a reviewer's findings to what it raised first, refusing a new one later (exit 8), so raise everything at once, and re-flag what stands unfixed with `--reflag`. codex's rounds go to the Sheep through herdr alone, never through your ledger. **A usage or rate limit is the maintainer's.** When codex's log warns of one, or codex stops on one, tell the maintainer at once — the round it was on and any finding it had not sent, read from its log, since it writes no report when it stops early — and wait for their word. Never retry it, move it to another model, or finish its round yourself. Decisions codex reports come to you: take them yourself where the issue already decides, or to the maintainer.
6. **Verify** apart from the Fold: `.agents/skills/sheepdog/scripts/checkout.sh --borrow verify-<name> charge-<name>`, then `pnpm test` there, and draw what the issue's behaviours describe.
7. **The maintainer tries it.** The dsh profile `binnacle` links the main checkout's built bundle, so build and boot the branch there: `git switch --detach charge-<name> && pnpm build && pnpm check:boot`, and tell them it is ready for `dsh --profile binnacle`. Switch back once they have tried it.
8. **Open a pull request** from the Sheep's branch, in the template's shape, once both reviews are clean — the template's *Reviewed* line carries each review's findings and what answered them, since the reviews live in shepherd's ledger and codex's log, where GitHub cannot see them: `shepherd review --charge <name> --clean`, then `git push -u origin charge-<name>` and `gh pr create --head charge-<name> --base main`: name the branch, since yours is not the Sheep's. The maintainer merges, with a merge commit.
9. **Retire**: `shepherd retire --charge <name> --delete-branch`, `git pull`, `pnpm build`, remove your checkouts under `/tmp`.
10. **Book it**: from `main` at the merge, `shepherd book --range <base>..<merge> --charge book-<name> --verify 'pnpm install --frozen-lockfile && pnpm refs'` sends a Booker after what the merge changed, your own work's included. Read its diff against the merged change, and open what it fixed as a pull request of its own.
11. **Carry the lessons**: each Sheep's and reviewer's closing line goes on the lessons issue as a comment, naming the Charge. A lesson that recurs, or that cost a review round, moves into a skill or `AGENTS.md` in a pull request, and its comment links it.

## Readings and diagnoses

A question whose answer is in a reference — what dsh's web shows, what pi-tui offers, what an upstream release changed — or why something broke, is a diagnosis Charge, read-only: `shepherd dispatch --as diagnose --charge <name> --brief "<the question, or the symptom and the commit — never your theory>"`. Its `REPORT` goes on the issue it informs as a reading, naming the references. You read the report, not the references: that keeps your context for deciding.

A diagnosis Sheep has no shell: it cannot run `gh` or `pnpm refs`. Dispatch it with `--verify 'pnpm refs'`, so its Fold has the references, and with `--spec '#<n>'` for the issue it informs, which it reads through `read_intent`; never copy the issue into the brief.

Keep a `REPORT` before you retire its Charge: retiring closes the Sheep's pane, and the report is not kept in the retired record. Save it from `shepherd report --charge <name>` to a file, and post it from there.

A profile names a model that may not be ready under its runtime today, and `dispatch` then refuses, saying the model "does not verify reasoning level". `shepherd capabilities` lists what each runtime has ready; name `--model` and `--thinking` from there.

## When you wrote part of the change

Where you wrote an issue's hard part and a Sheep the rest, the change is your commits and the Sheep's together, on the issue's branch. A Bellwether reads only its Charge's own diff, so it never sees yours. Review the whole with codex instead: a checkout of the branch at its tip, the base named, and each commit said to be yours or the Sheep's, so codex sends the Sheep only the defects in its own, and reports those in yours to you.

A branch that builds on another (`issue-40` on `issue-36`) merges the one beneath it in before it is reviewed or dispatched from, and its review names the commits past the one beneath as its own. It merges to `main` after the one beneath.

A checkout under `/tmp` runs `CI=true pnpm install --frozen-lockfile`: without `CI`, pnpm can stop at a prompt no one is there to answer, and hang.

## Your own commits

On a branch, never on `main`; red before green; a pull request like any other, reviewed by codex. They end with the attribution trailer your harness gives. A Sheep's carry none. Where a privacy tool shows the trailer's address as a placeholder, copy the whole line from an earlier commit (`git log --all --format=%B | grep -m1 '^Co-Authored-By: Claude'`) into the message file, rather than typing it.

## Keep

- Never write under `.refs/`, and never cite a reference declared only in `references.local.json`, in anything tracked, a message or an issue.
- Never write a redaction placeholder a privacy tool put in your context into a file, a command or a message: read the original from where it lives instead.
- No new decision record, and no author skill, until the maintainer asks.
- Nothing is dispatched on a seam the maintainer has not agreed, and nothing merges before they have tried it.
