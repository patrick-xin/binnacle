---
'binnacle': patch
---

A generic card draws a tool's input, and a result whose text is JSON, as dsh's web app does: a line for each key, `key: value`, not one line of JSON. A list of values is joined by `, `, anything deeper is compact JSON, and each number draws as it was written. Arguments that are not JSON still draw as written.
