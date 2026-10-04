---
name: spec
description: Write a Build task as a GitHub issue in the spec template's shape, from an approved intent. Use when the Lead writes the tasks of a stage.
---

# Spec

A spec is the contract for one Build task. The Implementer builds from it, and the Reviewer checks against it. The template is [`.github/ISSUE_TEMPLATE/spec.md`](../../../.github/ISSUE_TEMPLATE/spec.md).

## Steps

1. Read the intent and the stage that the task serves.
2. Read the code and the records that the task touches.
3. Send each question about dsh, pi-tui or another reference to the Researcher.
4. Fill each field of the template.
5. Mark each open choice under **Decisions**, with your recommendation.
6. Publish the issue with `gh issue create --label build`.
7. Send the spec to the Reviewer for round 0.

## The fields

| Field | Holds |
|---|---|
| **Intent** | A link to the intent and the stage |
| **Behaviour** | What a person or an author can do after the change. Write one sentence for each behaviour, as a person would say it. Each sentence is the name of one test. |
| **Seams** | Where the tests observe the change, from outside. Use the fewest seams that hold every behaviour. |
| **Decisions** | Each choice that the build needs, with its answer |
| **Code shape** | The files and the layers that change. The Lead compares them with the running tasks. |
| **Records** | The docs, notes and glossary rows that change with the code |
| **Out of scope** | What the task does not do, and the issue that does it |
| **Door** | One-way or two-way, and why |
| **Review level** | The Reviewer's thinking level. The default is `medium`. |

- Order the behaviours so that each builds on the one before. The first is the thinnest one that crosses every seam.
- Cite code with its path and symbol, such as `` `binnacle:scripts/refs.mjs#plan` ``. A line number goes stale.
- If the task is too large for one branch, write two specs.
- If the door is one-way, the Maintainer agrees the spec before the build.
