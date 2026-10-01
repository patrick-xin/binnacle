# Publish flow, commit lint, formatting + hygiene

Accepted by the maintainer. The Sheep building it works from this file. Every fact here was read from the current tree, its history, or the `eve` reference.

Two facts shape the plan:
- Unscoped `binnacle` is **taken** on npm (a 2015 jQuery package, latest 0.0.5). A public publish will need `@patrick-xin/binnacle`, which is free.
- The folder-notes, links and paths gates bind only `packages/binnacle/src/` and Markdown links, so new top-level files are safe.

**Nothing runs on GitHub until the repository is public.** Every workflow, the new `release.yml` included, triggers on `workflow_dispatch` alone. That is how `ci.yml` already runs. `upstream.yml`'s existing daily schedule is out of scope and stays as it is.

## 0. Branch, issue, and this file

- Work on `infra/publish-flow`. Every commit ends `Issue #<n>.`, where `<n>` is the issue this plan's body is posted on, given in the brief.
- `PLAN.md` is deleted on the branch before the PR opens and is never merged to `main`. AGENTS.md gives work not yet built one home, an issue, so the plan's body lives there.
- `eve` is in the tracked `references.json`, so citing an eve file by its name and path resolves, and is allowed in prose outside `src/` and the ADRs. What eve was read for goes on the issue.
- Load `sheep` first, then `tdd` before the first test, and `writing-for-agents` before editing a skill or AGENTS.md.

## 1. Formatting — oxfmt, one repo-wide commit, then a gate

This comes **first**, so that no later commit carries format churn.

- Root devDep `oxfmt`, pinned exact. Take the current version from `npm view oxfmt version`: `check-pins` refuses a range.
- `.oxfmtrc.json`:
  - `$schema` `./node_modules/oxfmt/configuration_schema.json`, as eve's has;
  - `singleQuote: true` and `semi: false`, the tree's style;
  - `sortPackageJson: false`, so key order doesn't churn;
  - `ignorePatterns`: `pnpm-lock.yaml`, `**/*.md`, `.refs/**`, `**/dist/**`.
  - Markdown is ignored because the records' tables, emphasis and list markers are written by hand.
  - Check each option name against the installed `configuration_schema.json`, not this plan.
- **Line width is the real style decision.** Under `src/`, `test/` and `scripts/`, 2,355 lines run past 100 characters and 444 past 160. A Prettier-family formatter wraps those, and joins short multi-line constructs, at any `printWidth`. So there will be a repo-wide reformat, and it is made once, deliberately:
  1. Dry-run `oxfmt --check` at `printWidth` 100, 120 and 140. Count the files and lines each would change. Pick the smallest diff that reads well (expect 140), and record the counts on the issue.
  2. Make **one commit that does nothing but format the tree** (`pnpm fmt`). Read its YAML diff (`cordis.patch.yml`, the workflows): if oxfmt rewrites anything in a way that changes meaning or comments, add that file to `ignorePatterns` and redo the commit.
  3. Run `pnpm test` and `pnpm check:boot`; both must be green on that commit. `check-comments` counts comments per file against `scripts/check-comments-baseline.json`, and a formatter moves comments but doesn't add any. Confirm that rather than assume it.
  4. A **following** commit adds `.git-blame-ignore-revs` holding the format commit's full sha, with one line saying why.
- Root scripts: `fmt: oxfmt` and `fmt:check: oxfmt --check`. **`fmt:check` joins `pnpm check`**, after `lint`. With it, formatting is a gate, and the hook below is a convenience.
- `.githooks/pre-commit` runs `exec node scripts/format-staged.mjs`. The script follows eve's `scripts/pre-commit-fmt.mjs`:
  - format the staged files (Added/Copied/Modified/Renamed) that oxfmt recognizes, then `git add` them again;
  - **skip a partially-staged file** with a warning naming it, so unstaged edits never ride into the commit;
  - treat oxfmt's exit 2 ("no target files") as a no-op;
  - stand aside when `$GITHUB_ACTIONS` is set, as `pre-push` does;
  - **never unset `GIT_INDEX_FILE`**: `git commit <paths>` stages into a temporary index that git names there.
