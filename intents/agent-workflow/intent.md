# Intent: agents work here in clear roles, from a plan, with one tool

Status: superseded. binnacle starts again from an empty tree, and a new intent in the playbook's shape replaces this one. This file stays as the record of the v0 design sessions.
Originator: the Maintainer. The Lead drafted it from the design sessions of 2026-10-02 and 2026-10-03.

## What is wanted

binnacle starts again from an empty tree, and this time a plan comes before the build. Agents work in clear roles. Each role has one job, one skill and known limits. A person states what they want. Agents make it into specs, build the specs, review the result and merge it. A person decides only the changes that cannot be reversed, and tries each stage before the next stage is planned.

## Why

binnacle began as a restart of the legacy composer. Both builds had the same cause of trouble: the build started before there was a plan. On 2026-10-02, four issues were built: #105, #108, #97 and #85. The flow worked, but these problems occurred:

1. **There was no plan.** Issues were written ahead of what was learned. Many became stale or came into conflict with each other. The main host test file grew to almost 4,000 lines.
2. **The channel between agents was fragile.** herdr, shepherd and the repo's skills each held a part of a task's state. No part owned the whole state.
   - The reviewer was not a Charge. It asked through files in `/tmp`.
   - A clean reviewer did not always tell the Sheep to finish.
   - A model that hung looked like it was still working, for an hour.
3. **Specs missed upstream facts.** Eight decisions came up during builds. A reading before the build would have found each one.
4. **Red-before-green failed.** The Sheep wrote most tests after their code. A break of the code showed that each test can fail. A break can be checked. The order in which tests were written cannot be checked.
5. **The Lead did too much.** The Lead wrote each commit and moved the Maintainer's checkout to try branches. Small fixes went through the full flow.
6. **Merging needed a person.** Agents make many PRs. A person should not merge each one by hand.
7. **The words drifted.** One thing had many names, and one name had many meanings. The shepherd words (Charge, Fold, Pasture) added more.
8. **Lessons only collected.** Issue #26 grew, and nothing read it back into the skills.

Changing the old docs, skills and issues to fit a new workflow costs more than writing them again.

## Constraints

- Breaking changes are accepted.
- herdr stays. Agents run in herdr panes, so a person can watch them work.
- The Implementer and the Reviewer are of different model families.
- All prose follows STE (`STE.md`). Documents that agents load also follow the `writing-for-agents` skill.
- This intent covers how agents work. What binnacle is, and its stages, is the product intent. The product intent comes after this one.

## The fresh start

- **Keep the repository.** Tag today's `main` as `v0`. Start `main` again from an empty tree. The name, the npm package and the GitHub home stay.
- **Use v0 as a read-only reference.** `pnpm refs` fetches it into `.refs/binnacle-v0` at its tag. A spec cites it as `binnacle-v0:path`, and it can port a part on purpose. These parts are worth porting:
  - the readings of dsh and pi-tui;
  - the generic gates;
  - the copied presets and their drift gate;
  - the theme file, dusk and the author skill's theme chapter.
- **Close every open issue with the label `v0`.** The product intent reads them as input. No issue moves to the new plan one to one.

## Roles

| Role | Does | Never does |
|---|---|---|
| **Maintainer** | Approves intents. Tries each stage and approves the next one. Decides one-way doors. | Merges a two-way PR by hand. |
| **Lead** | Drafts intents with the originator. Writes specs. Answers questions. Checks results against specs. Builds fixes and chores. | Writes code in the Build lane. |
| **Implementer** | Builds one spec in its own worktree. Writes the commit message. | Changes the spec. Merges. |
| **Reviewer** | Reviews a spec before the build (round 0) and the diff after it. Gives a verdict. | Writes code. Decides scope. |
| **Researcher** | Answers one question from the references. | Writes code. |

## From intent to merge

### Intents and stages

1. The originator and the Lead brainstorm with the `grill` skill.
2. The Lead writes `intents/<slug>/intent.md` in the originator's words. Supporting files stay beside it.
3. The originator approves the intent.
4. The intent names its stages, in one line each. A stage ends in a behaviour that a person can try under `dsh`. A stage usually has one to four specs.
5. The Lead writes specs for the current stage only.
6. When all the specs of a stage are merged, the Maintainer tries the stage. Then the Maintainer approves the next stage, or changes the intent.
7. If the intent was wrong, the Lead edits `intent.md` and the Maintainer approves the edit. If the change is large, the Lead and the Maintainer use `grill` again.
8. An intent is done when its last stage is merged and tried. The intent stays in the repo as the record of why.

### Lanes

The Lead chooses a task's lane when the issue is filed. A task can move up a lane. It never moves down.

| Lane | When | Who builds | Review | Issue |
|---|---|---|---|---|
| **Fix** | A two-way door, and one behaviour that is wrong today. No change to the author API. No new decision. Two source files at most. | The Lead, in its own worktree | One round by the Reviewer at `medium`. No round 0. | The wrong behaviour, the right behaviour, and the test that shows it. |
| **Chore** | Records, a dependency bump or a gate. Nothing that a person or an author sees changes. | The Lead | None. The gates and CI only. | One line about the change. |
| **Build** | All other work | The Implementer | Round 0, then rounds | A full spec, from an intent |

- **Moving up a lane.** If a fix needs a decision or a third source file, the Lead stops and moves the task to Build. The Lead does not make a fix larger.
- **The Lead's limit.** The Lead builds one fix at a time. A fix counts in the limit of three things in flight.

### The Build lane

