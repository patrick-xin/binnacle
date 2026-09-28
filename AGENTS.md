# AGENTS.md

binnacle is a terminal surface for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), mounted as a profile bundle over dsh-base and drawn with pi-tui. Its design is [the architecture](docs/architecture.md): content offers what a person can do with it, the surface alone gives a gesture meaning, and an author agent customizes it through the same registrations the surface is built from.

Standing orders — the one page here that binds. A record is evidence, never a rule.

**First: everything is a plugin that a person can change by asking an author agent** ([ADR 0](docs/adr/0000-everything-is-a-plugin-a-person-changes-by-asking-an-author-agent.md)). An author can change, replace or remove whatever binnacle draws or answers, at the grain a person asks for, through the registrations the built-in surface uses. binnacle supplies the building blocks and the skill that teaches them. When an order below would stop this, revise the order through a record; never work around it.

## Working here

| Command | Does |
|---|---|
| `pnpm install && pnpm refs` | install, point git at [`.githooks`](.githooks) (a push runs `pnpm test` first), and fetch every reference into `.refs/` |
| `pnpm test` | every gate, then every test — what CI runs |
| `pnpm build` | build the bundle into `packages/binnacle/dist/` |
| `pnpm dsh:profile` | create the `binnacle` dsh profile linking this checkout |
| `pnpm check:boot` | boot it under the real `dsh` at the pin, draw nothing, exit |
| `dsh --profile binnacle` | run it |
| `pnpm upstream` | list each release upstream has published past a pin |
| `pnpm pin <name> <tag>` | move a pin, and every package that follows it |

Agents here work in roles, each with a skill in [`.agents/skills`](.agents/skills): the Sheepdog coordinates (`sheepdog`), a Sheep builds one issue (`sheep`), a reviewer checks a change (`review`), and every change's tests follow `tdd`. Load yours first.

Code lives in `packages/binnacle/src/<layer>/`, and the author API in `src/api.ts`; what each may import is [`layers.json`](packages/binnacle/layers.json), and a gate's error says what to change. What each layer is for, how they connect, and where a change goes is [the package map](packages/binnacle/README.md).

## One root

- **Everything you read is under this checkout.** `pnpm refs` fetches each repository in [`references.json`](references.json) into `.refs/<name>` at its pin. **Never write under `.refs/`.**
- **Cite another repository as `` `name:path` ``** (`` `pi:packages/tui/src/tui.ts` ``, optionally `#symbol`), never as a path on a machine, and never in a decision record (below). `pnpm test` resolves every citation at its pin and refuses a home directory in any file.
- **Cite this repository's code the same way, by the name `binnacle`** (`` `binnacle:packages/binnacle/src/api.ts#Registrations` ``), wherever prose outside a decision record points at it. A symbol in code must be one its module exports, so a rename fails the gate instead of leaving the prose stale.
- **The source is the authority.** `dsh` on the harness contract; `pi` for pi-tui's API and for what pi composes from it; `codex` and `eve` for what a terminal can do. A limitation is a reading: name the reference it was read in.
- **A reference only one machine has** is declared in its `references.local.json`, never in a tracked file, and never cited from one.

## Upstream

dsh is a preview; a release may rename anything. [ADR 3](docs/adr/0003-dsh-is-reached-through-named-seams-each-held-by-a-gate.md) is how binnacle stays upright on it.

- **Reach dsh only through a named seam.** A dsh package is a line in `layers.json`; a service is a key in `inject`, typed against `Context`; a row is an id in the patch. Widen a seam by naming more, never by reaching further through one already named.
- **Take what upstream exports; never derive it again.** A component, layout, key table, text measure, schema or patch semantics that ships upstream is imported, never restated. A shape that must be restated names upstream's type and is held to it by a type-level test.
- **Follow an upstream rename wholesale** — no shim, no fallback branch.
- **Moving a pin is `pnpm pin <name> <tag>`, then `pnpm test` and `pnpm check:boot`**, and every citation is re-read against it.
- **An `upstream/<reference>/<version>` branch is mail** from the upstream job: a release past a pin, carried with the canary's verdict, and on red the log of where it stopped, the pin's own move included. Read its commit, then read upstream at the new pin; merging it is the upgrade.

## Code

- **Registrations are effects**, registered through `ctx` and disposed with the fiber. Nothing is contributed by mutation.
- **The conversation transcript derives from the session log.** Model-visible conversation content is logged, and logged events remain inspectable. Other interface state arrives through named grants and is not implicitly logged.
- **A plugin gets grants, not the tree.** Widen a seam with a named grant, never by handing out pi-tui components.
- **What an author may depend on is `src/api.ts`.** Removing or renaming an export there breaks every author, and its commit says so.
- **A view names a tone or a mark, never a colour or a glyph.** The theme holds both, and a span that names a mark draws the mark's glyph in the mark's tone ([the Theme page](docs/features/theme.md)).
- **A built-in feature is a plugin in `src/plugins/<feature>`** holding only what an author holds: the author API, type-only; the dsh services it names in `inject`; grants for its effects ([ADR 5](docs/adr/0005-a-built-in-feature-is-a-plugin-that-holds-only-what-an-author-holds.md)). What more than one feature needs moves down into the layers.
- **Only the host touches the terminal or the process.** A plugin reaches dsh only through services it names in `inject`.
- **Outside the host, nothing reads the clock, randomness or the environment.** Time, ids and size arrive as arguments, so the same facts draw the same screen.
- **Unknown input is parsed where it enters** — the facts layer for the log, the facts and views layers for what an author's code returns, the host for the process — and trusted after. No `any`; a union is tagged by `kind`.
- **A type lives with the layer that owns its meaning.** `contract` holds what otherwise-independent layers share; who may import it is `layers.json`'s.
- **An error names what to change.** A seam that cannot hold throws where it is crossed, never degrades quietly. Author code is fenced: what an author's adapter or view does wrong is drawn, naming the registration and why, and never takes the surface down.
- **Names say what a thing is:** files kebab-case, one job each; named exports only; service names camelCase, dotted when grouped; an event is `binnacle/<name>`. A file is split when a part earns its own behaviour, dependencies or tests.
- **Every source file opens with a block saying what it is for, and every export carries JSDoc.** Document the contract, including what types cannot say: units, ordering, ownership, lifecycle, failure, a return that is not obvious. Explain a constraint where a plausible simplification would break it. Never repeat a name or a type in prose; an empty `catch` names what it swallows.
- **Markers by urgency:** `FIXME` blocks a release, `TODO` is soon, `XXX` is someday.

