# Intent: binnacle starts again in a new repository

- **Author:** Patrick Xin
- **Role:** Maintainer
- **Status:** approved
- **Date:** 2026-10-13

## Problem

binnacle has had no release yet, but this repository has about 200 issues and more than 700 commits. They come from v0, from the legacy code and from References that binnacle does not need now. These problems occur:

1. **Agents read noise.** Each feature doc ends in a list of Specs, Tickets and PRs. An agent reads that list on each Task and almost never follows it. An agent also copies the pattern into new docs.
2. **The checks fix old gaps.** Many checks exist because of v0 or the legacy code. Some checks do work that a toolchain config can do.
3. **The docs drift.** People, authors and the agents in this repository each read their own docs. One fact has more than one home, and nothing keeps the copies the same. For example, the author guide and the feature docs both describe the actions.
4. **binnacle has no command of its own.** A person runs it through a dsh profile that they set up by hand.
5. **Versions can disagree with no message.** When dsh changes, or when only one copy of binnacle changes, binnacle can stop with no clear message.

## Proposed outcome

1. A new repository holds binnacle. It is a monorepo on Vite+ and a pnpm workspace, with the package and a docs website.
2. The product code and its tests move to the new repository in one commit. Then the open issues are done in one session. Only an issue that the move did not make obsolete is filed again in the new repository.
3. The new repository cites no issues and keeps no history lines. Git and GitHub keep the history.
4. One folder of docs is the only copy for people and for authors. The docs website shows it, and the package carries it, so the docs that an author reads match the version that the author installed.
5. A note beside the code tells the agents in the repository how that code is built.
6. A person installs binnacle and runs `binnacle` with flags, such as `binnacle --resume <id>`. binnacle stays a dsh plugin. The command installs binnacle into its own dsh profile on the first run, and then starts dsh with that profile.
7. When the versions disagree, binnacle puts them right or tells the person what to run. binnacle never starts with no screen and no message.
8. binnacle tells a person once about each new version. The person can upgrade, ignore it, or turn the notice off.

## Affected users and systems

- **People who use binnacle:** they install it from npm and run the `binnacle` command.
- **Authors and their agents:** they read the docs that the package carries.
- **The Maintainer:** names the new repository and the npm scope, publishes, and archives this repository.
- **The agents in the new repository:** they read the code, the notes beside it, the ADRs and the docs.
- **dsh:** binnacle is a plugin in a dsh profile. dsh installs plugins with pnpm, and it checks a plugin's dsh peers when it installs or starts it.
- **npm and GitHub:** the scope `easeshine` on both.

## Constraints

1. The package is `@easeshine/binnacle`. The command is `binnacle`. The new repository takes the name `binnacle`, and this repository gets a new name and is archived. Its links to its issues break, and that is accepted.
2. The toolchain is Vite+, with pnpm 12. CI runs the full check of Vite+.
3. The docs website uses TanStack Start, and content-collections reads the docs.
4. From this repository, these things move: the Intents, the ADRs, both glossaries, the coding standard, the anti-slop lint rules, and the licence notices. The skills that move are `architecture`, `diagnosing-bugs`, `grill`, `tdd` and `writing-for-agents`. More can move later if the new repository needs them.
5. These things stay behind: the task tool, its roles, the skills for Tasks, the custom checks, and all References to v0 or the legacy code. A check comes back only when the new repository shows that it needs it.
6. dsh and pi stay as References, so agents can read the source that binnacle is built on.
7. The tests use the test runner of Vite+.
8. The package exports only what an author may import. The command is not an export.
9. binnacle uses changesets for releases, as now.
10. The `binnacle` command runs on macOS, Linux and Windows. No one tests it on Windows yet, and that does not stop a release.
11. The `binnacle` command never installs pnpm or dsh. It tells the person what to install.
12. The `binnacle` command never accepts an incompatible version for the person. dsh lets a person accept that risk, and only the person does it.
13. binnacle accepts a narrow range of dsh versions. A CI job tries each new dsh, and it opens a pull request that widens the range when the tests pass.

## Stages

Each Stage ends in a behaviour that the Maintainer can try.

1. **The new repository.** The monorepo, its checks and CI pass. The product code and its tests are in it, and `vp run ready` passes. The Maintainer runs binnacle from the new repository through a dsh profile.
2. **The open issues.** The open issues of this repository are done or filed again in the new one. This repository is renamed and archived.
3. **The docs.** One docs folder is the only copy. The website shows it, the package carries it, and a skill tells an author's agent where it is. The Maintainer reads one page on the website and the same page in the package.
4. **The command.** `binnacle` installs itself into its profile, keeps the profile at its own version, checks dsh, and starts. The Maintainer runs `binnacle --resume <id>`, and sees the message for each version that disagrees.
5. **The first release.** The package is on npm, with the notice of a new version. The Maintainer installs it with npm and runs it.

## Found in Stage 1

The move showed these frictions in the structure of the project. Each one names the Stage that removes it.

1. **The package's name is in many places.** The rename touched the row names in `cordis.patch.yml`, the check in `service.ts` that knows a built-in by its name, `testing/index.ts`, the tests and AUTHORING.md. binnacle reads the name from one place. *Stage 2.*
2. **dsh's version has two pins.** `references.json` pins `.refs/dsh`, and the package's peers pin dsh's packages. Nothing keeps them the same. The CI job of Constraint 13 changes both, or a check compares them. *Stage 2.*
3. **The workflow's words have no workflow.** Spec and Journey moved, but the process that made Specs stayed behind. The new repository says how a feature is designed now, or drops the words. *Stage 2.* Done: a Spec is `intents/<slug>/spec.md` beside its Intent, and its parts replace its Tickets. Issues hold the gaps and the bugs.
4. **AUTHORING.md has about 1,200 lines.** Its built-ins part, about 500 lines, repeats `docs/features/*.md`. It splits into pages when the docs folder is made: start, concepts, components and built-ins. Three test files read the one file, so they then read the folder. *Stage 3.*
5. **The docs hold paths.** `docs/features.md` lists the files of each feature, and a move breaks the paths with no failure. The notes beside the code (outcome 5) take this job. *Stage 3.*
6. **The package carries only its own folder.** `files` takes no path outside `packages/binnacle`, so the docs folder lives in the package, or a step copies it in when the package is packed. *Stage 3.*

These were fixed before the first commit:

- The files copied from pi-tui moved to `src/terminal/pi/`. One glob in `vite.config.ts` now replaces two lists that did not agree.
- The workflow's words moved from `.agents/glossary.md` into `AGENTS.md`.
- The docs app takes `typescript` and `@types/node` from the catalog, and its `pnpm` field is gone.
- The skills run tests with `vp test`, and `grill` and `tdd` no longer need a Spec or a Round.
- AGENTS.md names the package's tasks `@easeshine/binnacle#build` and `#test`. The short name `binnacle#build` is the root's, and fails.

The package test packs the package, so `vp run ready` builds it twice. The build takes under a second, and the test must pack what is published, so this stays.

## Specs

None yet.

## Open questions

None.
