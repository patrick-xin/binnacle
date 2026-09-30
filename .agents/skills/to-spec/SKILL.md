---
name: to-spec
description: "Turn the current conversation into an issue in binnacle's feature or bug template: no interview, just what was already decided."
disable-model-invocation: true
---

Turn what the conversation has decided into one issue. Interview no further: where a decision is missing, say which, and let the maintainer choose between answering it now and leaving it out of scope.

## 1. Read what it touches

Read the folder `AGENTS.md` of every layer the change touches, the decision records in its area, and [the glossary](../../../docs/glossary.md). The issue speaks the glossary's words and keeps to the records; where it would change what a record commits to, say so, and the maintainer decides whether that is a new record.

A question about dsh, pi-tui or a reference is a reading before it is an issue: say so, and stop.

## 2. Agree the seams

Propose where the change is observed from outside, with the highest seam that can hold each behaviour: a registration, what a view draws, layout, the gesture table, the host. Prefer a seam binnacle already tests at (`tdd`'s table of seams); the fewer the better, and one is best. **Wait for the maintainer to agree them.** A seam not agreed is written as proposed.

## 3. Write and publish the issue

In the shape of `.github/ISSUE_TEMPLATE/feature.yml`, or `bug.yml` for something binnacle does wrong, each heading its `label`:

- **What a person can do** (for a bug, **What is wrong**, and how to see it): from their side of the screen.
- **How it works (the maintainer's decisions)**: each a bullet, in the maintainer's terms.
- **Seams (agreed)**: as agreed in step 2.
- **Behaviours**: one sentence each, as a person or a caller would say it: each is a test's name, ordered so each builds on the last, the first the thinnest that crosses every seam.
- **Records**: the feature pages, glossary entries and folder notes that change with it.
- **Out of scope**: what it does not do, and the issue that does it, if any.

Name code as a citation (`` `binnacle:packages/binnacle/src/api.ts#Registrations` ``), never a line number: a symbol the gate resolves stays true when lines move.

Publish it with `gh issue create --label enhancement` (or `bug`), and add `ready-for-agent` when its seams are agreed. For an issue too big for one branch, say so and suggest `/to-tickets`.
