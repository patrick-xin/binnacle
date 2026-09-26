# Architecture

binnacle is a terminal surface for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh). It is a **dsh bundle**: a package whose `package.json` names a Cordis patch under `dsh.bundle`, stacked by a profile over `dsh-base` (`dsh:docs/architecture.md`). dsh runs the agent; binnacle draws it in a terminal and takes a person's input back.

It is not a fork of dsh and reaches nothing dsh does not publish.

## What it stands on

| Upstream   | Gives binnacle                                                                                                  | Is the authority on                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **dsh**    | the agent loop, the session log, tools, commands, settings, credentials, presets; `dsh-base` as the layer below | the harness contract — read the source, `dsh:`                                                           |
| **Cordis** | plugins, services, events, and effects disposed with their plugin (`dsh:docs/cordis-primer.md`)                 | how anything is contributed or removed                                                                   |
| **pi-tui** | the terminal, differential rendering, components, keys, the mouse                                               | its API — the installed package's `dist/*.d.ts`; `pi:packages/coding-agent` shows what pi builds from it |

A rename upstream is a break here, followed wholesale — no shim, no fallback. dsh is a preview, so binnacle reaches it only through seams it names, each held by a gate ([ADR 3](adr/0003-dsh-is-reached-through-named-seams-each-held-by-a-gate.md)).

Two more repositories are read and never depended on: `codex` and `eve`, for what a terminal surface can do.

## How it is put together

- **The session log is the only source of what is drawn.** What the model sees is logged, and what is logged is drawable; binnacle keeps no second record of a conversation.
- **Five layers — facts, models, views, ui, host — each knowing only the one below** ([ADR 2](adr/0002-five-layers-and-the-registrations-an-author-shares.md)). Only the host touches the terminal or the harness runtime; everything below it is a function of facts, UI state and a size.
- **Content declares what can be done with it; one table gives every gesture its meaning** ([ADR 1](adr/0001-content-offers-affordances-the-surface-owns-gestures.md)).
- **Everything is a registration.** A view, an affordance, a command, a binding or a placement is registered through Cordis and disposed with its plugin. The built-in surface uses the same registrations an author agent does, and a plugin gets those grants, never pi-tui's component tree.

## The repository

| Path                                                                | Holds                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`packages/binnacle/`](../packages/binnacle/)                       | the bundle: `src/<layer>/`, its tests, and the patch dsh stacks          |
| [`packages/binnacle/layers.json`](../packages/binnacle/layers.json) | what each layer may import                                               |
| [`AGENTS.md`](../AGENTS.md)                                         | the standing orders                                                      |
| [`docs/architecture.md`](architecture.md)                           | this page                                                                |
| [`docs/adr/`](adr/)                                                 | the decisions, why, and what each beat                                   |
| [`references.json`](../references.json)                             | every repository read here, by url, pinned commit, and the tag it is at  |
| `.refs/`                                                            | those repositories, fetched by `pnpm refs`; read, never written          |
| [`scripts/`](../scripts/)                                           | the gates, and `pnpm dsh:profile`, `pnpm upstream` and `pnpm pin`            |
| [`.github/workflows/`](../.github/workflows/)                       | CI, and the upstream job                                                 |

What is wrong, missing or being investigated is a GitHub issue.

## How it is checked

`pnpm test` runs every gate, then the tests, locally and in CI:

| Gate              | Refuses                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `check:paths`     | a path that belongs to one machine                                                             |
| `check:citations` | a citation (`` `name:path` ``) whose file is not at its reference's pin                        |
| `check:links`     | a relative Markdown link to nothing                                                            |
| `check:pins`      | a dependency range; a dsh, pi-tui or vendored version that disagrees with the reference it is read against; an `@deepseek-ai` package the lockfile resolves that no manifest declares at that version |
| `check:patch`     | a row the bundle's patch names that dsh-base, at the pin, does not compose                    |
| `check:layers`    | an import a layer is not allowed by `layers.json`                                              |
| `check:jsdoc`     | a source module without a `@module` JSDoc, or an export without a JSDoc                        |
| `lint`            | what oxlint refuses: import cycles, `any`, and below the host the clock, randomness or the process |
| `typecheck`       | what TypeScript refuses, tests included                                                        |

Below the gates, the tests mount the host on a real Cordis context with a fake terminal, and load the built bundle under plain `node` the way a profile does. Then CI installs the `dsh` launcher at the pin, writes the profile, and `check:boot` boots the bundle under it, drawing nothing.

## How it follows upstream

`pnpm upstream` reads each release past a pin. Daily, the upstream job carries the newest on a branch, `upstream/<reference>/<version>`: the pin moved with `pnpm pin`, the tests and the boot run, and the verdict in the commit message. It never touches `main`; merging the branch is the upgrade.
