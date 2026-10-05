---
name: retro
description: Read the lessons of the last Tasks, and put each one into the skill, check or record that it changes.
disable-model-invocation: true
---

# Retro

A retro improves the agents' environment: the skills, `AGENTS.md`, `CODING-STANDARD.md`, the checks and the tools. It does not judge the code. The Maintainer starts one after every four Tasks.

## Steps

1. Load the `writing-for-agents` skill.
2. List the Tasks merged since the last retro.
3. Read the lessons on each Task's issue, and the review reports in each PR.
4. Find the candidates, in the places below.
5. Show the Maintainer the list, most costly first, with the change for each one.
6. For each candidate that the Maintainer accepts, make the change as a Chore.

## Where to look

- **Records:** a fact that an agent read from code because no record holds it.
- **Checks:** a mistake that a script could find. A rule that a machine can check gets a check, not a line of prose.
- **Review:** a finding that came late, or a finding that was not a defect.
- **Hand-offs:** a wait with no signal, or a prompt that did not arrive.
- **Cost:** a call that read much to answer little.
- **Sediment:** a line in a skill that changes nothing, or that is no longer true.

## Where a change goes

- A rule that needs judgement goes in the `reviewer` skill. The Reviewer reads a diff with the least context.
- A rule for one role goes in that role's skill.
- `AGENTS.md` gets a line only when every role needs it.
