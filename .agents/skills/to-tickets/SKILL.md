---
name: to-tickets
description: Cut a big issue into slices, each a sub-issue in the template's shape with the slices that block it linked.
argument-hint: "#<issue>"
disable-model-invocation: true
---

# To tickets

Cut a big issue into **slices**: each one a sub-issue a single branch can build, review and merge from `main` on its own, with the slices that **block** it.

## 1. Read the parent

`gh issue view <n> --comments`: its decisions, agreed seams, behaviours and out of scope. Read the folder `AGENTS.md` of every layer it touches, and the records in its area. A slice speaks the glossary's words.

Look for a **prefactor**: a change to the code that makes the rest easy ("make the change easy, then make the easy change"). It is the first slice, and blocks the others.

## 2. Draft the slices

- **Each slice is a tracer bullet**: a narrow path through every layer it needs, from the facts to what is drawn, ending in behaviours a person or a caller can see. Never one layer at a time.
- **Each takes behaviours from the parent**, whole; every behaviour of the parent lands in exactly one slice.
- **Each is sized for one branch and one review**: a diff the Sheepdog reads against it in one sitting.
- **Its blocking edges are only what gates it.** A slice that touches a file another slice touches is blocked by it: slices on the same files run one after the other.

A **wide refactor** — one mechanical change whose blast radius fans across the codebase, so no slice lands green — is sequenced as *expand, migrate, contract*: add the new form beside the old; move the callers over in batches (per layer), each its own slice blocked by the expand; delete the old form in a slice blocked by every batch.

## 3. Put them to the maintainer

A numbered list; for each: the title, what it lets a person or an author do, its behaviours, and what blocks it. Ask whether the grain is right, whether each edge truly gates, and what to merge or split. Iterate until they approve.

## 4. Publish

Blockers first, so each edge names a real issue. Each slice is an issue in the parent's template, its seams the parent's agreed seams it uses, and its *Out of scope* naming the sibling slices that do the rest. Then link each to the parent as a sub-issue and to its blockers, with GitHub's own relations:

```sh
id() { gh api repos/{owner}/{repo}/issues/$1 --jq .id; }
gh api -X POST repos/{owner}/{repo}/issues/<parent>/sub_issues -F sub_issue_id=$(id <slice>)
gh api -X POST repos/{owner}/{repo}/issues/<slice>/dependencies/blocked_by -F issue_id=$(id <blocker>)
```

A slice is labelled `ready-for-agent` when its seams are agreed. The parent's body is left as it is; the Sheepdog keeps its state on the tracking issue.
