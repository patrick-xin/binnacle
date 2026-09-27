# Theme

binnacle draws content in tones named by what it means: `accent`, `muted`, `dim`, `success`, `warning` and `error`. A glyph is a mark named by what it stands for, and the theme gives each mark its glyph and the tone it draws it in. Markdown and the composer are drawn in the same tones.

## How it works

A view marks text, or a span within it, with a tone, never a colour ([ADR 10](../adr/0010-a-view-draws-with-blocks-binnacle-grows-on-request-in-the-themes-tones.md)), and the theme gives each tone its colour (`binnacle:packages/binnacle/src/ui/theme.ts#tones`). A span may instead name a mark — `running`, `done`, `failed`, `problem`, `prompt`, `thinking`, `context` or `unknown`, each named by what it stands for — and the theme draws the mark's glyph in the mark's tone, or in a tone the span names beside it (`binnacle:packages/binnacle/src/ui/theme.ts#marks`). What the ui and the host draw themselves is the theme's too, by name beside the marks (`binnacle:packages/binnacle/src/ui/theme.ts#chrome`): the focus row's pointer, a cut fold's ellipsis, a card's border, the jump label's arrow. A view does not name these; the ui and the host do, so what they draw is as much the theme's as a mark is.

A card's border is drawn in `dim`. A markdown block is drawn in the tones and the terminal's attributes (`binnacle:packages/binnacle/src/ui/theme.ts#markdownTheme`), and the composer's frame and select list in the tones too (`binnacle:packages/binnacle/src/ui/theme.ts#editorTheme`).

## Choices

- The tones are pi's names for what content means (`pi:packages/coding-agent/docs/themes.md`).
- Each tone is one of the terminal's own sixteen colours, so the person's palette decides how it looks, as it does for everything else they run. pi's own themes name exact colours instead.
- Each mark's glyph is one column wide and a glyph every terminal's fonts carry, so a mark never misaligns what it stands before.
- Which marks exist, the glyph each draws and the tone it draws it in, change on request; so do the tones, and the colour each takes.
- A fenced code block is not highlighted, so its lines are the terminal's own.
- The composer's frame is `dim`, as chrome nobody reads.
