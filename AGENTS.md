# AGENTS.md

binnacle is a terminal surface for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), mounted as a profile bundle over dsh-base and drawn with pi-tui. Its design is [the architecture](docs/architecture.md): content offers what a person can do with it, the surface alone gives a gesture meaning, and an author agent customizes it with the same components the surface is built from.

Standing orders — the one page here that binds. A record is evidence, never a rule.

binnacle is being migrated from an earlier surface, step by step. **[`docs/migration.md`](docs/migration.md) is the plan and where it stands**; start there to take the next step.

## Working here

| Command | Does |
|---|---|
| `pnpm install && pnpm refs` | install, and fetch every reference into `.refs/` |
| `pnpm test` | every gate, then every test — what CI runs |
| `pnpm build` | build the bundle into `packages/binnacle/dist/` |
| `pnpm dsh:profile` | create the `binnacle` dsh profile linking this checkout |
| `pnpm check:boot` | boot it under the real `dsh` at the pin, draw nothing, exit |
| `dsh --profile binnacle` | run it |
| `pnpm upstream` | list each release upstream has published past a pin |
| `pnpm pin <name> <tag>` | move a pin, and every package that follows it |

Code lives in `packages/binnacle/src/<layer>/`; what a layer may import is [`layers.json`](packages/binnacle/layers.json), and a gate's error says what to change.

## One root

- **Everything you read is under this checkout.** `pnpm refs` fetches each repository in [`references.json`](references.json) into `.refs/<name>` at its pin. **Never write under `.refs/`.**
- **Cite another repository as `` `name:path` ``** (`` `pi:packages/tui/src/tui.ts` ``, optionally `#symbol`), never as a path on a machine. `pnpm test` resolves every citation at its pin and refuses a home directory in any file.
- **The source is the authority.** `dsh` on the harness contract; `pi` for pi-tui's API and for what pi composes from it; `codex` and `eve` for what a terminal can do. A limitation is a reading: name the reference it was read in.
- **A reference only one machine has** is declared in its `references.local.json`, never in a tracked file, and never cited from one.

## Upstream

dsh is a preview; a release may rename anything. [ADR 3](docs/adr/0003-dsh-is-reached-through-named-seams-each-held-by-a-gate.md) is how binnacle stays upright on it.

- **Reach dsh only through a named seam.** A dsh package is a line in `layers.json`; a service is a key in `inject`, typed against `Context`; a row is an id in the patch. Widen a seam by naming more, never by reaching further through one already named.
- **Take what upstream exports; never derive it again.** A component, layout, key table, text measure, schema or patch semantics that ships upstream is imported, never restated. A shape that must be restated names upstream's type and is held to it by a type-level test.
- **Follow an upstream rename wholesale** — no shim, no fallback branch.
- **Moving a pin is `pnpm pin <name> <tag>`, then `pnpm test` and `pnpm check:boot`**, and every citation is re-read against it.
- **An `upstream/<reference>/<version>` branch is mail** from the upstream job: the pin moved and the canary run. Read its commit, then read upstream at the new pin; merging it is the upgrade.

## Code

- **Registrations are effects**, registered through `ctx` and disposed with the fiber. Nothing is contributed by mutation.
- **Model-visible implies logged, both ways.** The session log is the only source of what is drawn.
- **A plugin gets grants, not the tree.** Widen a seam with a named grant, never by handing out pi-tui components.
- **Only the host touches the terminal or the harness runtime.** Everything below it is a function of facts, UI state and a size.
- **Below the host, nothing reads the clock, randomness or the environment.** Time, ids and size arrive as arguments, so the same facts draw the same screen.
- **Unknown input is parsed where it enters** — the facts layer for the log, the host for the process — and trusted after. No `any`; a union is tagged by `kind`.
- **Contract types live in `contract`**, and every layer may know them.
- **An error names what to change.** A seam that cannot hold throws where it is crossed, never degrades quietly.
- **Names say what a thing is:** files kebab-case, one job each; named exports only; service names camelCase, dotted when grouped; an event is `binnacle/<name>`.
- **Every export carries JSDoc** stating its contract, parameters and non-void returns. Comments state contracts, not reasoning; an empty `catch` names what it swallows.
- **Markers by urgency:** `FIXME` blocks a release, `TODO` is soon, `XXX` is someday.

## Tests

- **Red before green.** Write the failing test first, watch it fail for the reason it names, then write the least code that passes it. One test at a time; the next responds to what the last taught.
- **Test at a seam, never inside one.** A seam is a public boundary: a registration, what a view draws, the gesture table, a script's exported function. Name the seam before writing the test.
- **Expected values come from outside the code** — a literal, a worked example, upstream's behaviour — never recomputed the way the code computes them.
- **Assert the contract, not the implementation**; a test written against working code cannot disagree with it.
- **Prefer the real implementation over a fake.** Fake the terminal and the model; keep everything downstream real, dsh's own functions included.
- **What a person sees is asserted as lines**, drawn by `drawText` (`packages/binnacle/src/ui/draw.ts`) through real pi-tui components — never by reading a component's fields.
- **A registration proves its disposal.** Dispose the fiber and assert the contribution is gone.
- **A guard is shown to bind.** Break what a gate or type-level test holds once, watch it fail, and say so in the commit.
- **Test the real entry path**: load the built bundle under plain `node`, and boot it under the real launcher.
- **Where tests live:** `packages/binnacle/test/<subject>.test.ts` and `scripts/<script>.test.mjs`, on `node:test` and `node:assert/strict`.

## Where a record lives

| Record | Home |
|---|---|
| how it is built | [`docs/architecture.md`](docs/architecture.md) |
| why, and what it beat | a decision record in [`docs/adr/`](docs/adr/) |
| what is wrong, missing or being read | a GitHub issue |
| what one change did and why | its commit message |
| the migration: its steps, and what legacy learned | [`docs/migration.md`](docs/migration.md), until it is done |

- **A decision a maintainer may revisit is a decision record**: `docs/adr/NNNN-title.md`, numbered in order, from [the template](docs/adr/0000-template.md). The decision stays short and the alternatives are real ones, never invented. A record is not edited into a different decision; a new one supersedes it, and both say so.
- **A reading — a survey, a probe, a limitation found — goes on the issue it informs**, naming the reference it was read in.
- **Durable prose carries no change history**; the story goes in the commit message.
- **Work on a branch; merge with `--no-ff`.**
