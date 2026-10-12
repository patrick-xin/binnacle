# Upstream

These rules started as a copy of [anti-slop](https://github.com/dmmulroy/anti-slop), at commit `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b` (2026-09-10), from `skills/install-anti-slop/assets/anti-slop/`. They are binnacle's now: change them as binnacle needs, and test each change in `rules.test.mjs`.

## What binnacle changed

- Kept 6 of the 18 generic rules: `no-chained-type-assertions`, `no-module-mocking`, `no-reduce-accumulator-copy`, `no-reflect-apply`, `no-reflect-get` and `no-widen-then-assert`. Removed the others, their shared helpers, the vendored Stylistic code and the Effect plugin.
- Removed the rules that object to how binnacle reads dsh's untyped data at its boundary (`no-unknown-parameters`, `no-unknown-returns`, `no-runtime-typeof`, `no-unsafe-dictionary-type`), the rules that are taste (`require-readable-spacing`, `no-conditional-empty-object-spread`, `no-known-value-widening`, `no-shape-in-symbol-names`) and `no-array-filter-map`.
- Renamed `require-safety-comment-for-type-assertion` to `require-comment-for-type-assertion`. Any comment above the assertion is accepted, with no `SAFETY:` marker, as `CODING-STANDARD.md` says how a comment is written. A comment above a one-line `if` covers an assertion in its statement.
- Formatted with binnacle's `oxfmt`, and linted with binnacle's rules.

## To read a later upstream change

Diff the upstream path between the commit above and the new one, and copy only what binnacle wants. Then record the new commit here.
