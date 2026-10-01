# Placements reach the whole screen

A person asks to change the composer, a status line and the dialogs a feature opens as often as anything in the transcript ([ADR 0](0000-everything-is-a-plugin-a-person-changes-by-asking-an-author-agent.md)). So a placement may go anywhere binnacle draws — the transcript, the composer, a line above or below them, a dialog over the page, a screen in its place — and binnacle's own transcript and composer are placed through the registration an author uses. The host holds the terminal and the session and lays out what is placed, so it has no layout of its own for an author to be locked out of.

## Considered Options

- **Place content only, and let the host fix the chrome.** The chrome stays the same for everyone. Rejected because the chrome is exactly what people ask to change.
- **Change the chrome by replacing the host's row in the profile's patch.** Nothing to build. Rejected because the host holds the terminal and the session, so this replaces all of it, and cannot be taken back while binnacle runs.
