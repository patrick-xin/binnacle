# Presets

A session's agent runs on a **preset**: the composition that says which tools it has, which persona and instructions it carries, how it delegates and how it compacts. binnacle ships dsh's four web presets, and one of its own:

- **standard** — the coding agent: shell, files and search, skills, goals, plan mode, compaction, delegation and the web, asking a person what it needs to ask. This is the default.
- **ptc** — standard's composition with workflow delegation off, its tools presented through dsh's ptc runtime.
- **minimal** — a persistent shell and little else: a complete persona of its own, no delegation, no goals, no compaction — and no way to ask a person a question, for it composes no ask-user tool.
- **cordis** — dsh's creator mode, built for the web: it reads and edits the composition it runs on. It mounts, so the roster is dsh's, but it is a web preset; the picker will show it greyed out (#109).
- **author** — standard with binnacle's own two rows: its agent finds the skills in binnacle's `skills/` directory — where the author skill will live (#97) — and it can change the profile's plugins with `plugin_manager`, but only when binnacle runs under a profile. This is the preset an author agent is asked in; everything else is an ordinary coding agent without the author's tools.

A session in any preset is the same surface: the transcript, the composer, the keys — only what the agent is composed of changes.

## Choosing, for now

A preset is chosen for the sessions a profile opens by overriding the registry's `default` in the profile's own `cordis.patch.yml`:

```yaml
- id: agent-preset-registry
  config:
    default: author
```

The choice takes effect at session start: dsh rebinds a session's preset only while the session is still blank (`dsh:packages/preset/agent-preset-registry/src/index.ts#AgentPresetRegistry`). The `/preset` picker, and `cordis` greyed out in it, is #109.

## How it works

The bundle's patch mounts dsh's preset registry (`dsh:packages/preset/agent-preset-registry/src/index.ts#AgentPresetRegistry`) with `default: standard`, beside three host rows the presets read: the subagent model-selection opt-in every preset with delegation samples (`@deepseek-ai/dsh-tool-subagent/model-selection-settings`), and the cordis host runner with the process-global inspect providers on top of it, which the `cordis` preset's tool reads. The preset declarations follow as files under [`presets/`](../../packages/binnacle/presets/) in the package, listed after the patch in its `dsh.bundle.patch`: dsh's four copied byte for byte from where dsh's web bundle ships them (`dsh:packages/bundle/web-app/presets/`), and binnacle's `author`, whose other rows are `standard`'s. A gate holds all of that to dsh at the pin (`binnacle:scripts/check-presets.mjs`), so moving the pin brings the new copies along and an edit to one is refused.

The host opens the session's agent on the registry's default, binding it as dsh's own surfaces do (`binnacle:packages/binnacle/src/host/session.ts#openSession`), so the agent plane moves behind presets as it does in dsh's web bundle: dsh-base's process-wide agent rows are disabled in the patch, and each preset composes its own agent. The [Questions](questions.md) and [Approvals](approvals.md) features answer for the session's agent whatever its preset composed. The boot check reports the roster with its ok line and refuses a boot that does not hold the five, or whose stderr leaves any row pending (`binnacle:scripts/check-boot.mjs`).

## Choices

- The default is `standard`; a profile overrides it, as above, until there is a picker (#109).
- The ask-user tool comes from the presets: `standard`, `ptc`, `cordis` and `author` compose it, `minimal` deliberately does not.
- The `author` preset is binnacle's to grow: its two rows are held to `standard`'s by the same gate that holds the copies, so a row it gains or loses is a decision, not a drift.
