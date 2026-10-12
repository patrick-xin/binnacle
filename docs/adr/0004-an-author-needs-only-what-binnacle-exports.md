# An author needs only what binnacle exports

**Status:** accepted, 2026-10-11

What binnacle exports, and its guide for authors, `AUTHORING.md`, are all that an author needs to change binnacle, to replace a part of it, and to test the change. An author never needs binnacle's source.

- A built-in is a default to replace. It uses only what an author can import, so an author can replace any built-in whole, as well as one piece of it.
- Each name that a built-in sets, a Place, a Look, an action, a model or a Layout, is in `AUTHORING.md`, and a check holds it there.
- An author tests a change with what binnacle ships: binnacle with no terminal, the built-ins, a fake agent and a fake clock, and the screen as rows.
- A gap is where an author has to read the source to make a change, or to know what it will do.

## Why

The Lead tried one change in pi and in binnacle, with two models, blind: the model's name first in the footer or the status line, and how long the turn has run.

| | Lines | Copied from the built-in | Source of the host read |
|---|---|---|---|
| pi, GLM 5.3 | 164 | about 75 lines | 12 compiled files |
| pi, gpt-6.1-sol | 89 | none, by patching the footer's class at runtime | 14 compiled files |
| binnacle, gpt-6.1-sol | 33 | none | the status line, the clock, the types |

pi's footer can only be replaced whole, and what it draws is not given to an extension, so an author copies it or patches it, and reads pi's source to know how. binnacle's pieces let an author change one, so its authors read the source only for names and for what things do. In 73 changes over seven trials, binnacle's authors copied almost nothing. They read the built-ins for which Places, Looks, actions and models there are, and the core for which keys reach which action. Both models in both hosts kept a time of their own for the turn, and built a harness of their own to test the change.

## Considered options

- **Built-ins as examples to copy.** The Intent said so, and the trials' authors were told to read them. They read them for names, not to copy. A built-in written to be copied would be written for a reader who does not come.
- **pi's way: a corpus of small examples, checked, that the agent is told to read.** It teaches what to build, not what binnacle has. It is kept for Stage 4, where the author agent's skill points to the guide, and it adds to this decision.
- **No rule.** Each Ticket reached past the API where it was easier, and four built-ins did.

## Consequences

- A built-in that needs something of the core gets it through the API, so the API grows when a built-in needs more. A check fails on a built-in that imports anything else of binnacle's.
- A built-in that sets a name edits `AUTHORING.md` in the same commit.
- `binnacle/testing` is what an author imports. A change to it is a one-way door, as a change to the API is.
- A trial's report counts what the author read in binnacle's source, and why. Each read is a gap, or a line that the guide lacks.
