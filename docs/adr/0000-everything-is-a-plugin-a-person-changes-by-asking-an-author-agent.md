# Everything is a plugin a person changes by asking an author agent

binnacle is drawn for people who will not write its code, whose wants differ and whose presets log kinds nobody writing binnacle has seen. So every part of binnacle is a plugin a person can change, replace or remove at the grain they ask for, by asking an author agent, which works through the same registrations the built-in surface is made of, with building blocks and a skill binnacle supplies. Anything an author cannot reach is a gap in binnacle, never a boundary, and a rule that gets in the way of this one gives way through a new record.

## Considered Options

- **A fixed surface, tuned by settings.** It is simpler, and every combination can be tested. Rejected because each switch is a guess at what a person will want, and a kind logged tomorrow has no switch.
- **Hand an author the rendering library's components.** It gives the most reach, with nothing to design. Rejected because a component an agent writes can break widths, focus or keys where no fence catches it, and one library release can break every such component at once. binnacle's blocks give the same reach and handle those failures once, for every author ([ADR 11](0011-a-view-draws-with-blocks-in-the-themes-tones.md)).
- **Let a person change binnacle's source.** Everything is in reach. Rejected because the person then carries a fork, which cannot be taken back while binnacle runs and collides with every upgrade.
- **Make the built-in surface first-class, with hooks for authors around it.** This is the usual shape of an extension API. Rejected because the author's version is always second-class, and every shortcut the built-in surface takes is a place where the two drift apart ([ADR 5](0005-a-built-in-feature-is-a-plugin-that-holds-only-what-an-author-holds.md)).

## Consequences

- The author API is the product. Taking anything out of it breaks what people have made, and a vocabulary too small to draw what someone asks for is binnacle's defect.
