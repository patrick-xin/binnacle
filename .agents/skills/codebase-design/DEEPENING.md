# Deepening

How to deepen a cluster of shallow modules safely, given what they depend on. The words are [SKILL.md](SKILL.md)'s.

## What a module depends on

What a cluster depends on decides how the deepened module is tested across its seam. `AGENTS.md`'s *Tests* binds: fake the terminal and the model, and keep everything downstream real.

1. **Pure**: facts, models, views, layout, the key table. Always deepenable: merge the modules, and test through the new interface with the real thing. No fake.
2. **The terminal, the process, the clock**: the host's alone. Take the decision out of the host into a pure module that returns it, and leave the host the effect: the decision is tested as a return value, and the host's test only that the effect happens. Where a test must cross the host, the terminal is emulated with xterm (`test/support/`).
3. **dsh and pi-tui**: upstream, reached through named seams (ADR 3). Used real in tests, dsh's own functions included; a shape restated from them is held by a type-level test, never faked.
4. **An author's code**: fenced. The deepened module takes it as a registration and draws what it does wrong, naming the registration; a test registers a real one that throws.

## Seam discipline

- **One implementation is a hypothetical seam; two make it real.** Put in no seam until a fake or an author's registration is a second.
- **Internal seams stay internal.** A seam a module's own tests use is not exposed through its interface because they use it.

## Tests: replace, never layer

- Tests at the shallow modules' interfaces become waste once tests at the deepened module's interface hold the same behaviours: delete them, in the same change.
- New tests sit at the deepened module's interface, and assert what a person sees or a caller receives.
- A test that has to change when the implementation changes was reaching past the interface.
