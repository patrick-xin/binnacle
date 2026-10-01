# A tool call is drawn from what its tool presents

A tool call in the log carries its name and the arguments the model wrote, but each tool already knows what its calls mean and can present them through dsh. So binnacle draws a call from its tool's own presentation, reached through dsh's tools service, and never reads a tool's arguments by name. Where nothing presents a call, binnacle's own card draws it.

## Considered Options

- **A card per known tool, reading its arguments by name.** No dependence on presenters. Rejected because the surface becomes where every tool's shape is learned again, and an unknown tool renders as raw JSON until someone writes its card.
- **Draw each call as its name and raw arguments.** Nothing to reach in dsh. Rejected because it answers "what is this call doing?" with the model's spelling of it.
