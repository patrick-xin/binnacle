---
'binnacle': patch
---

An author changes what the transcript folds and Marks without copying it. Its state is the model `transcript`, of the type `TranscriptState` from `binnacle/plugins/transcript`: `events`, `live` (the blocks of the answer that streams, of the type `LiveBlock`, or `undefined`), `folded` (an array of seqs) and `marked` (a seq). The transcript sets `events` and `live`; set `folded` or `marked` to fold or Mark an event, such as each tool result folded when it comes. Up, down and enter run the actions `transcript.up`, `transcript.down` and `transcript.fold` of the Place `transcript`, and a click on an event's header runs `transcript.click`, so `binnacle.bind('transcript.down', ['j'])` moves the Mark with `j`. The transcript works as before.
