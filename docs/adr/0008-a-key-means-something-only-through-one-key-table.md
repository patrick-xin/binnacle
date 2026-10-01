# A key means something only through one key table

A terminal that reports keys precisely sends a press, each repeat and the release, and a handler matching raw bytes that forgets to filter answers a release as a press. So a key means something only through one table — pi-tui's, extended with binnacle's bindings, held in one manager that answers a press once — and nothing else in binnacle matches a key. What the table resolves becomes a gesture, which the gesture table gives its meaning ([ADR 7](0007-content-offers-affordances-the-surface-owns-gestures.md)).

## Considered Options

- **Let each component or plugin match its own keys.** Each handler knows its own. Rejected because a forgotten filter fires twice per press, and one key comes to mean two things in two places no reader can see.
- **Keep a table of binnacle's own beside pi-tui's.** Rejected because pi-tui's composer and screens read pi-tui's table, so a key rebound in binnacle's table would not reach them.
