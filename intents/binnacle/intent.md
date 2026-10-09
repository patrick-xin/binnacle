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

binnacle's built-in features are defaults that authors replace, and they serve as living examples. If binnacle can do something for itself, an author can do it too. If an author cannot change something, that is a gap in binnacle.

A change takes effect while the session runs, and a broken change does not stop the session. binnacle shows what went wrong and names the change that caused it.

The first 0.x release is a fully working terminal app. Authoring is the 1.0 release.

## Affected users and systems

- **A person** who uses dsh in a terminal.
- **An author agent:** a dsh agent that changes binnacle for the person.
- **dsh:** it starts binnacle, and runs the agent and its sessions.
- **Terminals:** macOS Terminal, iTerm2, Ghostty, kitty, WezTerm, terminals on Linux, and tmux.
- **pi:** binnacle copies parts of pi's terminal library, with credit.
- **npm:** binnacle is published as a package that a dsh profile installs.

## Constraints

1. binnacle is an ordinary dsh profile. It does not change dsh.
2. binnacle gives the terminal back as it found it, when it exits, crashes or is suspended.
3. Text from a model or a tool is not trusted: it cannot control the terminal.
4. Windows is best effort.
5. There is no screen-reader mode. dsh's web app serves screen readers.
6. Authors get no promise of stability before the 0.x release, and breaking changes are accepted until the first stable release.

## Stages

Each stage ends in something the Maintainer can try under dsh. The Lead writes the Specs for the current stage only. What each feature does so far is in [the feature docs](../../docs/features.md).

1. **Core.** binnacle starts under dsh and takes the terminal. The Maintainer opens a recorded session and scrolls it.
2. **Chat.** The Maintainer types a prompt, sends it, watches the answer stream, and interrupts it.
3. **Waiting on a person.** The Maintainer answers the agent's questions and approvals with the keyboard or the mouse, and folds the transcript. Features: Gestures, Requests, Transcript.
4. **Plugins.** Search, the model picker, settings, and the trajectory, a screen of its own with charts, tabs and filters.
5. **Finish.** The Maintainer resumes a session, selects and copies text, and sees a summary on exit. Colours follow the terminal, and `NO_COLOR` works. The first 0.x release follows.

Authoring gets its own stages, toward 1.0, in [its Intent](../authoring/intent.md).

## Open questions

None.
