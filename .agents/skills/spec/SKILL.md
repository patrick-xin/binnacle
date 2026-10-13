---
name: spec
description: Write the design of one feature of a Stage as a Spec, a GitHub issue in the Spec template's shape, from an approved Intent. Use when the Lead designs the work of a Stage.
---

# Spec

A Spec is the design of one feature of a Stage, and its slices into Tickets. The Reviewer checks both in Round 0. Then the Tickets are published, and each Ticket's builder and Reviewer read the Spec as their contract. The template is [`.github/ISSUE_TEMPLATE/spec.md`](../../../.github/ISSUE_TEMPLATE/spec.md).

## Steps

1. Read the feature's Intent, its doc in `docs/features/`, and the product's Stage that the Spec serves.
2. Read the code and the records that the Spec touches.
3. Send each question about dsh, pi-tui or another Reference to the Researcher.
4. Fill each field of the template.
5. Write the Journeys. Walk each behaviour's edges, as *Edges* below says. Each edge gets a behaviour or a decision.
6. Answer each open choice under **Decisions**, with its reason.
7. Slice it into Tickets under **Tickets**, with the `tickets` skill.
8. Publish the issue with `gh issue create --label spec`.
9. Run `pnpm task start <spec>`. It sends the Spec to the Reviewer for Round 0.

## The fields

| Field | Holds |
|---|---|
| **Intent** | A link to the feature's Intent, and the product's Stage |
| **Problem** | What a person or an author cannot do today, as they would say it |
| **Behaviour** | What a person or an author can do after the change. Write one sentence for each behaviour, as a person would say it. Each sentence becomes the name of one test, in the Ticket that builds it. |
| **Journeys** | What a person does with the feature in a real session under dsh, from start to end: each step that they type, click or read, and what they do next. Name the other features that share the screen on the way. The Maintainer tries each Journey once the Spec merges. A Spec that changes nothing a person sees has none. |
| **Seams** | Where the tests observe the change, from outside. Use the fewest seams that hold every behaviour. |
| **Decisions** | Each choice that the build needs, with its answer |
| **Out of scope** | What the Spec does not do, and the Spec or the Stage that does it |
| **Tickets** | Each Ticket: its title, the behaviours that it builds, and the Tickets that block it |
| **Door** | One-way or two-way, and why |

- A Stage has one Spec or more. Each Spec is one feature, and it belongs to one Stage.
- The design goes in the Spec, not in the Intent. A decision that binds more than one Spec is a candidate ADR: the Lead offers it to the Maintainer after the try.
- Each Ticket names the feature doc that it changes, as one of its records.
- Order the behaviours so that each builds on the one before. The first is the thinnest one that crosses every seam.
- Cite code with its path and symbol, such as `` `binnacle:scripts/refs.mjs#plan` ``. A line number goes stale.

## Edges

Round 0's findings are most often an edge that no behaviour names. For each behaviour, say what happens:

- **At the ends:** the first and the last item, and a move past them.
- **With nothing:** no item, no option, an empty answer.
- **With too much:** more than the screen holds, a long line, a narrow terminal.
- **When it goes part-way:** the thing is withdrawn, replaced or unloaded while it is shown, or while it waits.
- **When it is another's:** another agent's, another Place's, or a stored session's.
- **After it:** where the Focus and the keys are when it ends, and what the person does next. A person who must click or press a key only to get back to where they were is a finding.
- **Beside another feature:** another feature that shares the screen, the keys or the clicks, such as a click on the transcript while the person types in the composer.

Then hold each behaviour to what the Intent promises a person. A person reads what happens without dsh's data, such as raw JSON, and binnacle does at least what a plain terminal does, such as selecting and copying text.
