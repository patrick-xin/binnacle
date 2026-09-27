# 13. A key means something only through the one key table

- Status: accepted; extends [ADR 1](0001-content-offers-affordances-the-surface-owns-gestures.md)
- Date: 2026-09-26

## Context

The host answered two keys itself, matching raw bytes in an input listener of its own: Ctrl+C quit, Ctrl+T switched screens. That was one step ahead of Keys, and it already showed the cost. A terminal speaking the kitty protocol, which pi-tui asks for, reports a press, each repeat while the key is held, and the release; a raw listener receives all of them, and a match that forgets to filter answers a release as a press, so a switch flipped back and a quit was asked twice. Every key answered anywhere would have to repeat the filter where it is answered.

pi-tui ships a key table that downstream packages extend by declaration merging, with default keys and descriptions, held in a manager that matches key bytes to a binding, which the composer and the alternate screen already read (pi-tui's key table, at v0.87.1).

## Decision

**A key means something only through one table: pi-tui's, extended with binnacle's bindings, held in one manager and installed with pi-tui's own installer. Only a press is answered, once, and the press-only filter is held in that one place. Nothing else in binnacle matches a key.**

What the table resolves becomes a gesture, and the gesture table gives it its meaning ([ADR 1](0001-content-offers-affordances-the-surface-owns-gestures.md)); what is bound to the host, such as quitting, the host answers.

## Alternatives considered

**Let each component or plugin match its own keys, as the host did.** Nothing to build, and each handler knows its own keys. It lost because a handler that forgets the press-only filter fires more than once per press, and one key can come to mean two things in two places, which no reader can see.

**Keep a table of binnacle's own beside pi-tui's.** The bindings would be binnacle's to name. It lost because the composer and the alternate screen read pi-tui's table, so a key rebound in binnacle's table would not reach them: one table would answer keys, another would still take them.

## Consequences

- Every key binnacle answers is declared in one place, with its default keys and a description a person reads in help; changing the keys is changing that table, which pi-tui's installer already carries.
- A repeat or a release is answered by nothing binnacle binds, whatever terminal reports it.
- Which bindings are live is decided with the table, in one place, so the composer keeps a key exactly when nothing answers it.
