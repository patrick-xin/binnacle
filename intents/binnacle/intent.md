# Intent: a terminal app for dsh that a person changes by asking an agent

- **Author:** Patrick Xin
- **Role:** Maintainer
- **Status:** approved
- **Date:** 2026-10-03

## Problem

DeepSeek Harness (dsh) has apps for the browser, for one-shot tasks, for SDK clients and for ACP. It has no app for the terminal. dsh's own documentation leaves a terminal profile open for a bundle to fill.

People who work in a terminal must use the browser app or a terminal agent that is not built on dsh. When a terminal tool does not look or act the way a person wants, the person must change its code. Most people cannot do that. The others do not want to.

## Proposed outcome

binnacle is a terminal app for dsh. A person starts it with `dsh --profile binnacle`. In binnacle, a person can do these things:

1. Talk with a dsh agent in a full-screen terminal view, and watch its work as it streams.
2. Answer the agent's questions and approve its actions with the keyboard.
3. Read, fold, search and copy everything in the session.
4. Resume a session that started in binnacle or in another dsh app.
5. Ask an author agent to change anything that binnacle draws or answers, while the session runs. Examples are colours, glyphs, the words on screen, the keys, how a tool call is drawn, and where a part of the screen goes.

The author agent changes binnacle through the same registrations that binnacle's own features use. If binnacle can do something for itself, an author can do it too. If an author cannot change something, that is a gap in binnacle.

A change takes effect while the session runs, and a broken change does not stop the session. binnacle draws what went wrong and names the change that caused it.

## Affected users and systems

- **A person** who uses dsh in a terminal.
- **An author agent:** a dsh agent with binnacle's author skill. It changes binnacle for the person.
- **dsh:** the launcher, profiles and bundles, sessions and their events, presets, the approval and question requests, the plugin manager, and hot reload.
- **Terminals:** macOS Terminal, iTerm2, Ghostty, kitty, WezTerm, terminals on Linux, and tmux.
- **pi-tui:** binnacle copies parts of it, under its MIT licence.
- **npm:** binnacle is published as a package that a dsh profile installs.

## Constraints

1. binnacle is an ordinary dsh bundle. It uses dsh only through named seams.
2. binnacle owns its terminal layer: the screens, drawing, scrolling, focus, layout and keys. It copies pi-tui's input decoding, text width, terminal I/O and editor, with credit, and changes them as it needs.
3. binnacle uses the alternate screen. When it exits, it prints a plain summary of the session to the main screen.
4. One part of binnacle owns the terminal and the session view. It stays up when dsh reloads the profile. Views, themes and keys reload under it.
5. Mouse capture is off by default, so the terminal's own text selection works. A key turns it on.
6. Text from a model or a tool is not trusted. binnacle removes terminal control sequences from it before it draws the text.
7. binnacle restores the terminal when it exits, crashes or is suspended.
8. While binnacle draws, it captures text that other code writes to the terminal and shows it as a notice.
9. Breaking changes are accepted until the first stable release.

## Open questions

1. Does binnacle support Windows terminals in the first release?
2. Which words name the parts of the screen? For example: a box that offers choices, a box that only shows, and a choice.
3. Which features does the first release include, and in which stages?
4. When does binnacle replace the copied editor with its own?
5. Does binnacle need a plain mode for screen readers, or is dsh's headless app enough?
6. What does binnacle promise an author about the stability of its registrations before the first stable release?
7. How are content and tables that are wider than the screen drawn: wrapped, cut, or scrolled sideways?