- **The seam is an exported pure function**, written red-first in `scripts/format-staged.test.mjs` (`node:test`, `node:assert/strict`). It takes the staged paths, the unstaged paths and which paths exist, and returns `{ format, skipped }`. Test cases:
  - a partially-staged file is skipped;
  - a rename's old half (missing on disk) is dropped;
  - an empty stage formats nothing.

  The `git` and `oxfmt` calls stay a thin shell around it, run only when the file is the entry point.
- Keep comments rare, as the repo does: eve's script carries a long design-notes header, and this one gets a line or two of why at most.

## 2. Commit lint — Conventional Commits

- Root devDeps, exact pins: `@commitlint/cli` and `@commitlint/config-conventional`.
- `commitlint.config.mjs` extends `@commitlint/config-conventional`.
  - `ignores: [(message) => /^Move the \S+ pin to /.test(message)]`. This is the upstream job's mail commit, from `upstream.yml`'s message.
  - Merge commits need no entry: commitlint's `defaultIgnores` pass `Merge …`.
- **Three defaults refuse this repo's own messages, so they are decided, not inherited.** Of the last 40 headers on `main`, 16 run past 100 characters, and bodies are prose with lines past 100.

  | Rule | Setting | Why |
  |---|---|---|
  | `body-max-line-length` | `[0]` (off) | A body is prose, and the red-first story quotes failures verbatim. |
  | `footer-max-line-length` | `[0]` (off) | Same reason as the body. |
  | `header-max-length` | stays 100 | The header becomes the short claim, and today's long header text moves to the body. This is a change of voice, and the sheep skill says so. |
  | `subject-case` | stays | A subject starts lowercase: `feat: the Sheepdog reads…` passes; `feat: The Sheepdog reads…` is refused. |
