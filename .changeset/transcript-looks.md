---
'binnacle': patch
---

An author changes how one type of the transcript's events is drawn, without copying the transcript. Each event draws through the Look `transcript.event.<type>`, such as `transcript.event.tool/call`, and beneath it `transcript.event`: given the event and `{ folded, width }`, it returns the event's lines, so a tool call can draw as one line. An event whose Look draws no line takes no row, and the Mark passes over it. The answer that streams draws through the Look `transcript.live`, given its blocks and the width, so its reasoning can be left out. The types `EventLook` and `LiveLook` are exported from `binnacle/plugins/transcript`, with `LiveBlock`.
