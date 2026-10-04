# Glossary: findings and open questions

Draft for an issue. Not committed. Nothing in this file is decided. Breaking changes are accepted, so cost is only work.

Read at `main` 7b63bdc, after #85 merged.

## 1. The words a person uses for boxes are not in the glossary

A person says *box*, *container*, *dialog*, *card*, *panel* or *action*. binnacle's records use other words for the same things, and the glossary defines only some of them.

| A person says | binnacle's records say | In the glossary? |
|---|---|---|
| box | *box* (11 times in docs, 12 in `src`), *block*, *node* | only **node** |
| container | *container* (ADR 11, `blocks.md`) | no |
| block | *block* (ADR 11 title, `blocks.md` title, 110 times in `src`) | no; the **node** row uses it once |
| action, button | *offer* (110 in docs, 119 in `src`), *affordance*, *action* | **affordance** and **action** only. **offer** has no row, but the glossary uses it 7 times |
| dialog | *dialog* (a slot, not a box) | yes |
| card | *tool card* (ours), *card* (dsh's), `card()` in Approvals and Questions (an ask) | yes, two rows |
| panel | *band* (ours), *panel* (legacy, 4 times in `src`) | **band** only |

So one thing has four names: *box*, *block*, *container* and *node*. The boxes report had to open with its own "you might say → binnacle's word" table (section 1) before a reader could follow it. `docs/features/blocks.md` says "a box of one's own" and does not say what a box is.

## 2. "ask" is named for its purpose, but it is used as a box with actions

ADR 11 names the two containers for what the surface is doing: an **ask** "when it asks or offers", a **show** "when it shows what it did not write". ADR 11 rejected naming a container by how it looks ("a card, a border").

The boxes report shows asks that do not ask:

- **A settings picker in the dialog** (report §6, §9). It offers choices. It asks nothing.
- **A question echoed above the composer** while the person types (report §5). It is an ask with no offers.
- **An ask returned by a view in the transcript** (D14). Its bottom edge says `enter select`, but nothing acts on its offers.
- **"Run in production?"** (report §12, combo A). It is an ask that holds a show.

In the code, an ask is a frame with a title, the key hints and the offers it holds (`ui/layout.ts#ask`). The key hints and the keyboard depend on the offers, not on asking. "Ask" names one use. "A box with actions" names what the code does.

This is a third way to name a box, beside the two that ADR 11 considered:

| Name a box by | Example | ADR 11 |
|---|---|---|
| its purpose | ask, show | chosen |
| how it looks | card, border, frame | rejected |
| what a person can do in it | a box with actions, a box without | not considered |

Questions this raises (not answered here):

1. Is an ask with no offers still an ask?
2. Is a box with offers but no frame (D3: bare offers in the composer slot) an ask?
3. Does a band, which holds a child, count as a container (D2)?
4. Is "show" a purpose (what the surface did not write), or just "a box without actions"?

## 3. The glossary mixes three audiences

The glossary has about 120 rows. They serve three readers who need different words:

| Reader | Needs | Rows now (about) | Examples |
|---|---|---|---|
| **A person** using binnacle | what they see and do, in their own words | 40 | transcript, theme, fold, dialog, approval, Trajectory, TUI mode, preset |
| **An author agent** changing binnacle | what the author API takes | 45 | fact, entry, view, node, span, offer (missing), affordance, placement, slot, registration, plugin, effect |
| **An agent building binnacle** | how the repo works | 35 | layer, contract, host, seats, gate, pin, citation, canary, folder note, seam, module, deletion test |

The rows are sorted by owner (ours, dsh's, Cordis's, pi-tui's, Design's), not by reader. So:

- A person reading the Theme page who looks up *fold* finds it beside *layer*, *gate* and *canary*.
- An author agent loading the glossary reads every repo workflow word.
- The repo workflow words of the team (Sheep, Sheepdog, Charge, Fold, Flock) are not in the glossary at all. They are in AGENTS.md and the skills.

Some terms belong to two readers. For example, *theme* is a person's word and an author's API.

## 4. Words with more than one meaning

These are still open. The first draft's recommendations are withdrawn until sections 1–3 are settled, because the answers change them.

| Word | Meanings now |
|---|---|
| fold | a box that cuts content to rows; reducing state from facts ("a pure fold over facts"); a verb; shepherd's *Fold* (a worktree) |
| model | binnacle's models layer; the LLM (the glossary's own *streaming* and *retry* rows) |
| ask | a box; a stage of the journey ("arrive, ask, watch…"); an ordinary verb |
| grant | an affordance; what a plugin is handed ("grants, not the tree") |
| surface | binnacle on screen; the `Surface` type, which holds a notice |
| row | dsh's patch row; a screen row (`rows`, `asks.rows`); `CardRow` |
| card | dsh's tool-view kind; `card()` registration; `card()` builders in Approvals and Questions (D4) |
| seat / place / slot | "the composer's seat", "the composer's place" and the `composer` slot are one place; `seats` is a host module |
| key | a keyboard key; a view key (`view(key, …)`) |
| seam | where binnacle reaches dsh; where a test is written |
| reading | a survey record (AGENTS.md); parsing a file |
| part | a part of an entry (`Part`); a part of a theme |
| frame | an ask's border; layout's `Frame`; one draw of the screen; `chrome.frame` |

