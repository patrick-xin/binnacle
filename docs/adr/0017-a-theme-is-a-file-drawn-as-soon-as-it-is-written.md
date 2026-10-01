---
status: proposed, subject to change
---

# A theme is a file, drawn as soon as it is written

A theme is one JSON file in the person's profile, checked against a schema binnacle ships, so an author agent writes data and can check it before saving. A built-in theme row, configured in the profile's patch, says which theme to use on a light and a dark terminal, and registers it through the registration an author uses. The host reads and watches the files through a named grant, so a changed file is drawn at once, and a wrong one is drawn as a notice naming its path while the theme beneath it stays.

## Considered Options

- **Write the theme into its row's config, in the profile's patch.** No file to read, and no grant. Rejected because a theme then sits in YAML among a profile's model and provider settings, with no schema an agent can check.
- **Turn the harness's hot reload back on.** Its own way of reloading. Rejected because it swaps plugin rows under a live frame; watching only theme files changes data, never rows.

## Consequences

- On the main screen a printed row keeps the theme it was printed in ([ADR 14](0014-on-the-main-screen-a-printed-row-never-changes.md)).
