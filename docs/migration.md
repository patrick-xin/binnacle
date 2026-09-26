# Migration

binnacle replaces an earlier terminal surface for dsh — **legacy** here. This page is the plan and where it stands, so an agent starting cold can take the next step. It is the one page that records progress, and it is deleted in the commit that lands the last step.

## Reading legacy

Legacy is private. A maintainer's machine declares it as the `legacy` reference in its `references.local.json`, and `pnpm refs` fetches it into `.refs/legacy`. It is never cited from a tracked file ([`AGENTS.md`](../AGENTS.md)): once this migration is done nobody will know what it was, so what binnacle took from it is stated here as behaviour, not as a path.

Without `.refs/legacy`, this page is enough to work from.

Legacy's `main` is what the reference pins. Its last work — a two-column keys screen that fills the page, and the dsh `0.1.7-rc.2` pin — sits on its `keys-screen-full-height` branch, unmerged, and is read there if a step needs it.

## How a step is taken

1. **Read legacy for what a person can do, never for how it was built.** Its structure is what binnacle replaces: content took its gestures from where it happened to be drawn, so arrows, the wheel and clicks fought over the same screen. A behaviour is re-derived from the [ADRs](adr/): what the content offers ([ADR 1](adr/0001-content-offers-affordances-the-surface-owns-gestures.md)), which layer and registration it belongs to ([ADR 2](adr/0002-five-layers-and-the-registrations-an-author-shares.md)), and which dsh seam it reaches through ([ADR 3](adr/0003-dsh-is-reached-through-named-seams-each-held-by-a-gate.md)).
2. **Name the seams the step is tested at** before writing a test, and agree them with the maintainer.
3. **Red before green**, one test at a time ([`AGENTS.md`](../AGENTS.md#tests)).
4. **Port a lesson, not a line.** The [lessons](#what-legacy-paid-to-learn) below are behaviours binnacle must keep; each becomes a test at the step that makes it reachable.
5. **Tick the step here** in the commit that lands it. A decision the step took that a maintainer may revisit is a new ADR.

## Steps

In order; each builds on the ones above it.

- [x] **Scaffold**: a bundle that boots under the real launcher, the gates, the references.
- [x] **dsh seams and upstream following** ([ADR 3](adr/0003-dsh-is-reached-through-named-seams-each-held-by-a-gate.md)).
- [x] **Contract**: the types every layer shares — affordance kinds, gestures, what a region declares, drawn lines.
- [x] **Gesture table**: a gesture and what is under it to an action or nothing, one table for every screen.
- [x] **Render-to-text harness**: `drawText` draws real pi-tui components at a width as the lines a person reads, and fails a line wider than its width.
- [ ] **The screen harness**: facts, UI state and a size in, the screen's lines and the regions on them out — `drawText` over the views, once they exist.
- [ ] **Facts**: the session log adapted to typed facts, and the fallback for a kind no adapter knows.
- [ ] **Models**: turns, the agents tree, status — pure folds over facts.
- [ ] **Views**: one per kind of content, drawn with the exposed components.
- [ ] **The screen**: the host wiring pi-tui's input through the gesture table — scroll, selection, focus among affordances.
- [ ] **The five registrations** an author shares, and what they grant ([ADR 2](adr/0002-five-layers-and-the-registrations-an-author-shares.md)).
- [ ] **Features**, by the stage of a person's journey, from [the inventory](#what-a-person-can-do).
- [ ] **Retire legacy**: delete this page; open a GitHub issue for each lesson or gap still unmet.

## What a person can do

Legacy's features, by the stage a person is at. This is the reference the journey offers, not a structure: a feature lands as whatever the ADRs make of it.

| Stage | What a person can do |
| --- | --- |
| Arrive | See the directory and branch the session stands in; sign in to a provider or out of one; list every key as bound now, with what it does, and search it |
| Ask | Type, paste and send a line; start a new line; complete `/` commands and skills and `@` paths as they type |
| Watch | Read the log as a transcript — each turn, the answer as it streams, reasoning, tool cards, commands, context they did not type, images; the context, tokens, cost and model; the agent's todo list; the agents it delegated to, each with state and time, open to read, and send a line to one that takes follow-ups |
| Decide | Answer approvals, questions and plan reviews in the composer's place; step back through a run of questions before it is sent |
| Steer | Send a line that steers a running turn; interrupt it and drop queued work; cancel, and quit on a second cancel |
| Review | Scroll, search and select the whole transcript, jump between prompts, follow a link; hide or show reasoning, tool cards and context rows; open or fold every block; copy a selection; highlighted code; read everything added to the session they did not type; one card of where the session stands |
| Leave | Suspend to the shell and come back; open an earlier session in place of this one; export the session to one HTML page |
| Tune | Choose the model and reasoning effort, the agent preset while the session is blank, the permission preset; change any setting from a searchable list; rebind any key by id; ask the agent to write a plugin |

## What legacy paid to learn

Each was found by a person or a probe, fixed or refused, and is easy to lose in a rewrite.

**Input**

- The wheel scrolls the page, never the composer, and only where something overflows.
- A click never takes the keyboard from a focused list or prompt.
- Only a real keypress is answered; a mouse report or a paste is not a key.
- Cancel twice to quit, and what is on screen says so before the second.
- A line sent while a turn runs steers it, one sent while idle follows up, and the screen tells the two apart.
- A question's keys do not collide with typing: a digit picks an option only while nothing is typed.
- What is being typed survives anything that takes the keyboard.

**Drawing**

- The session log has one owner — this surface, for its lifetime — and is the only source of what is drawn.
- A replayed session draws every kind of event it holds; a kind nobody draws is visible, never silently skipped.
- Model-visible content is drawn. A developer message is model-visible, and legacy drew nothing for it.
- A compaction draws a marker that expands to what it summarized; nothing it shadowed is removed.
- An answered question reads as the person's answer, not the agent's prose.
- A frame's cost is bounded by what is visible, not by the length of the session; legacy measured it growing with the session.
- Images the log carries are drawn with pi-tui's own image stack.
- Regular (main-screen) mode keeps the terminal's own scrollback; erasing it strands the person.
- A prompt jump needs an OSC 133 marker on each user turn; pi-tui scans for it on the alternate screen, and the terminal uses it on the main one.

**Seams**

- An author's plugin cannot resolve pi-tui from its profile: a profile's `node_modules` holds a link to this bundle and nothing else. What an author draws with is what binnacle exports.
- A plugin given render callbacks is bound to the render base; one given data and affordances is not. Legacy's transcript seam still took `render(width)`.
- A written plugin and a shipped one should arrive the same way; in legacy, shipped rows were one package and a written row another.
- dsh drops a patch row it cannot find without a word ([ADR 3](adr/0003-dsh-is-reached-through-named-seams-each-held-by-a-gate.md)).

**Known gaps to reopen as issues when their step lands**: no flags for model, effort or export at boot; no guard when stdout is not a terminal; structured tool views collapsed to counts; workflow runs drawn as nothing; the agents view only on a full screen; no `/rename`; a side question to the model costs a turn.
