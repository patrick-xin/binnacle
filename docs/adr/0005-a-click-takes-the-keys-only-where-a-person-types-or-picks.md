# A click takes the keys only where a person types or picks

**Status:** accepted, 2026-10-12

A click moves the Focus only to a Place that a person types or picks in, such as the composer, a Request's Choices, a settings list or a dialog. A click on a Place that a person reads, such as the transcript, acts there and takes no Focus: the keys stay where the person types. The rule is of a click alone. The keyboard still moves the Focus to a Place that a person reads, and a click in a Place that has the Focus keeps it there.

Whoever lays out a Place says which it is, with `clickFocus: false` on its Layout node. The Chat sets it on the transcript. A node with none takes the Focus on a click.

## Considered options

- **A click moves the Focus to any Place that takes keys**, as Stage 2 built it. A person who clicks the transcript to fold a card, and goes on typing, finds their keys gone from the draft, and must click the composer to get them back.
- **A click never moves the Focus.** A dialog, a settings list or a Screen of an author's own then has no way in by the mouse.
- **The Part says it**, as a field of its own. Only the plugin that made the Part could change it, so an author who lays the transcript out elsewhere could not.

## Consequences

- Every Spec is held to it: a Journey that clicks a Place that a person reads, then types, finds the keys where they were.
- An author changes it for a node with an edit: `{ replace: 'transcript', with: { place: 'transcript', size: 'fill' } }` gives the transcript its click Focus back.
- What an author imports grows by one field of a Layout node. A change to it is a one-way door.