1. The Lead writes the spec as a GitHub issue, from one template. The spec has these fields:
   - Behaviour
   - Seams
   - Decisions
   - Code shape
   - Records
   - Out of scope
   - Door
   - Review level

   The intent lists its specs, and each spec links its intent.
2. The Maintainer agrees a one-way spec before it is built. The Lead decides a two-way spec, and the Maintainer may object.
3. In round 0, the Reviewer checks the spec. It checks only three things:
   - each claim about upstream, against its reference;
   - each move between layers, against `layers.json`;
   - each decision the build will meet that the spec does not answer.
4. A decision made during the build changes the spec body. A comment on the issue links to the change.
5. The Implementer builds and commits freely.
6. The Reviewer reviews in rounds until a round is clean. One clean round is enough. The limit is three rounds. After the third round, the Lead decides. Either one narrow round more follows, or the question goes to the Maintainer.
7. `task land` squashes the commits into one, with the Implementer's message, and opens the PR.

## The task tool

The repo owns a task tool, `scripts/task/`, which replaces shepherd. It talks to herdr directly.

- **State** lives in `~/.binnacle/tasks/<n>/`, one folder for each task. Worktrees live in `~/.binnacle/worktrees/<n>`. The checkout stays clean.
- **Each state has one owner.**
  - Only the Implementer sets `building` and `ready`.
  - Only the Reviewer sets `changes` and `approved`.
  - Any agent sets `blocked` with `task ask`. Only the Lead clears it, with `task answer`.
- **The tool sends the hand-off prompts.** `ready` prompts the Reviewer. `changes` and `approved` prompt the Implementer.
- **`task watch`** wakes the Lead on a change of state or a question. It also wakes the Lead when an agent shows "working" but its session log has not changed for 20 minutes.
- **The Reviewer's thinking level** is named in the spec, and `medium` is the default. The Maintainer may change it for the budget. The tool does not set it.
- **The commands** are `start`, `status`, `ask`, `answer`, `watch`, `land` and `stop`. The Fix lane uses `start` with the Lead as the builder.

## Tests and commits

- **A test is proven when a break of the code that it covers makes it fail.** The PR's *Checked* list records each break and its failure message. Writing the test first is advice.
- **The commit message** says these things:
  - what changed for a person or an author;
  - why it changed;
  - the change to the author API;
  - the decisions taken;
  - `Closes #<n>`.

  The proof of each test goes in the PR, not in the commit.

## Doors and merging

- **A PR is a one-way door if it does one of these things:**
  - changes the author API snapshot;
  - changes the dsh services or packages in `layers.json`;
  - adds an ADR, or changes the status of an ADR;
  - moves a pin;
  - makes a major changeset;
  - changes a format that a person keeps, such as the theme schema, the profile or the presets;
  - changes a release workflow.

  This list stays open while the project is young. `check:door` reads it from one file.
- **Every other PR is a two-way door.** `task land` sets auto-merge, and GitHub merges the PR when CI passes.
- **A one-way PR** gets a label, and the Maintainer merges it.
- **If the spec and `check:door` give different doors,** the door is one-way.
- **CI runs on every pull request.**
- **Branches are tried in `~/.binnacle/try`.** The `binnacle` dsh profile links this worktree. The Lead drives every PR that changes what binnacle draws or boots under `dsh` before it merges.

## Records, skills and prose

- **`AGENTS.md`** keeps only the facts that apply to every role: what binnacle is, the commands, the layers, the one root, the upstream seams, and a table of roles. Each role's rules and checks go in its role skill.
- **Skills, 13 in total:**
  - **Role skills:** `lead`, `implementer`, `reviewer` and `researcher`. Each role loads its own skill first. Each role skill ends with its exit checks.
  - **Process skills, which the Maintainer starts:** `grill`, `spec`, `triage`, `retro` and `handoff`.
  - **Shared skills:** `tdd`, `writing-for-agents`, `diagnosing-bugs` and `architecture`.
- **Prose:** `STE.md` is a record. A `check:prose` gate checks the rules that a machine can test, on changed lines only. The Reviewer checks the other rules.
- **Glossary:** `docs/glossary.md` is for a person and an author. `docs/agents.md` is for the roles and the task words. A `check:terms` gate refuses retired words.
- **Lessons:** `retro` runs after every four tasks. It puts each lesson into the role skill that it changes.

## Still open

The Lead and the Maintainer settle these before the stage that needs them:

1. **Parallel tasks.** A spec could list the files it touches, and `task start` could refuse a task that touches a running task's files.
2. **Decisions taken for the Maintainer.** Either they collect in one list to ratify, or each one takes the door of the spec it changes.
3. **File size.** A gate could warn when a file passes a limit, such as 800 lines.
4. **The Lead's context.** A Lead session could end after a set number of tasks. The task state and `handoff` would carry on the work.

## Out of scope

- What binnacle is and its stages. That is the product intent, which comes next.
- The names for boxes (ask, show, offer, block). The product intent decides them. `GLOSSARY-PROPOSAL.md` and the boxes report go beside it as input.

## Stages

1. **The fresh start and the records.** Tag `v0`, empty `main`, close the issues, and write:
   - `AGENTS.md`;
   - the role and process skills;
   - `STE.md` as a record;
   - `intents/`;
   - the spec template;
   - the port of the generic gates.

   The Maintainer tries it by reading the records and starting a `grill`.
2. **The task tool.** The old flow builds it, one last time: a Sheep and a reviewer through shepherd. The Maintainer tries it on one Fix.
3. **Merging.** CI on PRs, `check:door`, auto-merge and the try worktree. The Maintainer tries it on a two-way PR that merges with no person.
4. **Words.** The glossary pages, `check:terms` and `check:prose`.

Only stage 1 is specced now.
