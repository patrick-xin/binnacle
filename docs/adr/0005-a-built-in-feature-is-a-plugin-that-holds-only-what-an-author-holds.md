# 5. A built-in feature is a plugin that holds only what an author holds

- Status: accepted; extends [ADR 2](0002-five-layers-and-the-registrations-an-author-shares.md)
- Date: 2026-09-26

## Context

A feature — signing in, exporting a session, settings, a slash command — is no one layer's. It adapts some facts, folds a model, draws views, offers affordances and commands, and needs an effect the surface cannot perform on its own: a file written, a secret read, a page opened.

[ADR 2](0002-five-layers-and-the-registrations-an-author-shares.md) commits that the built-in surface registers through the same doors an author does, so anything built in can be drawn, replaced or removed by an author. Nothing says where a feature's code lives, and nothing holds that commitment: a feature spread across the layers can reach internals no author can, and the layer gate cannot tell a feature's import from the mechanism's.

## Decision

**A built-in feature is a Cordis plugin in `src/plugins/<feature>`, and it holds only what an author holds.**

- It contributes to the surface only through the registrations on `ctx.binnacle`, and it imports from binnacle only the author API, `src/api.ts`, type-only. Its own adapters, folds, views and command logic live in its own file or folder; it never imports another feature's.
- It reaches dsh only through services it names in `inject`, typed against `Context` ([ADR 3](0003-dsh-is-reached-through-named-seams-each-held-by-a-gate.md)).
- It reads no clock, randomness, environment or process, and imports no `node:` module. An effect is a grant: a service the host provides and names, as a seam into dsh is named.
- What more than one feature needs moves down into the layers. What a feature needs from them at run time joins the author API by an explicit decision, since every author depends on that API.

`layers.json` states the `plugins` layer, and `check:layers` holds it.

## Alternatives considered

**Spread a feature across the layers**: its model in `models`, its views in `views`, its command in the host. Each piece sits where its kind sits. It lost because a feature is then found in four places, and the built-in surface reaches internals an author cannot — the private door ADR 2 forbids, where no gate can see it.

**Keep a feature in its own folder, but let it import the layers.** Its views reuse the built-in helpers with no API decision. It lost because a feature that can import the layers can do what an author cannot, so "anything built in, an author can replace" becomes a claim nothing checks.

**Let a feature perform its own effects** — write the file, read the process. Fewer grants to design. It lost because a feature that touches the process can only be tested through it, and an effect a feature performs itself is one an author's replacement cannot take over.

## Consequences

- `check:layers` proves the built-in surface has no private door, for everything that lives in a plugin.
- A helper a feature needs from the layers becomes author API. That is the cost, and the point.
- The author API grows by one grant per kind of effect.
- A feature reads the registrations through an interface declared below the host and implemented by it, so the author API imports nothing from the host.
- The transcript's own views stay in `views`, beneath the registrations: an author replaces one by registering a view for its kind.
