# 3. dsh is reached through named seams, each held by a gate

- Status: accepted
- Date: 2026-09-26

## Context

dsh is a preview: every release so far has renamed, moved or reshaped something a bundle reaches. binnacle compiles against one release and runs inside whatever launcher mounts it, and much of what it depends on is not a type the compiler sees — a service name in `inject`, a row id in a patch, a package the lockfile resolves as a peer of a peer.

Several of those fail silently. A patch naming a row no layer composed is skipped (dsh's `applyEntryPatches`), and at `dsh-v0.1.7-rc.2` the launcher prints nothing about it and exits 0 from `--check` — probed with a renamed row. A package nobody declared moves with nothing to compare it to. A dependency on dsh that nobody listed is found at the next upgrade, one compile error at a time.

## Decision

**binnacle reaches dsh only through seams it names, and every seam has a gate that fails when dsh moves under it.**

| Seam | Named in | Held by |
| --- | --- | --- |
| each dsh package imported, and the layer that may import it | `layers.json`, by exact name | `check:layers` |
| each `@deepseek-ai` package the tree materializes, at one version | the manifests, exact | `check:pins`, against the lockfile, the dsh tag and what dsh vendors |
| each service a row injects | `inject`, `satisfies (keyof Context)[]` | `typecheck` |
| each row the patch names | `cordis.patch.yml` | `check:patch`, composing dsh-base's patch at the pin with dsh's own `applyEntryPatches` |
| the launcher that mounts the bundle | the `dsh` reference's tag | `check:boot`, in CI with `@deepseek-ai/dsh` installed at the pin |
| a shape restated rather than imported | its JSDoc, naming upstream's type | a type-level test asserting upstream's type is assignable to ours |

A seam is widened by adding a row to this table's sources, never by reaching further through one already named. The session log's event kinds are the one open seam: dsh packages add kinds by augmenting `SessionEventMap`, so a kind no fact adapter knows is drawn by the fallback view ([ADR 2](0002-five-layers-and-the-registrations-an-author-shares.md)) — visible, never fatal.

**What upstream releases is read, and carried, but never taken by a machine.** `pnpm upstream` lists each release past a pin. A daily job carries the newest on a branch, `upstream/<reference>/<version>`, with the pin moved by `pnpm pin` and the canary — `pnpm test` and the boot — run in the commit. Merging that branch is the upgrade.

## Alternatives considered

**Trust the compiler and the boot.** Most breaks are type errors. It lost because the silent ones are not: a dropped patch row compiles and boots, and a service misnamed in `inject` compiles unless it is typed against `Context`.

**Allow dsh by package prefix, as the first `layers.json` did.** One line, and every future dsh package is allowed. It lost because the list of what binnacle reaches in dsh is exactly what an upgrade has to re-read, and a prefix makes it unknowable without grepping.

**Move pins automatically when the canary is green.** Fewer upgrades waiting. It lost because a green canary says nothing about what a release made newly possible or quietly changed in behaviour; the pin moves when someone has read what moved.

## Consequences

- An upgrade starts from a branch that has already run every gate, and its commit message says where it went red.
- A gate that reads dsh needs dsh fetched; each says so rather than passing.
- Declaring a package the tree materializes is a chore every dsh release may bring; the gate names the line to add.
- The event-kind seam is held by a view, not a gate, so a new kind is noticed on screen, not in CI.
