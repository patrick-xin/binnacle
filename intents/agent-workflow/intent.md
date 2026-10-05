# Intent: agents build binnacle in clear roles, from a plan

- **Author:** Patrick Xin
- **Role:** Maintainer
- **Status:** approved
- **Date:** 2026-10-03

## Problem

Agents write most of binnacle's code, reviews and records. Without a plan and clear roles, these problems occur:

1. **Work starts before a plan exists.** Issues are written ahead of what the team learns. They become stale, or they come into conflict with each other. Files grow large.
2. **No one part owns a Task's state.** The terminal panes, the dispatch tool and the skills each hold a part of it. Agents stop and wait without a signal. A model that hangs looks like it is still working.
3. **Designs miss facts about upstream.** The builder meets decisions halfway through the build, and the build stops while someone answers them.
4. **The tests do not prove enough.** No one can check after the build whether a test was written before its code.
5. **The coordinator does too much.** It writes each commit and moves the Maintainer's checkout to try branches. Small fixes go through the full process.
6. **Each merge waits for a person.** Agents make many pull requests in a short time.
7. **Words drift.** One thing has many names, and one name has many meanings.
8. **Lessons are not used again.** They collect in one place, and no one reads them back into the instructions.

## Proposed outcome

1. Every change starts from an approved Intent. The Intent names Stages. Each Stage ends in a behaviour that the Maintainer can try.
2. Each agent has a role with one job and known limits. Each role has its own skill, and it loads shared skills such as `tdd` when it needs them.
3. The work is sized. A small fix uses a short path, and a feature uses the full path.
4. One tool owns the state of each Task. The tool moves work between roles and tells the coordinator when work stops.
5. Each design is checked against the References before anyone builds it.
6. A test is proven when a break of the code that it covers makes the test fail.
7. A change that can be reversed merges with no person. Only a change that cannot be reversed waits for the Maintainer.
8. All prose follows one writing standard, and each word has one meaning.
9. Lessons go back into the role instructions at regular times.
10. The Maintainer reviews a long document in one view. The Lead receives the Maintainer's edits and comments together.

## Affected users and systems

- **The Maintainer:** approves Intents, tries each Stage, and decides the changes that cannot be reversed.
- **The agents:** the coordinator, the builders, the reviewers and the researchers.
- **herdr:** the terminal panes where agents run, when they do not run headless.
- **The agent tools:** pi, Claude Code and Codex today. A setting names the tool and the model for each role. When binnacle has enough features, an agent in binnacle can take a role too.
- **GitHub:** issues, pull requests, labels, CI and auto-merge.
- **The repository:** `AGENTS.md`, the skills, the records and the gates.

## Constraints

1. Breaking changes are accepted.
2. An agent runs in a herdr pane, where the Maintainer can watch it, or it runs headless.
3. A builder and its reviewer are of different model families. One exception: a subagent of the builder can review a small fix.
4. The reviewer's model is used through a subscription with a usage limit. The Maintainer sets each review's thinking level for that budget.
5. All prose follows STE (`STE.md`). Documents that agents load also follow the `writing-for-agents` skill.
6. A person merges only a change that cannot be reversed.
7. The workflow does not depend on a dispatch tool that the repository does not own.
8. No role depends on one agent tool or one model. For example, a GPT model can be the coordinator.

## Stages

Each Stage ends in a behaviour that the Maintainer can try. The coordinator writes the Specs for the current Stage only.

1. **The records.** The repository starts again from an empty tree, with the instructions for each role. The Maintainer reads them and starts a brainstorm for the binnacle Intent. Specs: #123, #124, #125, #126.
2. **The Task tool.** One tool moves a Task between roles. The Maintainer tries it on one small Task. Specs: #133, #137, #141. Fix: #139.
3. **Merging.** A change that can be reversed merges with no person. The Maintainer sees one merge with no person, and one change that waits.
4. **Words.** The checks refuse a retired word and a sentence that breaks STE. The Maintainer sees both refusals.

## Decisions

These answer the open questions of the first draft.

1. Two Tasks do not change the same files at the same time.
2. A decision that the coordinator takes for the Maintainer is written as an ADR. An ADR cannot be reversed, so the Maintainer merges it.
3. A file that is longer than 800 lines causes a warning, not a failure.
4. One file lists the kinds of change that cannot be reversed. A change to that file cannot be reversed either.

## Open questions

None.
