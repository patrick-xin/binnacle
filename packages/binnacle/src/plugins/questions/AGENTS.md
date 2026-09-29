# plugins/questions

Questions: what the agent asks a person, answered in the composer's seat, a question at a time. It holds the `binnacle` service to seat its card; the questions waterfall, and what cancelling or withdrawing it rejects with, are dsh's.

- `index.ts` — the plugin: answers the session agent's `user-questions/request` with a card per question, collecting every answer in order.
