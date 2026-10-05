# Intent: a terminal app for dsh that a person changes by asking an agent

- **Author:** Patrick Xin
- **Role:** Maintainer
- **Status:** approved
- **Date:** 2026-10-03

## Problem

DeepSeek Harness (dsh) has apps for the browser, for SDK clients and for ACP. It has no app for the terminal. dsh's own documentation leaves a terminal profile open for a bundle to fill.

People who work in a terminal must use a browser app or a terminal agent that is not built on dsh. When a terminal tool does not look or act the way a person wants, they can change its code, but they don't have to—an author agent should be able to do the job, similar to creator mode in the dsh web app. By doing so, we offer a customized, personalized experience.

## Proposed outcome

binnacle is a terminal app for dsh. A person starts it with `dsh --profile binnacle`. In binnacle, a person can do these things:

1. Talk with a dsh agent in a full-screen terminal view, and watch its work as it streams.
2. Answer the agent's questions and approve its actions with the keyboard.
3. Read, fold, search and copy everything in the session.
4. Resume a session that started in binnacle or in another dsh app.
5. Ask an author agent to change anything that binnacle draws or answers, while the session runs. This outcome is between 0.X-1.0 release. Examples are colours, glyphs, the words on screen, the keys, how a tool call is drawn, and where a part of the screen goes.

The author agent changes binnacle through the same registrations that binnacle's own features use. If binnacle can do something for itself, an author can do it too. If an author cannot change something, that is a gap in binnacle.

A change takes effect while the session runs, and a broken change does not stop the session. binnacle draws what went wrong and names the change that caused it.

## Affected users and systems

- **A person** who uses dsh in a terminal.
- **An author agent:** a dsh agent with binnacle's author skill. It changes binnacle for the person.
- **dsh:** the launcher, profiles and bundles, sessions and their events, the approval and question requests, the plugin manager, and hot reload.
- **Terminals:** macOS Terminal, iTerm2, Ghostty, kitty, WezTerm, terminals on Linux, and tmux.
- **pi-tui:** binnacle copies parts of it, under its MIT licence.
- **npm:** binnacle is published as a package that a dsh profile installs.

## Constraints

1. binnacle is an ordinary dsh bundle. It uses dsh only through named seams.
2. binnacle owns its terminal layer: the screens, drawing, scrolling, focus, layout and keys. It copies pi-tui's input decoding, text width, terminal I/O and editor, with credit, and changes them as it needs.
3. binnacle uses the alternate screen, and its layout keeps the composer at the bottom. When it exits, it prints a plain summary of the session to the main screen. Drawing stays behind one seam, so a regular mode in the terminal's scrollback can come later. Stage 5 decides if the first release has it.
4. One part of binnacle owns the terminal and the session view. It stays up when dsh reloads the profile. Views, themes and keys reload under it.
5. The mouse is on by default, as in pi. binnacle selects and copies text itself, and a key turns the mouse off. Keys and the mouse share one gesture table.
6. Text from a model or a tool is not trusted. binnacle removes terminal control sequences from it before it draws the text.
7. binnacle restores the terminal when it exits, crashes or is suspended.
8. While binnacle draws, it captures text that other code writes to the terminal and shows it as a notice.
9. Breaking changes are accepted until the first stable release.

## Stages

Each stage ends in a behaviour that the Maintainer can try under `dsh`. The Lead writes the specs for the current stage only.

1. **Core.** binnacle boots under `dsh --profile binnacle`, and owns the terminal. The Maintainer opens a recorded session in a temporary Read view, and scrolls it with the wheel.
2. **Talk.** The Maintainer types in the composer, sends a prompt, watches the answer stream as raw events, and interrupts it. The screen is a layout tree that an author can replace, and the keys reach the composer through one key table.
3. **Waiting on a person.** The Maintainer answers each Request with the keyboard or the mouse. Keys and the mouse go through one gesture table. Focus and folds work.
4. **Plugins.** Search, the model picker, settings and the trajectory are plugins. The trajectory is a screen of its own, with charts, tabs and filters.
5. **Finish.** The Maintainer resumes a session, selects and copies text, and sees the summary on exit. The theme and `NO_COLOR` work. The first 0.x release follows.

Authoring gets its own stages, toward 1.0.

## Decisions

These answer the open questions of the first draft, from the grill of 2026-10-04.

1. **Releases.** A PR that changes the published package adds a changeset with a short release note. Before 1.0, a fix or a feature is a `patch`, and a break of what an author may import is a `minor`. One version PR stays open on `main`, and the Maintainer merges it to publish.
2. **The first 0.x release** is a fully working terminal app. Authoring is the 1.0 release, and 1.0 is an estimate. While binnacle is built, the team tests what an author can do through the same registrations that the built-in plugins use.
3. **Core and plugins.** The core owns the terminal, input decoding, the gesture table, layout, screens, focus, drawing, the link to the dsh session, the fence around a broken plugin, and the plugin registry. Everything that a person sees is a plugin: the transcript, the composer, Requests, the status line, search, the model picker, settings and the trajectory.
4. **Words.** A box that the agent waits on is a **Request**: an approval or a question, in dsh's words. A thing that a person picks in a Request is a **Choice**. A picker that a person opens is a **Menu**. These words replace "ask" and "offer", and they are always capitalized.
5. **Windows** is best effort. The copied pi-tui code keeps its Windows handling, and CI tests macOS and Linux.
6. **The copied editor** stays until a person or an author needs something that it cannot do.
7. **Screen readers.** The first release has no plain mode. dsh's web app serves screen readers.
8. **Authors** get no promise of stability before 0.X release.
9. **Wide content** wraps, as in pi. A table wraps each cell. A table that is too narrow to draw falls back to its raw markdown, wrapped.

These answer the design of stage 2, from the grill of 2026-10-05.

10. **The agent** is composed as dsh's headless bundle composes it: on `dsh-base`, with no presets, on the default model.
11. **`dsh --profile binnacle`** opens Talk on a new session. `--session <id>` draws a stored session, and nothing can be sent to it.
12. **Layout.** A screen is a layout tree of named places, and every node may have a box ([ADR 2](../../docs/adr/0002-a-screen-is-a-layout-tree-of-named-places.md)). Edges, glyphs and spacing are named tables behind one lookup. An author overrides an entry or registers a new name with the theme, in stage 5.
13. **Keys.** The core owns one key table: each action has an id, its default keys and a description. The copied editor reads its keys from it. A key goes to the focused part first, then to the core. Stage 3 adds the mouse to the same table.
14. **The keys of Talk.** Enter sends a prompt, or steers the turn that runs. Shift+enter is a new line, with pi's fallbacks where a terminal cannot tell it from enter. Esc interrupts the turn. Ctrl+c clears the draft, and pressed twice on an empty draft it quits. Ctrl+z suspends.
15. **The transcript** is a plugin. It draws each event of the session raw, as its seq, its type and its JSON, and the answer that streams as one live block that the committed event replaces. Grouping and styling come later, and an author can do them too. The status line is a plugin of its own.
16. **Requests** fail closed until stage 3: a tool that needs an approval fails.
17. **Hot reload** is off until the core stays up while its plugins reload.

## Open questions

None.
