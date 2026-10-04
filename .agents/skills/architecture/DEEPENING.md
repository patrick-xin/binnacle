# Deepening

How to make a group of shallow modules into one deeper module. The words are [SKILL.md](SKILL.md)'s.

## What the modules depend on

What they depend on decides how the deeper module is tested across its seam.

1. **Pure code.** Merge the modules, and test through the new interface with the real code. No fake.
2. **The terminal, the process, the clock.** Move the decision into a pure module that returns it. Leave only the effect at the edge. Test the decision as a return value, and test the edge only for the effect.
3. **Upstream: dsh and pi-tui.** Use them real in tests. If binnacle restates a shape of theirs, a type-level test holds the copy to the original.
4. **An author's code.** Take it as a registration. Draw what it does wrong, and name the registration. In a test, register a real one that throws.

## Tests: replace, never add a layer

- When tests at the deeper interface hold the same behaviours, delete the tests at the old shallow interfaces, in the same change.
- New tests sit at the deeper interface, and assert what a person sees or a caller receives.
