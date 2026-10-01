# Contributing to binnacle

[AGENTS.md](AGENTS.md) is the one page that binds: its *Working here* commands, its *Where a record lives* map, and the branch-to-pull-request flow it names at the end.

## Commits

A header is Conventional Commits, held by [`commitlint.config.mjs`](commitlint.config.mjs) and the `commit-msg` hook; what the body says is the sheep skill's, *Commits*.

## Changesets

A change a person or an author of the published package would notice carries a changeset: `pnpm changeset` at the root picks patch, minor or major and asks for a line a person reads. Merged changesets wait in `.changeset/` until the release workflow turns them into a version pull request. While the repository is private that workflow runs by hand and nothing publishes: `changeset publish` skips a private package.
