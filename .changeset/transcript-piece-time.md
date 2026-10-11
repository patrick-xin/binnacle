---
'binnacle': patch
---

Each piece's Look in the transcript's view is now given its event's `time`, in epoch milliseconds, beside the width. So an author draws each prompt with the time it was sent in a Look of `transcript.prompt` alone. A piece of the answer that streams is given no `time`. The guide now says that, with the view on, `transcript.reasoning` alone hides the reasoning, committed and streaming.
