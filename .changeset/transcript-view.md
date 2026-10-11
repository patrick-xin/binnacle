---
'binnacle': patch
---

The transcript is one a person reads. A prompt draws as `› ` and its text, an answer as its reasoning dim then its text, a tool call and its result as one line each, context as one dim line that names its producer, and a command, a retry, a compaction and how a turn ended as one line each. Every other event draws nothing. The answer that streams draws through the same pieces, and its live blocks end when it commits, so it never draws twice. This is the new row `binnacle-transcript-view`: turn it off and the transcript draws each event raw again.

An author changes one piece with its Look, given plain data and the width: `transcript.prompt`, `transcript.answer`, `transcript.reasoning`, `transcript.call`, `transcript.result`, `transcript.context` and `transcript.notice`, with the types from `binnacle/plugins/transcript-view`. The readers `reasoningOf`, `callOf`, `producerOf` and `noticeOf` join `textOf`, which now reads a tool result too. `wrap(text, width, { first, rest })` from `binnacle` wraps a text with a prefix before each line.
