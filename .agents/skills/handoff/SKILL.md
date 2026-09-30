---
name: handoff
description: Write down what the next session needs to carry on this one's work, before this one ends.
argument-hint: "What will the next session be used for?"
disable-model-invocation: true
---

Write a handoff to `/tmp/handoff-<issue or topic>.md`, never in the checkout, so a fresh session carries on where this one stops. Where the maintainer said what the next session is for, write for that.

It holds only what no record holds, and points at the rest: the issue, the tracking issue, the branch and its last commit, round reports under `/tmp`. What a record already says is linked, never restated.

- **Where it stands**: the issue and branch in hand, the behaviours done and still to do, and what is red.
- **Who is still working**: every Charge and subagent still held — the reviewer for the issue first, with its name, its last round and that round's report — so the next session prompts them rather than dispatching again. Say who owns each checkout under `/tmp`.
- **Decided, not yet recorded**: what the maintainer decided in this session that is on no issue yet, and every decision taken for them, marked provisional.
- **Next**: the one step to take first, and what to ask the maintainer.
- **Skills to load**: `sheepdog` and `shepherd` for a coordinating session, and any other the next step needs.

A redaction placeholder in your context is never copied into the handoff; name where the original lives instead.

End by giving the maintainer the file's path, and the first line to start the next session with.
