# 5. A built-in feature is a plugin that holds only what an author holds

- Status: accepted; extends [ADR 2](0002-five-layers-and-the-registrations-an-author-shares.md); a built-in feature made a row of binnacle's patch, updated in place
- Date: 2026-09-26

## Context

A feature — signing in, exporting a session, settings, a slash command — is no one layer's. It adapts some facts, folds a model, draws views, offers affordances and commands, and needs an effect the surface cannot perform on its own: a file written, a secret read, a page opened.

[ADR 2](0002-five-layers-and-the-registrations-an-author-shares.md) commits that the built-in surface registers through the same doors an author does, so anything built in can be drawn, replaced or removed by an author. Nothing says where a feature's code lives, and nothing holds that commitment: a feature spread across the layers can reach internals no author can, and the layer gate cannot tell a feature's import from the mechanism's.

Nor does registering through an author's doors let a person remove a feature. An author can place something newer over a placement, but lines slots draw every placement, so a line the host applied cannot even be covered; and a feature the host applies is there whatever the profile says. dsh already has the way a person removes a plugin: a row of a profile's patch, disabled by the person's own patch by its id.

## Decision

**A built-in feature is a Cordis plugin in `src/plugins/<feature>`, loaded as a row of binnacle's patch, and it holds only what an author holds.**

- It is a row of its own, after binnacle's, naming the subpath of binnacle its module is exported at; the module is the plugin, as dsh's loader takes a row's. A person removes it as they remove any dsh plugin: their profile's patch disables its row by its id. A feature bound to the scope of the session's agent cannot be a row, since a row cannot be bound to that scope; the host applies it on that scope once the session opens.
- It contributes to the surface only through the registrations on `ctx.binnacle`, and it imports from binnacle only the author API, `src/api.ts`, type-only. Its own adapters, folds, views and command logic live in its own file or folder; it never imports another feature's.
- It reaches dsh only through services it names in `inject`, typed against `Context` ([ADR 3](0003-dsh-is-reached-through-named-seams-each-held-by-a-gate.md)).
- It reads no clock, randomness, environment or process, and imports no `node:` module. An effect is a grant: a service the host provides and names, as a seam into dsh is named.
- What more than one feature needs moves down into the layers. What a feature needs from them at run time joins the author API by an explicit decision, since every author depends on that API.

`layers.json` states the `plugins` layer, and `check:layers` holds it.

## Alternatives considered

**Let the host apply every built-in feature**, beside the surface it draws on. The host decides what loads, and the features start and stop with it. It lost because a person then removes a feature only by asking an author for code that covers it, which a lines slot does not allow, rather than by the one line dsh already gives every plugin.

**Spread a feature across the layers**: its model in `models`, its views in `views`, its command in the host. Each piece sits where its kind sits. It lost because a feature is then found in four places, and the built-in surface reaches internals an author cannot — the private door ADR 2 forbids, where no gate can see it.

**Keep a feature in its own folder, but let it import the layers.** Its views reuse the built-in helpers with no API decision. It lost because a feature that can import the layers can do what an author cannot, so "anything built in, an author can replace" becomes a claim nothing checks.

**Let a feature perform its own effects** — write the file, read the process. Fewer grants to design. It lost because a feature that touches the process can only be tested through it, and an effect a feature performs itself is one an author's replacement cannot take over.

## Consequences

- A person removes a built-in feature from their profile's patch, by its row's id, with no author code; a feature bound to the agent's scope is removed only by an author.
- The manifest exports each feature row's module, and `check:patch` holds each row to the tree it lands on.

- `check:layers` proves the built-in surface has no private door, for everything that lives in a plugin.
- A helper a feature needs from the layers becomes author API. That is the cost, and the point.
- The author API grows by one grant per kind of effect.
- A feature reads the registrations through an interface declared below the host and implemented by it, so the author API imports nothing from the host.
- The transcript's own views stay in `views`, beneath the registrations: an author replaces one by registering a view for its kind.
