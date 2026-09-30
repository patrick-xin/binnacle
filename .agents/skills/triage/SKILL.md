---
name: triage
description: Show what needs the maintainer's attention, and move issues between states: evaluated, verified, grilled if needed, and written into the template's shape for an agent.
disable-model-invocation: true
---

# Triage

Move binnacle's issues through a small set of states, with the maintainer deciding each move. Every comment triage posts on an issue starts with:

```
> *Written by an agent during triage.*
```

## Labels

An issue carries one **category** and at most one **state**.

| Category | For |
|---|---|
| `enhancement` | something a person or an author cannot do yet |
| `bug` | something binnacle does wrong |
| `gap` | something a person cannot do, or that binnacle does wrong, found against a reference |
| `reading` | a survey or probe of a reference, a terminal or dsh |
| `agents` | how the agents that build binnacle work |

| State | Means | Next |
|---|---|---|
| `needs-triage` | filed, not yet evaluated | any state below |
| `ready-for-agent` | in the template's shape, seams agreed: an agent may build it | `/implement` |
| `deferred` | held, not dropped: picked up when the plan reaches it | `needs-triage` |
| `wontfix`, closed | rejected, or already built | — |

An issue with no state and no pull request is in play: a reading, or work the Sheepdog is on. Two states on one issue is a conflict: say so and ask before anything else.

## Show what needs attention

`gh issue list --state open`, then three lists, oldest first, each item one line with its number and what a person would notice:

1. **No category**: never triaged.
2. **`needs-triage`**.
3. **Waiting on the maintainer**: a decision marked provisional on the tracking issue, or a question asked on an issue since answered by nobody.

Give the counts, and let the maintainer pick.

## Triage one issue

1. **Read it all**: body, comments, labels, dates, and any triage notes before, so no settled question is asked again. Read the folder `AGENTS.md` of the layers it touches, and the records in its area.
2. **Two checks.** *Built already*: search for the behaviour by the glossary's words, not the issue's, and say where you looked. *Rejected already*: `gh issue list --state closed --label wontfix --search "<the concept>"`.
3. **Recommend** a category and a state, with why, and what the code does today. Wait for the maintainer.
4. **Verify the claim.** A bug is reproduced — a failing probe test at a seam, or the branch driven in `tmux` as the `sheepdog` skill does — and the result said: confirmed with its code path, not reproduced, or too little to go on.
5. **Grill it, if it needs shaping**: load `grilling` and `domain-modeling`, and settle it a round at a time, sharpening the glossary as terms land.
6. **Apply the outcome**:
   - `ready-for-agent`: rewrite the body into the template's shape (`/to-spec`'s headings), with the maintainer's agreement to the seams, and keep what the reporter wrote under a closing *As reported* heading.
   - `deferred`: a comment saying what it waits on.
   - `wontfix`, already built: a comment pointing at where it lives, then close.
   - `wontfix`, rejected: a comment saying why, in a paragraph a later reader could reuse, then close. The closed issue is where the rejection lives; a later request for the same finds it by search.
   - staying `needs-triage`: a comment of what is established and what is still needed, each a bullet.

Where the maintainer names a state outright ("move #42 to ready-for-agent"), say what you are about to change — labels, comment, close — and do it, without grilling. Moving to `ready-for-agent` that way still needs the body in the template's shape: offer to write it.
