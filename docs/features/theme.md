# Theme

binnacle draws content in tones named by what it means, `accent`, `muted`, `dim`, `success`, `warning` and `error`, and the composer plain.

## How it works

A view marks text with a tone, never a colour ([ADR 10](../adr/0010-a-view-draws-with-blocks-binnacle-grows-on-request-in-the-themes-tones.md)), and the theme gives each tone its colour (`binnacle:packages/binnacle/src/ui/theme.ts#tones`). A card's border is drawn in `dim`. The composer has a theme of its own (`binnacle:packages/binnacle/src/ui/theme.ts#editorTheme`).

## Choices

- The tones are pi's names for what content means (`pi:packages/coding-agent/docs/themes.md`).
- Each tone is one of the terminal's own sixteen colours, so the person's palette decides how it looks, as it does for everything else they run. pi's own themes name exact colours instead.
- Which tones exist, and the colour each takes, change on request.
