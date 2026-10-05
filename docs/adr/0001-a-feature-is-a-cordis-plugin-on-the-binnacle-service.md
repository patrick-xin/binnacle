# A feature is a Cordis plugin on the binnacle service

**Status:** accepted, 2026-10-05

binnacle's core is one Cordis row. It owns the terminal, and it provides the `binnacle` service. Each feature that a person sees is a Cordis plugin of its own, with its own row in the bundle's patch. A feature injects `binnacle`, and shows what it draws through the service. A Screen that a plugin shows is tied to the context of that plugin, so the Screen goes when the plugin unloads.

## Considered options

- **One Cordis row, with a registry of binnacle's own inside it.** This keeps the features out of dsh's tree. But binnacle would need its own reload, and a person could not turn off a feature as they turn off any dsh plugin.

## Consequences

- dsh's hot reload reloads a feature's module under the core, and the core keeps the terminal.
- A person turns off a feature by its row id in their profile's patch.
- What an author imports is the service and its types. A change to them breaks every author, so it is a one-way door.
