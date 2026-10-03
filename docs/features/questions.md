# Questions

When the agent needs a person's answer — which database, which checks to run, whether a plan is good enough — it asks with dsh's `ask_user_question` tool. The ask goes down dsh's `user-questions/request` waterfall; nothing in binnacle answered, the waterfall found no answerer and failed `NO_PROVIDER`, so the agent could never ask. With this feature, the ask reaches the person at the one place they already are:

- What the agent asks sits in the composer's place, one question at a time: an ask titled with the question's header, the question, and its detail beneath as markdown, whose bottom edge names the keys that answer it. What they had typed waits under it. However much it holds, the ask fits the room its place gives it: a long detail is paged by the shift arrows, and forty options show in a window that follows focus, saying where it is — its edges always drawn ([Blocks](blocks.md)).
- **Pick an option by a key or a click.** Enter chooses the focused option, and a click invokes the option it lands on. On a question that allows several, choosing marks the option — the done mark beside its label — and a last offer, **done**, answers with what is marked.
- **Type an answer of their own.** The offer places the composer in the seat with the question still readable above it; the line submitted is the answer, and a blank line gives the ask back.
- **Skip** the question, answering it with nothing selected, or **cancel** the whole ask — the key bound to `dismiss` cancels, as it rejects an approval.
- Answering the last question gives the composer back as it was, what was typed included. A request the agent withdraws takes its ask back, and the person is told nothing more of it.

## How it works

dsh asks through its `user-questions/request` waterfall, an ask at a time, and settles whatever an answerer returns — failing `NO_PROVIDER` when nothing answers (`dsh:packages/interaction/user-questions/src/index.ts#UserQuestionService`). The built-in Questions plugin (`binnacle:packages/binnacle/src/plugins/questions/index.ts#questions`) answers it for the session's agent, holding only what an author holds: the `binnacle` service, to seat its ask.

While a request stands, the ask of its current question is placed in the composer's slot through the same registration an author uses ([Authoring](authoring.md)) — the newest placement there, so it takes the composer's place and the keyboard, and disposing it gives the composer back as it was. The ask offers each option `choose`, labelled with the option's label and its description beside it, and after the options **type an answer** (`answer`), **skip** (`choose`) and **cancel** (`dismiss`). Choosing an option answers a single-select question; on a multi-select one it toggles the option's mark, and **done** answers with every marked label, in the order they were marked. The answer the request settles collects every question's answer, in order — an option's label in `selected`, a typed line in `custom` (`dsh:packages/interaction/user-questions/src/types.ts#AskUserQuestionAnswer`), as dsh's web client answers it too (`dsh:packages/client/ui-user-questions/src/client/QuestionComposer.tsx`).

Skip answers its question with nothing selected, as dsh's web does. Cancel rejects the whole request with dsh's `ASK_CANCELLED`; a request withdrawn by its signal takes its ask back, rejected `ASK_ABORTED` — both in the wire shape dsh's own client sends (`dsh:packages/client/ui-user-questions/src/client/contract/slots.ts`). A request still standing when the plugin is disposed goes to the next answerer, and none answering is what the asker then hears. What was asked and answered reaches the transcript as the `ask_user_question` tool call dsh already logs ([Tool cards](tool-cards.md)); binnacle reads no new fact of it.

A question whose `intent` is a plan review is drawn the same way here: its detail is the plan, as markdown, and the option the asker named to approve is offered first, so it is the ask's primary — what Enter does (`dsh:packages/interaction/user-questions/src/types.ts#AskUserQuestionIntent`). A plan screen of its own waits for a feature.

## Choices

- One question at a time, in the composer's place: the ask may hold several questions, and the seat answers them one by one, next after last. A dialog over the page waits until a feature needs one.
- The ask's title is the question's `header` as the asker gave it; a question without one is titled by nothing.
- Enter chooses — the ask's first offer is its first option, the approve option on a plan review — and Tab, ↓ and ↑ move among the offers ([Keys](keys.md)); the ask's bottom edge names those keys as the key table binds them.
- Its offers' labels say more than the theme's words for their kinds — **type an answer**, **skip**, **cancel**, **done**, and each option's own label — so each names its own ([Theme](theme.md)).
- An option's description draws beside its label in the muted tone; a marked option draws the theme's `done` mark beside its label, and an unmarked one keeps its place aligned ([Theme](theme.md)).
- The typed answer is typed where the person was typing: what they had typed is the answer's start, theirs to edit before submitting, and submitting it sends it as the `custom` answer and clears the composer. While the composer holds the seat the question stays readable above it — its header, question and detail, without its offers, for dsh's web keeps the question on screen too — and it goes when the composer does, so the question is never asked twice.
- Esc is bound to nothing here: while the agent waits on its question a turn is running, and Esc interrupts it ([Keys](keys.md)).
- Cancelling, not Esc, is how a person refuses an ask: it rejects every question of the request, answered or not, with dsh's `ASK_CANCELLED`.

## Open

- [#32](https://github.com/patrick-xin/binnacle/issues/32): a plan screen of its own, and the rest of the ask.
