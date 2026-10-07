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
9. **A pull request cannot be read alone.** binnacle's Stage 2 had no Spec and no issue for each slice. Its design went into the Intent, and its PRs name "slice 4" and "decision 14". A person or an agent must find and read other records to know what a PR does and why.
10. **The process fits one builder only.** A Build Task needs a pi Implementer in a herdr pane, and a Round 0 for each Task. When the Lead builds, it goes around the Task tool.

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
11. A Spec holds the design of one feature of a Stage, and its Tickets slice it. A person or an agent reads a PR, and it says what changed, why, and where it fits.
12. The Lead, a Claude Code subagent or a pi agent builds a Ticket, through the same Task tool. The Maintainer chooses the model of each role for a session.

## Affected users and systems

- **The Maintainer:** approves Intents, tries each Stage, and decides the changes that cannot be reversed.
- **The agents:** the coordinator, the builders, the reviewers and the researchers.
- **herdr:** the terminal panes where agents run, when they do not run headless.
- **The agent tools:** pi, Claude Code and its subagents, and Codex today. A setting names the tool and the model for each role. When binnacle has enough features, an agent in binnacle can take a role too.
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
3. **Specs and Tickets.** A Spec holds the design of one feature, and its Tickets are sub-issues with blocking edges. The `tickets` skill begins as Matt Pocock's `to-tickets`. The Task tool takes the builder and the Reviewer that the Maintainer names. The Maintainer tries it on binnacle's Stage 3: one Spec, its Tickets, a Ticket built by a subagent, and a PR that reads alone.
4. **Merging.** A change that can be reversed merges with no person. The Maintainer sees one merge with no person, and one change that waits.
5. **Words.** The checks refuse a retired word and a sentence that breaks STE. The Maintainer sees both refusals.

## Decisions

These answer the open questions of the first draft.

1. Two Tasks do not change the same files at the same time. Decision 11 replaces this.
2. A decision that the coordinator takes for the Maintainer is written as an ADR. An ADR cannot be reversed, so the Maintainer merges it.
3. A file that is longer than 800 lines causes a warning, not a failure.
4. One file lists the kinds of change that cannot be reversed. A change to that file cannot be reversed either.

These answer the design of Stage 3, from the grill of 2026-10-06.

5. **Spec.** A Spec is one GitHub issue for one feature of a Stage. A Stage has one Spec or more. A Spec holds its Intent and Stage, the problem, the behaviours, the seams, the decisions, what is out of scope, and the Door.
6. **Ticket.** A Ticket is one vertical slice of a Spec: a sub-issue of it, with `gh issue create --parent`. It holds its Spec, what the Maintainer can try when it merges, its behaviours as the names of its tests, its records, the Tickets that block it, its Door and its review level. A Ticket names no file path.
7. **Task** is the word for each issue that is built: a Ticket, a Fix or a Chore. The Build Lane holds the Tickets.
8. **The design** goes in the Spec. The Intent holds only what is wanted, why, and in which Stages. An ADR holds a decision that binds more than one Spec.
9. **Round 0** checks the Spec, with its Tickets (decision 20). `task start <spec>` starts it. `task build <ticket>` refuses until the Ticket's Spec is approved. A Ticket's Rounds start at Round 1.
10. **Code shape** goes away, with the check of overlapping files.
11. **Blocking edges** order the Tickets, with `--blocked-by`. Two Tickets with no edge between them can be built at the same time. If both change one shared file, the Lead adds an edge.
12. **The builder** of a Ticket is the Lead, a Claude Code subagent, or a pi agent on any model. The Maintainer names the model of each role at the start of a session, or before the builder writes code. With no name, `.agents/roles.json` holds the default.
13. **The tool takes the choice** as flags, and records it for each Task: `task start <spec> --reviewer <runner>:<model>`, and `task build <ticket> --by lead|subagent:<model>|pi:<model>`.
14. **One state machine** serves each builder. For the Lead and a subagent, the tool starts no agent, and the Lead sets the Implementer's states with `--as implementer`. The Reviewer's Hand-offs, the Rounds and `task land` do not change.
15. **The Reviewer** runs through pi, in herdr or headless with `--session-id`, or as a Claude Code subagent that the Lead continues between Rounds.
16. **Blind review.** No prompt to the Reviewer names the builder. A builder's commits have no model trailer, and `task land` adds it. The Reviewer does not read `agents.json`.
17. **Families.** The tool finds a model's family from its provider. It refuses a builder and a Reviewer of one family, unless the Lead passes `--same-family`.
18. **A PR reads alone.** Its title says what a person or an author can do now. Its Summary starts with where it fits: "Ticket 2 of 4 of #160, Stage 3". It quotes each decision that it follows, and does not name only its number. It ends with `Closes #<ticket>` and `Part of #<spec>`.
19. **Order.** This is Stage 3 of this Intent. binnacle's Stage 3 waits for it, and is its first Spec.

These come from binnacle's Stage 3, on 2026-10-06, before its first Ticket.

20. **Round 0 checks the slicing.** A Spec holds its Tickets: each one's title, its behaviours and its blocking edges. Round 0 checks them with the Spec, and the Maintainer agrees to both at once. An approved Spec goes back to `spec` for another pass until a Ticket of it is built.
21. **One Reviewer for each Spec.** The Reviewer of a Spec's Round 0 reviews each Round of its Tickets, in the Spec's checkout. Each Round still names one Ticket and its commits, so the Reviewer checks a small diff with the whole Spec in mind. It stops with the Spec, after the last Ticket.
22. **A session continues.** An agent that the tool starts again continues its pi session, so a closed tab or a crash loses nothing.
23. **A fresh Reviewer** starts from a copy of the Spec Reviewer's session: `task build --fresh-reviewer`. The Lead uses it for two Tickets of one Spec in review at once, or for a Reviewer that has reviewed long and may have grown lenient.

## Open questions

None.
