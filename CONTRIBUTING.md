# Contributing to binnacle

[AGENTS.md](AGENTS.md) is the one page that binds: the commands in its *Working here* table, the records map in its *Where a record lives*, and the flow it names at the end — a branch, a pull request reviewed by a second model as well as the maintainer, `pnpm test` green on it, merged with a merge commit, never squashed.

## Commits

A header is Conventional Commits, held by `commitlint.config.mjs` and the `commit-msg` hook: `type: what changed`, a scope when it helps, at most 100 characters, starting lowercase. The body says why, then how each test it adds failed first, in the failure's own words, and ends `Issue #<n>.`.

## Changesets

A change a person or an author of the published package would notice carries a changeset: `pnpm changeset` at the root picks patch, minor or major and asks for a line a person reads. Merged changesets wait in `.changeset/` until the release workflow turns them into a version pull request. While the repository is private that workflow runs by hand and nothing publishes: `changeset publish` skips a private package.
