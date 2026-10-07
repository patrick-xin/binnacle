---
name: spec
description: Write the design of one feature of a Stage as a Spec, a GitHub issue in the Spec template's shape, from an approved Intent. Use when the Lead designs the work of a Stage.
---

# Spec

A Spec is the design of one feature of a Stage, and its slices into Tickets. The Reviewer checks both in Round 0. Then the Tickets are published, and each Ticket's builder and Reviewer read the Spec as their contract. The template is [`.github/ISSUE_TEMPLATE/spec.md`](../../../.github/ISSUE_TEMPLATE/spec.md).

## Steps

1. Read the Intent and the Stage that the Spec serves.
2. Read the code and the records that the Spec touches.
3. Send each question about dsh, pi-tui or another Reference to the Researcher.
4. Fill each field of the template.
5. Mark each open choice under **Decisions**, with your recommendation.
6. Slice it into Tickets under **Tickets**, with the `tickets` skill.
7. Publish the issue with `gh issue create --label spec`.
8. Run `pnpm task start <spec>`. It sends the Spec to the Reviewer for Round 0.

## The fields

| Field | Holds |
|---|---|
| **Intent** | A link to the Intent and the Stage |
| **Problem** | What a person or an author cannot do today, as they would say it |
| **Behaviour** | What a person or an author can do after the change. Write one sentence for each behaviour, as a person would say it. Each sentence becomes the name of one test, in the Ticket that builds it. |
| **Seams** | Where the tests observe the change, from outside. Use the fewest seams that hold every behaviour. |
| **Decisions** | Each choice that the build needs, with its answer |
| **Out of scope** | What the Spec does not do, and the Spec or the Stage that does it |
| **Tickets** | Each Ticket: its title, the behaviours that it builds, and the Tickets that block it |
| **Door** | One-way or two-way, and why |

- A Stage has one Spec or more. Each Spec is one feature, and it belongs to one Stage.
- The design goes in the Spec, not in the Intent. A decision that binds more than one Spec is an ADR.
- Order the behaviours so that each builds on the one before. The first is the thinnest one that crosses every seam.
- Cite code with its path and symbol, such as `` `binnacle:scripts/refs.mjs#plan` ``. A line number goes stale.
- If the Door is one-way, the Maintainer agrees the Spec before its Tickets are built.
