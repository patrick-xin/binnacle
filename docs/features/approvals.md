# Approvals

A tool the agent wants to run may need a person's leave — writing outside the workspace, reaching the network. When it asks for that leave, dsh sends the ask down its `approval/request` waterfall; nothing in binnacle answers, the waterfall finds no answerer and fails closed to `unavailable`, so an approval-gated action never runs. With this feature, the ask reaches the person at the one place they already are:

- What the agent asks to do, and why, sits in the composer's place: a card naming the tool and the reason, where the person was typing. What they had typed waits under it.
- **Allow it once, or reject it, by a key** — never a click. Enter allows once. A key bound to `dismiss` rejects, whichever offer has focus — once a person binds one; until then, Tab reaches reject and Enter invokes it ([Keys](keys.md)).
- Answering gives the composer back as it was, what was typed included. A request withdrawn before it is answered takes its card back.
- What was decided is drawn in the transcript ([Transcript](transcript.md)), so the leave a person gave leaves a trace.

## How it works

dsh asks through its `approval/request` waterfall, and settles whatever an answerer returns — failing closed to `unavailable` when nothing answers (`dsh:packages/interaction/user-approval/src/index.ts#decide`). The built-in Approvals plugin (`binnacle:packages/binnacle/src/plugins/approvals/index.ts#approvals`) answers it for the session's agent, holding only what an author holds: the `binnacle` service, to place its card. The host applies the plugin on a scope of that agent (`dsh:packages/core/scope/src/index.ts#createScope`), so another agent's ask never reaches it — dsh's dispatch is scope-filtered, and what no answerer claims fails closed where it was asked.

While a request stands, the plugin places its card in the composer's slot through the same registration an author uses ([Authoring](authoring.md)). It is the newest placement there, so it takes the composer's place — and the keyboard, for it offers something — and disposing it gives the composer back as it was. The card names the tool and the reason as the asker gave it, and offers **allow once** (`grant`, the primary) and **reject** (`dismiss`); invoking either settles dsh's outcome, `allowed-once` or `rejected`. `grant` and `dismiss` both refuse the pointer ([ADR 1](../adr/0001-content-offers-affordances-the-surface-owns-gestures.md)), so a click on the card does nothing — allowing or refusing, an approval is a key pressed on purpose. A request withdrawn by its signal settles `cancelled` and takes its card back; one still standing when the plugin is disposed settles `unavailable`, as dsh settles a request nothing answers.

The ask and its decision are logged by dsh as an audit pair, `approval/asked` and `approval/decided`, joined by the request's id (`dsh:packages/interaction/user-approval/src/types.ts`). binnacle reads both and pairs them into one transcript entry, as a call and its result are paired ([Transcript](transcript.md)), so a replayed session shows every leave that was asked and given.

## Choices

- A decision sits in the composer's place, not a dialog over the page: the composer's slot is live on both screens, and answering there gives back what was typed. A dialog over the page waits until a feature needs one.
- A question the agent asks a person is answered in the same seat the same way ([Questions](questions.md)).
- Enter allows once, for the grant is the card's primary offer; reject is one Tab away, or one press of a key bound to `dismiss` — unbound until a person binds it ([Keys](keys.md)).
- The card's title names the tool (`bash asks`), its body the reason as the asker gave it, and its offers read `allow once` and `reject` — dsh's outcome words.
- In the transcript the entry stands after the `approval` mark, the outcome in the tone of the decision: `allowed once` in success, `rejected` in error, `cancelled` and `unavailable` muted ([Theme](theme.md)). An author's view for the `approval` kind draws it otherwise.

## Open

- [#32](https://github.com/patrick-xin/binnacle/issues/32): an approval policy a person can set, and "allow always", are the rest of the ask.
