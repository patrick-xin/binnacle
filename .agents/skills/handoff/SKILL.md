---
name: handoff
description: Write what the next session needs to continue this session's work.
argument-hint: "What will the next session do?"
disable-model-invocation: true
---

# Handoff

Write the handoff to `~/.binnacle/handoff.md`, outside the checkout, so that it survives a restart. If the Maintainer said what the next session does, write for that.

The handoff holds only what no record holds. It links the rest: the intent, the issues, the branches, the task folders.

## Sections

- **Where it stands:** the stage, each task in flight with its state, and what fails.
- **Who still works:** each agent that is still running, with its role, its task and its pane, so that the next Lead prompts it instead of starting another.
- **Decided, not recorded:** each decision of this session that is in no issue, intent or ADR yet.
- **Next:** the first step, and the question for the Maintainer.

## Rules

- Never copy a privacy placeholder into the handoff. Name where the value lives.
- End by giving the Maintainer the file's path and the first line for the next session.
