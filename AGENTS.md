# AGENTS.md

binnacle is a terminal surface for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), mounted as a profile bundle over dsh-base and drawn with pi-tui. Its design is [the architecture](docs/architecture.md): content offers what a person can do with it, the surface alone gives a gesture meaning, and an author agent customizes it with the same components the surface is built from.

Standing orders — the one page here that binds. A record is evidence, never a rule.

## Working here

| Command | Does |
|---|---|
| `pnpm install && pnpm refs` | install, and fetch every reference into `.refs/` |
| `pnpm test` | every gate, then every test — what CI runs |
| `pnpm build` | build the bundle into `packages/binnacle/dist/` |
| `pnpm profile` | create the `binnacle` dsh profile linking this checkout |
| `pnpm check:boot` | boot it under the real `dsh`, draw nothing, exit |
| `dsh --profile binnacle` | run it |

Code lives in `packages/binnacle/src/<layer>/`; what a layer may import is [`layers.json`](packages/binnacle/layers.json), and a gate's error says what to change.

## One root

- **Everything you read is under this checkout.** `pnpm refs` fetches each repository in [`references.json`](references.json) into `.refs/<name>` at its pin. **Never write under `.refs/`.**
- **Cite another repository as `` `name:path` ``** (`` `pi:packages/tui/src/tui.ts` ``, optionally `#symbol`), never as a path on a machine. `pnpm test` resolves every citation at its pin and refuses a home directory in any file.
- **The source is the authority.** `dsh` on the harness contract; `pi` for pi-tui's API and for what pi composes from it; `codex` and `eve` for what a terminal can do. A limitation is a reading: name the reference it was read in.
- **A reference only one machine has** is declared in its `references.local.json`, never in a tracked file, and never cited from one.
- **Moving a pin is one line in `references.json`**, and every citation is re-read against it.

## Code

- **Registrations are effects**, registered through `ctx` and disposed with the fiber. Nothing is contributed by mutation.
- **Model-visible implies logged, both ways.** The session log is the only source of what is drawn.
- **A plugin gets grants, not the tree.** Widen a seam with a named grant, never by handing out pi-tui components.
- **Only the host touches the terminal or the harness runtime.** Everything below it is a function of facts, UI state and a size.
- **Take what pi-tui exports; never derive it again.** A component, layout, key table or text measure that ships upstream is imported.
- **Follow an upstream rename wholesale** — no shim, no fallback branch.
- **Every export carries JSDoc** stating its contract, parameters and non-void returns. Comments state contracts, not reasoning; an empty `catch` names what it swallows.
- **Markers by urgency:** `FIXME` blocks a release, `TODO` is soon, `XXX` is someday.

## Tests

- **Red before green.** Write the failing test first and land it with the change.
- **Assert the contract, not the implementation**; a test written against working code cannot disagree with it.
- **Prefer the real implementation over a fake.** Fake the terminal and the model; keep everything downstream real.
- **A registration proves its disposal.** Dispose the fiber and assert the contribution is gone.
- **Test the real entry path**: load the built bundle under plain `node`.

## Where a record lives

| Record | Home |
|---|---|
| how it is built | [`docs/architecture.md`](docs/architecture.md) |
| why, and what it beat | a decision record in [`docs/adr/`](docs/adr/) |
| what is wrong, missing or being read | a GitHub issue |
| what one change did and why | its commit message |

- **A decision a maintainer may revisit is a decision record**: `docs/adr/NNNN-title.md`, numbered in order, from [the template](docs/adr/0000-template.md). The decision stays short and the alternatives are real ones, never invented. A record is not edited into a different decision; a new one supersedes it, and both say so.
- **A reading — a survey, a probe, a limitation found — goes on the issue it informs**, naming the reference it was read in.
- **Durable prose carries no change history**; the story goes in the commit message.
- **Work on a branch; merge with `--no-ff`.**
