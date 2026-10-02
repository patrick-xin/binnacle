---
'binnacle': minor
---

binnacle ships presets: dsh's four web presets (`standard`, `ptc`, `minimal`, `cordis`) are copied byte for byte from dsh's web bundle into the package's `presets/`, listed in its `dsh.bundle.patch`, and binnacle adds `author` — `standard`'s plugin list with `skill-filesystem` reading binnacle's own `skills/` directory and `plugin_manager` enabled under a profile. A session now opens its agent on the preset the registry defaults to (`standard`), so dsh-base's agent-plane rows are disabled in the patch and the presets compose each agent; the ask-user tool comes from the presets now, so `minimal` deliberately has none. `--check` reports the roster the registry mounted beside the model, and `pnpm check:boot` refuses a boot whose roster does not hold the five. A person picks a preset, for now, by overriding `default` in their profile's patch; the `/preset` picker is next. A new gate in `pnpm test` holds the copies and `author`'s rows to dsh at the pin.
