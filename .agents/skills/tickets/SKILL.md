---
name: tickets
description: Slice a Spec into Tickets, in its Tickets section for Round 0, then publish each as a sub-issue with its blocking edges. Use when the Lead turns a Spec into the work of a Stage.
---

# Tickets

A Ticket is one vertical slice of a Spec: a sub-issue of it, built on one branch and merged in one PR. The template is [`.github/ISSUE_TEMPLATE/ticket.md`](../../../.github/ISSUE_TEMPLATE/ticket.md).

## Steps

1. Read the Spec with `gh issue view <spec>`: its behaviours, its seams and its decisions.
2. Read the code that the Spec touches. Find each prefactor: a change that makes the rest easy. "Make the change easy, then make the easy change."
3. Draft the Tickets, as the rules below say.
4. Give each Ticket its blocking edges: the Tickets that must merge before it starts.
5. Write the draft in the Spec's **Tickets** section: for each Ticket, its title, the behaviours that it builds by their numbers, and what blocks it. Round 0 checks it with the Spec. If the Spec is approved already, and no Ticket of it is built, run `pnpm task set <spec> spec` for another pass.
6. When Round 0 is `approved`, show the Maintainer the draft. Ask: is each Ticket the right size? Is each edge real? Should a Ticket merge with another, or split?
7. If the Maintainer changes the draft, edit the section, and send the Spec for another pass.
8. Publish the Tickets, blockers first, so that each edge names a real number: `gh issue create --label build --parent <spec> --blocked-by <n>,<m>`.
9. Leave the Spec open. `pnpm task stop <spec>` closes it after its last Ticket merges.

## Rules

- **A vertical slice.** A Ticket cuts a thin path through each layer that the change needs: the core, the plugin, the records and the tests. A Ticket that changes one layer only is a horizontal slice. Join it with the slice that uses it.
- **It can be tried.** The Maintainer can try each Ticket when it merges, or a test shows its behaviour. If you cannot say what a Ticket lets a person or an author do, it is a horizontal slice.
- **Fewer Tickets.** Each Ticket costs a build and its Rounds. Split a Spec only for a reason: two Tickets can be built at the same time, a part can merge and be tried before the rest, or one Ticket would be too large to review well. A Spec with none of these is one Ticket.
- **Prefactors first.** A prefactor is a Ticket of its own, and it blocks the Tickets that need it.
- **No file paths.** A Ticket says what changes, not where. Paths go stale before the build. The exception is a snippet from a prototype that holds a decision better than prose does: a type, a state machine or a table.
- **Each behaviour fails before the build.** For each behaviour, name what would show it false, and check that it is false at `origin/main`. A behaviour that holds already, or that only another Ticket can make true, grades nothing.
- **A shared file is an edge.** When two Tickets with no edge between them change one shared file, such as a table, a registry or a type, add an edge. A row appended to the feature map, and a changeset, are no edge: the rebase before `task land` keeps both.

## A wide refactor

A wide refactor is one mechanical change, such as a rename or a new type for a shared name, that breaks each place that uses it. No vertical slice of it can pass `pnpm test`. Slice it as expand, migrate and contract:

1. **Expand:** add the new form beside the old, so that nothing breaks.
2. **Migrate:** move the users to the new form, in batches, one Ticket each. Each batch is blocked by the expand.
3. **Contract:** remove the old form when nothing uses it. This Ticket is blocked by each batch.
