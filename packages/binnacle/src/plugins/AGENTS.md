# plugins

binnacle's built-in features, each a Cordis plugin beside the surface it draws on. Each is a row of binnacle's patch, loaded from its subpath (`binnacle/plugins/<feature>`), so a person's profile can disable it by its id; Approvals and Questions, bound to the session's agent, are applied by the host on that agent's scope instead. What they register with is the author API (`api.ts`); the `binnacle` service behind it is the host's; dsh's services are dsh's, reached only as each names them in `inject`.

- `approvals/` — Approvals: what the agent asks to do, allowed once or rejected in the composer's seat.
- `composer/` — the Composer: where a person types a line and sends it, or runs it as one of dsh's commands.
- `questions/` — Questions: what the agent asks a person, answered in the composer's seat a question at a time.
- `status-line/` — the Status line: the model, tokens used and share of context under the composer, or a notice in its place.
- `tool-cards/` — the tool cards: each tool call drawn from what its tool presents, instead of its name and raw JSON.
- `trajectory/` — the Trajectory: every event of a session on a screen of its own.
- `transcript/` — the Transcript: the session log drawn as turns, in the transcript's place.

## Keep

- A built-in feature holds only what an author holds: the author API, type-only; the dsh services it names in `inject`; grants for its effects ([ADR 5](../../../../docs/adr/0005-a-built-in-feature-is-a-plugin-that-holds-only-what-an-author-holds.md)). It places or registers where an author could, so an author can place something newer over it.
- A plugin spells no key: which keys answer something is the key table's, and an ask names them on its edge. `check:words` refuses a key named in a plugin's words.
- A feature's `index.ts` is the plugin a row loads: it exports `name`, `inject` and `apply`, and no default, for dsh's loader takes the module as the plugin.
