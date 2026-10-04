---
name: triage
description: Show what needs the Maintainer's attention, and give each open issue a lane and a state.
disable-model-invocation: true
---

# Triage

Each comment that triage posts on an issue starts with this line:

```
> *Written by an agent during triage.*
```

## Labels

An issue has one lane and at most one state.

| Lane | For |
|---|---|
| `fix` | One small behaviour is wrong or missing. |
| `chore` | Records, a dependency or a check |
| `build` | All other work |

| State | Means |
|---|---|
| `needs-triage` | Filed, and not yet read |
| `ready` | In its template's shape. A role can start it. |
| `deferred` | Kept for a later stage. A comment says what it waits for. |

An issue with no state is in progress. An issue with two states is a conflict: tell the Maintainer first.

## Show what needs attention

1. Run `gh issue list --state open`.
2. List the issues with no lane, oldest first.
3. List the issues with `needs-triage`, oldest first.
4. List the questions on issues that nobody answered.
5. Give the counts, and let the Maintainer choose.

## Triage one issue

1. Read the body, the comments and the labels.
2. Search the code and the closed issues for the same behaviour.
3. Recommend a lane and a state, with one reason each.
4. Wait for the Maintainer.
5. If the issue says that a behaviour is wrong, reproduce it, and say what you found.
6. If the issue needs shape, use the `grill` skill.
7. Apply the outcome: the labels, a comment, and for `ready`, the body in its template's shape.

If the Maintainer names the outcome, say what you will change, and change it.