- **The default-export exception.** commitlint reads its config as a default export, and `.oxlintrc.json` holds `import/no-default-export` as an error. Add one `overrides` entry, `files: ["commitlint.config.mjs"]`, that turns that rule off. JSON has no comments, so the commit says why. Run `pnpm lint` to confirm that `unicorn/filename-case` accepts the dotted name.
- `.githooks/commit-msg`, executable, in `pre-push`'s shape:
  ```sh
  [ -n "$GITHUB_ACTIONS" ] && exit 0
  exec pnpm exec commitlint --edit "$1"
  ```
  - It does **not** copy `pre-push`'s `unset GIT_DIR…`. That line exists for the gates' git calls into `.refs/`, and commitlint makes none.
  - Hooks are already wired by `prepare` (`core.hooksPath .githooks`).
  - Make sure the hook works in a linked worktree (a Sheep's Fold) as well as in the main checkout.
- Root script `lint:commits: commitlint --from origin/main --to HEAD`, for use by hand. It is **not** in `pnpm check`, because it lints messages, not files.
- **Teach the writers in the same commit as the hook**, so no agent meets a refusal its skill didn't warn of:
  - **`sheep`, Commits:** the header is `type: what changed, for a person or an author`, with a scope when it helps (`feat(transcript):`), at most 100 characters, starting lowercase. The body keeps the why and the red-first story. The message ends `Issue #<n>.`.
  - **`sheepdog`, review rounds:** a round's fix is headed `fix: <what changed> (#<n> review, round N)` instead of today's `Round N of #<n>'s review: …`, which has no type.
  - **Stand unchanged:** `tdd` and `review` prescribe what a body says, not its shape. The PR template says only that the story is in the commits.
- AGENTS.md, records table: the "what one change did and why" row reads "its commit message, headed as Conventional Commits (`commitlint.config.mjs`)".
- From the commit that adds the hook onward, every commit on the branch conforms. The ones before it are not rewritten.

## 3. Publish flow — ready, dormant until public

- Root devDep `@changesets/cli`, exact pin.
- `.changeset/config.json`, from eve's, with one difference:
  - `$schema`;
  - changelog `@changesets/cli/changelog`;
  - `commit: false`, `access: public`, `baseBranch: main`;
  - `updateInternalDependencies: patch`, `fixed: []`, `linked: []`, `ignore: []`;
  - **`privatePackages: { version: true, tag: false }`** (eve has `version: false`). A private `binnacle` still gets versions and a changelog, while `changeset publish` skips it, so nothing can reach npm.
- `.changeset/README.md`: the standard short explainer that `changeset init` writes.
- Root scripts: `changeset: changeset`, `version-packages: changeset version`, `release: pnpm build && changeset publish`.
- `.github/workflows/release.yml`:
  - **Trigger:** `on: workflow_dispatch` only, with a comment like `ci.yml`'s: "Run by hand while the repository is private; a push to main runs it once it is public."
  - **Concurrency:** `group: ${{ github.workflow }}-${{ github.ref }}` and `cancel-in-progress: false`, because aborting mid-publish strands packages on npm.
  - **Permissions:** `contents: write` and `pull-requests: write`.
  - **Steps:**
    - `actions/checkout@v4` with `fetch-depth: 0`: changesets' deepen loops crash on shallow clones;
    - `pnpm/action-setup@v4`;
    - `actions/setup-node@v4` with `node-version-file: .nvmrc` and `cache: pnpm`;
    - `pnpm install --frozen-lockfile`;
    - `changesets/action` at its current major (eve pins v2.1.1), with the version script `pnpm version-packages`, the publish script `pnpm release`, `commit: 'chore: version packages'`, `title: 'chore: version packages'`, and env `GITHUB_TOKEN`.
    - Input names differ between majors: eve's v2 uses `version-script`/`publish-script`, and v1 used `version`/`publish`. Read them from the action's README at the version pinned.
  - **No gate and no `pnpm refs`:** `pnpm build` never reads `.refs/`. Tags (`@v4`) match the repo's other workflows, not SHAs.
  - Validate the YAML with `actionlint` if it is installed; otherwise parse it with `js-yaml` (already a devDep) and say so.
- `packages/binnacle/package.json` is untouched. Going public is a separate issue, which the Sheep drafts as text in its DONE report rather than opening it. It covers:
  - renaming the package to `@patrick-xin/binnacle`, which ripples into the root scripts' `--filter binnacle` and `scripts/profile.mjs`, which mounts the profile by the bundle name;
  - dropping `"private": true`;
  - adding npm auth: an `NPM_TOKEN` secret, or trusted publishing with `id-token: write`, as eve uses;
  - adding `push: branches: [main]` to `release.yml` and `ci.yml`;
  - turning on the repository setting *Allow GitHub Actions to create and approve pull requests*.

## 4. Structure

Unmarked entries exist today; `+` marks what this change adds; `++` marks what a later CLI adds.

```
binnacle/
├── .changeset/                 # + config.json, README.md
├── .githooks/                  #   pre-push · + pre-commit (oxfmt on staged) · + commit-msg (commitlint)
├── .github/workflows/          #   ci, upstream · + release — all by hand while private
├── .agents/skills/             #   sheep and sheepdog edited
├── docs/
├── packages/
│   ├── binnacle/               #   untouched
│   └── binnacle-cli/           # ++ published as @patrick-xin/binnacle-cli
├── scripts/                    #   + format-staged.mjs, format-staged.test.mjs
├── .git-blame-ignore-revs      # +
├── .nvmrc                      # +
├── .oxfmtrc.json               # +
├── commitlint.config.mjs       # +
├── CONTRIBUTING.md             # +
├── SECURITY.md                 # +
└── pnpm-workspace.yaml         #   packages/*, unchanged
```

- **No `apps/` folder.** A website or other app is decided when it is real, as its own issue.
- **A CLI lives in `packages/binnacle-cli`.** It joins the workspace through the existing `packages/*` glob, and changesets and `release.yml` pick it up with no change. The gates that hard-code `packages/binnacle` get generalized on that branch, not this one: `check-folder-notes`, `check-layers`, `check-jsdoc`, `check-comments`, `check-words`, `map`, `pin`, `upstream` and `profile`.
- **Scopes are optional and free**, and name a package or feature (`feat(cli):`, `fix(transcript):`).

## 5. Extras

- **`.nvmrc`:** `24`, which matches `engines` and the Node version the workflows hard-code today. `ci.yml` and `upstream.yml` switch to `node-version-file: .nvmrc`.
- **`CONTRIBUTING.md`:** short, and it **links rather than restates**, since each fact has one home.
  - Setup, the commands and what `pnpm test` holds → AGENTS.md *Working here*.
  - Branch → PR → merge commit → AGENTS.md's records section.
  - The commit convention → `commitlint.config.mjs`.
  - Its own content: when a change needs a changeset (a change a person or an author of the published package would notice) and how to add one (`pnpm changeset`).
- **`SECURITY.md`:** report privately through GitHub's private vulnerability reporting (Security → Report a vulnerability), never in a public issue. One short paragraph.
- **AGENTS.md:** the *Working here* table gains rows for `pnpm fmt` and `pnpm changeset`; the records-table row changes as in §2. No other prose changes.
- **No ADR** (this is process, not architecture), no `src/` changes, and no pin moves.

## 6. What the gates hold against this change

- **`check-pins`**: `oxfmt`, `@commitlint/cli`, `@commitlint/config-conventional` and `@changesets/cli` are pinned exact.
- **`fmt:check`** (new): every file oxfmt formats is formatted.
- **`check-comments`**: binds `packages/*/src` against its baseline. It must hold after the format commit.
- **`check-links`, `check-paths`, `check-citations`, `check-placeholders`**: new Markdown has no dangling relative link, no machine path, no citation that fails to resolve, and no privacy-tool placeholder.
- **oxlint**: new scripts are kebab-case with named exports. The `commitlint.config.mjs` override is the one exception.
- **`check-skills`**: `sheep` and `sheepdog` are edited in place, each keeping one copy and its `.claude/skills` link.

## 7. Examined in eve, deliberately not taken

- **Org-scale process:** DCO, CODEOWNERS, CODE_OF_CONDUCT, NOTICE and a signed-commit policy, which suit many maintainers; this repo has one.
- **Multi-package scale:** turbo, syncpack, the workspace `catalog:`, `minimumReleaseAge`, `.npmrc`. Revisit when a second package lands.
- **Product workflows:** docker, bundle and image-size analysis, e2e matrices, benchmarks.
- **Workflow machinery:** `.github/actions/` and `.github/scripts/`.
- **Deploy plumbing:** Vercel files.
- **`scripts/install-git-hooks.mjs`:** binnacle's `prepare` already sets `core.hooksPath`.
- **A `bin/` inside the main package:** binnacle's surface is a dsh bundle a launcher mounts, so a CLI is its own package.

## Order of work

1. oxfmt dep, config and scripts, then the dry-run widths, recorded on the issue.
2. The format-only commit.
3. `.git-blame-ignore-revs`.
4. `format-staged` red → green, the pre-commit hook, and `fmt:check` in `pnpm check`.
5. commitlint deps, config, oxlint override, hook, and the sheep and sheepdog skills, in one commit.
6. Changesets: deps, config, scripts, and `release.yml`.
7. `.nvmrc` and the workflows switching to it.
8. CONTRIBUTING.md, SECURITY.md and the AGENTS.md rows.
9. Delete `PLAN.md`.
10. `pnpm test` and `pnpm check:boot`, both green.
11. Guard demonstrations, each said in the commit that adds the guard:
    - a header like `Bad header.` is refused, with commitlint's message quoted;
    - a `Merge …` message and a long body line pass;
    - a staged misformatted `.ts` file is formatted and staged again;
    - a partially-staged file is skipped with the warning;
    - `fmt:check` goes red on a misformatted file, then back to green.
12. DONE, with the going-public issue text from §3.

## Success criteria

- `pnpm test` and `pnpm check:boot` are green; no runtime behavior changed; `PLAN.md` is gone.
- The format commit is formatting only, and `.git-blame-ignore-revs` names it.
- `commit-msg` refuses a non-conventional header, a header over 100 characters and a capitalised subject. It passes `Merge …`, `Move the dsh pin to …` and long body lines.
- The pre-commit hook formats fully-staged files, skips partially-staged ones, and stands aside under `$GITHUB_ACTIONS`.
- `release.yml` parses, triggers only on `workflow_dispatch`, and declares its permissions. No workflow runs on push.
- No changeset is added by this change. The first rides with the next feature.
