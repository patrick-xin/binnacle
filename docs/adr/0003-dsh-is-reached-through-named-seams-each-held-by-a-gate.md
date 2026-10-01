# dsh is reached through named seams, each held by a gate

Every dsh release so far has reshaped something a bundle reaches, and much of what binnacle depends on — a service name, a patch row id, a peer of a peer — is invisible to the compiler, some of it failing silently, as a patch row naming nothing is skipped while the launcher boots anyway. So binnacle reaches dsh only through seams it names, each held by a gate that fails when dsh moves under it, and widens a seam by naming more, never by reaching further through one already named. A new release is read by a person before its pin moves, never taken by a machine.

## Considered Options

- **Trust the compiler and the boot.** Most breaks are type errors. Rejected because the silent ones are not: a dropped patch row compiles and boots.
- **Allow dsh by package prefix.** One line, and every future package is allowed. Rejected because the list of what binnacle reaches is exactly what an upgrade must re-read, and a prefix hides it.
- **Move a pin automatically when the canary is green.** Fewer upgrades wait. Rejected because green says nothing about what a release quietly changed or newly made possible.

## Consequences

- The session log's event kinds are the one open seam. A kind nobody adapts is drawn by the fallback view, visible but never fatal, so a new kind shows up on screen rather than in CI.
