---
'binnacle': minor
---

A theme is a file in the profile: `<profile>/themes/<name>.json`, checked against a JSON Schema the package ships, so an author agent can validate one before writing it. The built-in `binnacle-theme` row, configured in the profile's patch (`theme` for one file, `light` and `dark` for one each), registers it through the theme registration and registers again as the file changes, with no restart; a wrong file is drawn as a notice naming its path while the theme beneath it stays. A pi theme file works as it is. Plugins read theme files through the new `ctx.binnacle.themeFile` grant.
