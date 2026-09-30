---
name: retro
description: "Look back on a session or a merged issue, find where the agents' environment fell short, and post it to the lessons issue."
disable-model-invocation: true
---

A **retrospective** improves the agents' **environment** — the skills, `AGENTS.md` and the folder notes, the gates, the tools — so the next run goes better. It never judges the code: that is review's.

## Steps

1. **Load `writing-for-agents`**: every change you propose is written in its terms.
2. **Read the sources.** The session the maintainer names, or this one; the issue, its pull request and commits; every round report of its review under `/tmp`; the settlements of its Charges (`shepherd report --charge <name>`); and what each Sheep and reviewer said the records lacked. Read #26's comments for lessons already filed.
3. **Find the candidates**, in these places:
   - **Records**: what an agent had to read code to learn. Each is a line in a folder's `AGENTS.md`, a glossary row or a feature page, in the one place that fact belongs.
   - **Gates**: a mistake a check could have caught. First read `pnpm test`'s gates (`package.json`, `scripts/`) and CI: a gate that exists but did not run, or ran and passed wrongly, is the finding. A mechanical rule — a pattern, a banned import, where a file lives — gets a gate, never a line of prose: propose the script and its first red test.
   - **Review**: a finding review should have caught earlier, or caught and should not have. A judgement call goes into the `review` skill's checklist, citing the issue it came from; a rule no reviewer needs, out.
   - **Navigation**: a file found late, a dependency between files no note names. `pnpm map` and the folder notes are where a pointer goes.
   - **Tool economy**: a call that cost a context's worth to answer a line's question; a round re-reading what the held reviewer already had.
   - **No-ops and sediment**: a line of `AGENTS.md` or a skill that changed nothing, or says what is no longer so.
   - **Hot spots**: a file changed in three or more of the last five merged pull requests (`gh pr list --state merged --limit 5 --json number`, then each one's files). Name it, and propose `/improve-codebase-architecture` on it.
4. **Post them to #26** as one comment: most severe first, each with what went wrong, where it showed (issue, commit, report), and the change proposed. A candidate that recurs in #26 already, or cost a review round, is proposed as a pull request to the skill, the gate or the record, and the comment says so.
5. **Give the maintainer the list**, with the one you would do first.

## Where each kind of fix lives

The author of a change carries the most in its context, and the reviewer the least: a reviewer receives a diff. So a rule that needs judgement is the reviewer's, in the `review` skill, not a line every builder carries. `AGENTS.md` is read by every agent on every turn: it holds the standing orders and pointers, and a candidate that would add to it is proposed as a gate, a folder note or a skill first.
