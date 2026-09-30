# plugins/approvals

Approvals: what the agent asks to do, drawn as a card in the composer's seat and allowed once or rejected by a key. It holds the `binnacle` service to seat its card; the approval waterfall and its outcomes are dsh's.

- `index.ts` — the plugin: answers the session agent's `approval/request` with a seated card, and settles what stands when withdrawn or disposed.
