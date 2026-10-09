# Glossary

One canonical term for each concept that is binnacle's own, for a person who uses binnacle and an author who changes it. A term is capitalized wherever it is used in that meaning, so it reads apart from the plain word. A word that dsh or Cordis owns keeps their meaning: see dsh's glossary. What the author API does is in `packages/binnacle/src/api.ts`, and what each feature does so far is in [the feature docs](features.md). The words of the agents who build binnacle are in [`.agents/glossary.md`](../.agents/glossary.md).

## Screens

- **Screen** — a layout tree that fills the terminal. The newest Screen shown is drawn. Not the terminal's alternate screen, which binnacle draws every Screen on. <a id="screen"></a>
- **Chat** — the first Screen, in dsh's word: the transcript, the status and the composer. <a id="chat"></a>
- **Place** — a leaf of a Screen's layout tree, by its name. A plugin fills it with a Part, and the wheel scrolls the Place under the pointer. <a id="place"></a>
- **Part** — what a plugin puts in a Place: its lines at a width, in colour if it likes. A Part that has the Focus also takes keys and says where its cursor is. A click reaches the Part drawn under the pointer, with or without the Focus. The newest Part placed in a Place is drawn. <a id="part"></a>

## Gestures

- **Focus** — the Place whose Part takes each key first. A Screen names where it starts, a person moves it by a click or shift+tab, and the Chat's starts on the composer. A key that the Part does not take goes to the Gesture Table. Not the focus of the terminal's window. <a id="focus"></a>
- **Gesture Table** — the core's one table of actions: each has an id, its default gestures — a key, as the terminal sends it, or a mouse gesture by name — and a description. The copied editor reads its keys from it. <a id="gesture-table"></a>

## The Kit

- **Model** — an author's state, made with `createModel`, which tells its watchers after each change. A Part that lists its Models is drawn again after each change. Not dsh's model, the LLM that runs the agent. <a id="model"></a>
- **Tone** — a colour of the theme, named by what is drawn in it, as pi and v0 name it: `accent`, `muted`, `border` and the rest. A Tone is a colour and attributes, and a theme layer changes it for everything drawn in it. Not a colour itself, such as `cyan`. <a id="tone"></a>

## The transcript

- **Fold** — an event of the transcript drawn as its one header line, which ends with how many of its lines it hides. Enter folds and unfolds the Marked event, and a click on an event's header line folds that event. <a id="fold"></a>
- **Mark** — the event of the transcript that its keys act on, which up and down move. The transcript Marks its newest event when it first has the Focus, and a click Marks the event it hits. Drawn in inverse video while the transcript has the Focus. Not the terminal's cursor. <a id="mark"></a>

## Waiting on a person

- **Request** — a box that the agent waits on: an approval or a question, in dsh's words. Never an "ask" or an "offer". <a id="request"></a>
- **Choice** — a thing that a person picks in a Request. <a id="choice"></a>
- **Menu** — a picker that a person opens. The agent does not wait on it, so it is not a Request. <a id="menu"></a>

## The terminal

- **Untrusted Text** — text from a model, a tool or a stored session. A plugin makes it plain with `toPlainText` before it goes in a Part's lines, as the core keeps their colour and style. The core makes a title plain itself. <a id="untrusted-text"></a>
- **Held-back Output** — text that other code writes to the terminal while binnacle draws, printed once binnacle gives the terminal back. Not a notice, which binnacle draws on the Screen. <a id="held-back-output"></a>