## Tests

The loop, a cycle at a time, is the `tdd` skill ([`.agents/skills/tdd`](.agents/skills/tdd/SKILL.md)); load it before the first test of a change.

- **Red before green.** Write the failing test first, watch it fail for the reason it names, then write the least code that passes it. One test at a time; the next responds to what the last taught.
- **Test at a seam, never inside one.** A seam is a public boundary: a registration, what a view draws, the gesture table, a script's exported function. Name the seam before writing the test.
- **Expected values come from outside the code** — a literal, a worked example, upstream's behaviour — never recomputed the way the code computes them.
- **Assert the contract, not the implementation**; a test written against working code cannot disagree with it.
- **Prefer the real implementation over a fake.** Fake the terminal and the model; keep everything downstream real, dsh's own functions included.
- **What a person sees is asserted as lines**, drawn by `drawText` (`binnacle:packages/binnacle/src/ui/draw.ts#drawText`) through real pi-tui components — never by reading a component's fields.
- **A registration proves its disposal.** Dispose the fiber and assert the contribution is gone.
- **A guard is shown to bind.** Break what a gate or type-level test holds once, watch it fail, and say so in the commit.
- **Test the real entry path**: load the built bundle under plain `node`, and boot it under the real launcher.
- **Where tests live:** `packages/binnacle/test/<path>.test.ts`, mirroring the `src/<path>.ts` whose seam it tests, with `test/artifact.test.ts` for the built bundle and `test/support/` for what more than one test file builds; and `scripts/<script>.test.mjs`, on `node:test` and `node:assert/strict`.

## Where a record lives

| Record | Home |
|---|---|
| what it commits to, and why | [`docs/architecture.md`](docs/architecture.md) |
| how the code is laid out: what each layer is for, how they connect, and where a change goes | [`packages/binnacle/README.md`](packages/binnacle/README.md) |
| a decision that binds beyond one feature: why, and what it beat | a decision record in [`docs/adr/`](docs/adr/) |
| what a person can do with a feature, how its parts work together, and its choices | its page in [`docs/features/`](docs/features/), listed in [the feature map](docs/features.md) |
| what a term means, and whose word it is | [`docs/glossary.md`](docs/glossary.md) |
| what is wrong, missing, being read, or not built yet | a GitHub issue |
| what one change did and why | its commit message |

- **Each fact has one home; everywhere else links to it.** What code or config states — the layers, the affordances, what a gate refuses — is linked or cited, never restated.
- **No implementation status or progress in prose, and no inventory restated from code or config.** The architecture states commitments, which may run ahead of the code; where the code falls short, that is an issue.
- **A decision record is for a decision that binds beyond one feature**: a seam, a layer, the author API, or what every view or plugin must keep, taken over a real alternative that would be costly to switch to later. It is `docs/adr/NNNN-title.md`, numbered in order, from [the template](docs/adr/template.md), one decision each. The decision stays short and states a principle, not an inventory; the alternatives are real ones, never invented. A record is not edited into a different decision; a new one supersedes it, and both say so.
- **A record is frozen, so it points at nothing that moves.** It names what it read, and at which version, in words (pi's TUI guide, at v0.87.1), and links only other records; `pnpm test` refuses a citation in one and a link out of one. A reading worth pointing at goes on its issue.
- **A feature has a page**, `docs/features/<feature>.md`, listed in [the feature map](docs/features.md) under the stage it serves; `pnpm test` refuses a page the map leaves out. It says what a person can do with the feature, how its parts work together, cited, and its own choices — a default, a key, a flag, a colour. Those are a person's to change (ADR 0), so they are the page's, never a record's. A page exists when its feature does, and changes with it in the same commit; what a feature lacks is an issue, linked from its page.
- **A reading — a survey, a probe, a limitation found — goes on the issue it informs**, naming the reference it was read in.
- **Use the owner's term** — dsh's, Cordis's, pi-tui's — and check [the glossary](docs/glossary.md) before coining one; a new term is added there in the same change.
- **Durable prose carries no change history**; the story goes in the commit message.
- **Work on a branch. Finished work — an issue closed, a feature done — is a pull request**, reviewed by a second model as well as the maintainer, `pnpm test` green on it, and merged with a merge commit, never squashed or rebased.
