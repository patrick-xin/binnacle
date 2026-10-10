---
'binnacle': patch
---

An author reads a session event without knowing dsh's shapes. `binnacle/plugins/transcript` exports four readers, each safe on an event of any type: `textOf(event)`, the text of a person's message or an answer's; `isPrompt(event)`, whether the event is a prompt the person typed, not context that dsh added; `failed(event)`, whether it is a tool result that failed; and `withoutReasoning(event)`, the event with its reasoning taken out, from the answer's message and from its stream. So a Look draws the person's prompts as `> <text>`, paints a failed tool result, or hides an answer's reasoning with `beneath(withoutReasoning(event), at)`.