## 5. Rules for the new glossary (proposed)

1. **One term, one meaning.** A word with a glossary meaning is not used in another meaning in docs, notes, skills, comments or test titles.
2. **Each row has these columns:** *Term*, *It is* (one sentence, 25 words or fewer), *It is not* (the nearest confusion), *A person may say* (their words, for example "box", "button"), *Owner* and *Code*.
3. **The rows are grouped by reader:** a person, an author and the repo. Owner is a column, not a section.
4. **Retired words** go in a "Do not use" table, with the word to use instead. A gate (`check:terms`) refuses them outside decision records, commit messages, issues and PRs.

An example row, with no names decided:

| Term | It is | It is not | A person may say | Owner | Code |
|---|---|---|---|---|---|
| **offer** | A part of a box that a person can act on, by a key or a click. | An *affordance* (what the action is). | button, action, option | Ours | `binnacle-v0:packages/binnacle/src/ui/node.ts#Node` |

## 6. Blast radius

Breaking changes are accepted, so there is no compatibility cost. The costs are:

- **Work.** About 250 lines of prose, plus the renames that are chosen. The largest code renames would be in the box vocabulary (`ask`, `show`, `offer`, `Node`): about 150 matches in `src` and 210 in tests (counted at 7b63bdc), plus the author skill, `blocks.md` and ADR 11.
- **Branches in progress.** A rename conflicts with every open branch that touches the same files. Do renames when no Sheep is working.
- **Words copied while waiting.** Each issue built before the glossary changes adds more of the old words, and agents copy them. This is the cost of resolving issues first. It is more work, not a breakage.
- **Open issues.** 15 of 19 open issues use at least one word above. Their bodies are edited once, after the glossary changes. Closed issues, PRs and commits stay as they are.
- **Decision records.** ADR 11 decides the box names, so a new box vocabulary changes ADR 11 in place. ADR 6's file name contains "folds".
- **Not affected:** dsh presets (a gate holds them to dsh), your profile (it has no `themes/` folder) and shepherd's repository.

## 7. To decide later, in this order

1. Who the glossary serves: one page grouped by reader, or separate pages (for example, product and author words in `docs/glossary.md`, repo words in a page for agents).
2. How to name boxes: by purpose (ADR 11), or by what a person can do in them (section 2).
3. The person's words for boxes: which of *box*, *block*, *container* and *node* stays, and whether *offer* gets a row.
4. Each word in section 4.
