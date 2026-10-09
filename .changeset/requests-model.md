---
'binnacle': patch
---

The Requests have a model of their own, the row `binnacle-requests`, and the rows `binnacle-approvals` and `binnacle-questions` draw from it; a person sees no change. An author reads `ctx.binnacleRequests`: the Request on view, how many stand, `watch`, and `attach()`, which a view calls. A question's draft changes with `toggle`, `write`, `go` and `type`, and an approval's with `choose`; only `submit()` or `dismiss()` answers dsh. With no view attached, a Request fails closed, and so does each that stands when the last view detaches. The package exports the types `Requests`, `Request`, `ApprovalRequest`, `QuestionRequest`, `Question`, `Choice`, `Draft` and `ApprovalChoice`. A profile that turns off both old rows should turn off `binnacle-requests` too, or attach a view of its own.
