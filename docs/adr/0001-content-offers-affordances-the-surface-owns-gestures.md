# 1. Content offers affordances, the surface owns gestures

- Status: accepted
- Date: 2026-09-25

## Context

A person asks one question of anything on the screen: can I do something with this? A long command either has more to show or it does not. If it does, reading it is something a person can do, and a click or a key should do it. If it does not, there is nothing to do, and no gesture should reach it.

A terminal UI usually answers that question inside each widget: a list decides what its wheel does, a pager decides what its wheel does, a prompt decides what a click on it does. Then the answer follows the widget, not the content. Draw a reference table with a list widget, because a list already filters and groups, and the table inherits a picker's rules: the wheel steps a highlight through rows nobody is choosing, and on a table that fits the screen it scrolls nothing at all. Nobody decided that; it came with the widget. Every widget that decides its own input is one more place the same gesture can mean something different.

A person's journey — arrive, ask, watch, decide — is a good question to ask of each kind of content while designing it. It is a poor thing to build on: it says when a person meets something, which no code can check, and nothing about what they can do with it.

## Decision

**Content declares affordances; one table gives every gesture its meaning.**

An affordance is something a person can do with a piece of content — expand it, open it, copy it, grant what it asks. A view declares affordances on what it draws, and nothing else may say what input means. An affordance that depends on layout is decided by layout: collapsible content offers `expand` only when it was cut, so content that fits offers nothing and no gesture reaches it.

| Gesture | Means |
|---|---|
| click | the primary affordance under the pointer, or nothing |
| wheel | scroll the region under the pointer if it overflows, or nothing |
| drag | select text |
| hover | nothing |
| keys | focus moves among what offers something; `enter` is the primary affordance; each affordance is a rebindable binding |

Policy belongs to the affordance, not to a widget: `grant` refuses the pointer, so an approval is always a key pressed on purpose.

## Alternatives considered

**Give each screen a role — read, choose, answer, grant, type — and derive its input from the role.** Smaller, and a reference table would declare `read` and lose a picker's rules. It lost because a role is per screen and an affordance is per piece of content: a transcript holds content that offers nothing, content that expands, links that open and prompts that grant, all on one page, and a role has to be one of them.

**Take pi's list rule, where the wheel steps the cursor.** pi-tui's own lists do it (`pi:packages/tui/src/components/select-list.ts`), and codex lets a picker's wheel arrive as arrow keys (`codex:codex-rs/tui/src/tui.rs#OverlayInput`). It is right where a window is centred on its cursor, because moving the cursor is scrolling there. It lost as a rule because it stops being scrolling the moment a list fits or flows into columns. Under the table above, a list that overflows still scrolls on the wheel, and its cursor follows keys and clicks.

**Organize the code by the person's journey.** A stage per feature, or a folder per stage, would put the journey first. It lost because one mechanism serves several stages — the transcript is both what a person watches and what they review — so stage folders duplicate mechanisms or share a core anyway, and a declared stage is a claim no test can hold.

## Consequences

- One module maps gestures to meaning, so a gesture's behaviour is found in one place and one test suite holds it for every screen.
- pi-tui's components carry their own input — its lists answer the wheel and the click themselves. binnacle takes pi-tui's drawing and not its input rules, and a pi-tui update can make that difference visible.
- Focus that moves among whatever offers something, across a whole screen, is not something pi-tui provides; binnacle builds it.
- Whether content was cut is known only after layout, so affordances are computed per render, and a render that cuts differently offers differently.
