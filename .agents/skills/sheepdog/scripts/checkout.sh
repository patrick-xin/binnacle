#!/bin/sh
# Check out a commit detached in /tmp/<name>, for verifying or reviewing it apart from any Sheep's Fold, and print where.
# With --borrow, it borrows the main checkout's installs and references, for a quick pnpm test; without, a reviewer
# installs its own (CI=true pnpm install --frozen-lockfile && pnpm refs). Remove it with: git worktree remove --force /tmp/<name>
set -e
borrow=; [ "$1" = --borrow ] && { borrow=1; shift; }
name=$1; commit=$2; dir=/tmp/$name
main=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
cd "$main"
git worktree remove --force "$dir" 2>/dev/null || true
git worktree add -q --detach "$dir" "$commit"
if [ -n "$borrow" ]; then
  ln -s "$main/node_modules" "$dir/node_modules"
  ln -s "$main/packages/binnacle/node_modules" "$dir/packages/binnacle/node_modules"
  ln -s "$main/.refs" "$dir/.refs"
fi
echo "$dir"
