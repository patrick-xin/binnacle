# 11. Placements reach the whole screen, and the built-in surface is placed through them

- Status: accepted; widens placements in [ADR 2](0002-five-layers-and-the-registrations-an-author-shares.md)
- Date: 2026-09-26

## Context

[ADR 2](0002-five-layers-and-the-registrations-an-author-shares.md) names five doors, and the fifth, placements, puts content in a screen or a side panel. [ADR 0](0000-everything-is-a-plugin-a-person-changes-by-asking-an-author-agent.md) puts more within an author's reach: the composer and the rest of the chrome, and the dialogs and screens a feature opens, such as signing in and settings.

The host lays the screen out itself, the transcript in pi-tui's `ScrollView` above its `Editor`. So no author can replace the composer, add a line under it, or open a dialog. That layout is also a door the built-in surface has and an author does not, and the layer gate cannot see it, because it holds only what lives in a plugin ([ADR 5](0005-a-built-in-feature-is-a-plugin-that-holds-only-what-an-author-holds.md)).

pi lets an extension replace its header, footer and editor, place a widget near the editor, and open an overlay or a screen of its own (pi's TUI guide, at v0.87.1).

## Decision

**A placement is anywhere binnacle draws: the transcript, the composer, a line above or below them, a dialog over the page, a screen in its place, or a side panel. The built-in transcript and composer are placed through the registration an author uses.**

- The host holds the terminal and the session, and lays out what is placed. What is placed is a registration, disposed with its plugin.
- A placement holds blocks, as a view does ([ADR 10](0010-a-view-draws-with-blocks-binnacle-grows-on-request-in-the-themes-tones.md)), or a pane that draws them ([ADR 6](0006-a-pane-joins-views-to-pi-tui-and-the-host-keeps-only-what-is-impure.md)). It never holds a pi-tui component an author wrote.
- What the host answers itself, such as quitting, stays the host's, whatever is placed.

## Alternatives considered

**Place content only, and let the host fix the chrome.** This is what ADR 2's list said, and it keeps the chrome the same for everyone. It lost to ADR 0: the composer, a status line and the dialogs a feature opens are exactly what people ask to change.

**Change the chrome by replacing the host's row in the profile's patch.** This is dsh's way to swap a plugin: a patch disables one row and inserts another. There would be nothing to build. It lost because the host holds the terminal and the session, so changing the composer this way means replacing all of it, and the change cannot be taken back while binnacle runs.

## Consequences

- The host shrinks to the terminal, the session, and laying out what is placed.
- A person can replace the composer or add a line under it, and a feature's dialog has somewhere to be drawn.
- Until the registration exists, the host's own layout is a private door, one the layer gate does not see.
