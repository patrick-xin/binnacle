# A built-in feature is a plugin that holds only what an author holds

A built-in feature is a plugin in its own folder, loaded as its own row of binnacle's patch, holding only what an author holds: the author API, type-only, the dsh services it names, and grants for its effects. So a person removes it by disabling its row in their own patch, and the gate that holds the layers proves the built-in surface has no private door ([ADR 0](0000-everything-is-a-plugin-a-person-changes-by-asking-an-author-agent.md)). What more than one feature needs moves down into the layers, and what a feature needs from them joins the author API by decision.

## Considered Options

- **Let the host apply every built-in feature.** The host decides what loads. Rejected because a person could then remove a feature only by asking an author for code to cover it, and some slots cannot be covered.
- **Spread a feature across the layers**, its model in models and its command in the host. Rejected because a feature is then found in four places, and it reaches internals no author can, where no gate sees it.
- **A feature in its own folder that may import the layers.** Its views reuse the built-in helpers. Rejected because "an author can replace anything built in" then becomes a claim nothing checks.
- **Let a feature perform its own effects.** Fewer grants to design. Rejected because it can then only be tested through the process, and an author's replacement cannot take the effect over.

## Consequences

- A feature bound to the session agent's scope cannot be a row, so the host applies it, and a profile cannot remove it.
- The author API grows by a grant for each kind of effect, and a helper a feature needs becomes author API. That is the cost, and the point.
