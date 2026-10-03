# Themes

A theme is one JSON file in the person's profile, named in the profile's patch: what the named file says is drawn, and a change to a named file is drawn as soon as it is written. Everything it says is data — colours, glyphs, words, spacing — and the surface never changes for a look: a view names a tone or a mark, never a colour or a glyph, and the theme says what each of those draws. Change the theme, never a view.

Paths below are relative to this skill's base directory, which the `skill` tool reports when it loads this chapter.

## The run

1. **Find the profile.** Ask the shell: `echo "$DSH_PROFILE_DIR"`. When it prints nothing, no profile is loaded and there is nowhere a theme goes — say so and stop.
2. **Write the file**: `$DSH_PROFILE_DIR/themes/<name>.json`, with `<name>` a plain file name. What it may hold is below; start from the worked example, `themes/dusk.json` beside this chapter, copied and changed. Writing the file draws nothing on its own: only the files the `binnacle-theme` row names are read.
3. **Check it before calling it done.**
   - Preflight against `../../theme.schema.json`, the JSON Schema the package ships, however you validate one.
   - The authoritative reading, which the schema is only a preflight for: `node ../../dist/host/check-theme.js <file>`. It prints `ok` and exits 0, or prints the line saying what to change and exits 1. A file the surface refuses is drawn as a notice naming its path, and the theme beneath it stays.
4. **Choose it.** Which files draw is the config of the `binnacle-theme` row, set in `$DSH_PROFILE_DIR/cordis.patch.yml`:

   ```yaml
   - id: binnacle-theme
     config:
       theme: <name>
   ```

   `light:` and `dark:` name one file each, for a terminal of that appearance, replacing the theme file's own variant of it. A config change applies at the next start — say so when the person asks where their theme is. A file the row already names is another matter: it is watched, and a change to it is drawn at once, with no restart, which is the way to recolour a theme already chosen.

Done is: the file written, the checker saying `ok` of it, and the row's config naming it. The person sees it at the next start; a file that was already named, they see change as it is written.

## What the file may say

Each part names only what it changes; what it leaves out stays as the theme beneath it has it.

- `vars` — colours named once, for the rest of the file to give by name; a var may name another.
- `tones` — how a tone draws: `color`, `background`, and the attributes `bold`, `dim`, `italic`, `underline`.
- `backgrounds` — a colour each, for the bands and fills that name one.
- `marks` — a mark's `glyph` and the `tone` it draws in.
- `chrome` — the glyphs the surface draws with: a border's `border` pieces, `frame` as one word (`rounded`, `square`, `heavy`, `double`, `none`), `gutter`, `focus`, `cut`, `separator`, `jump`.
- `words` — what a fold says of itself, each a template of `{n}` and `{lines}`; and what an ask says of itself: `page` after the keys that page its prose, `offer.at` and `page.at`, templates of `{count}` and `{of}`, saying where its window is and which page its prose is on.
- `folds` — how each kind of entry's folds start: `rows` shown while folded, and `open`.
- `spacing` — the room the layout leaves: `band`, `ask`, `show`, `indent`, `gap`.
- `asks` — how every ask is given room: `rows`, the height it is drawn in as a box of its own, the edges included, from three up; absent, an ask grows with what it holds, up to the room its place gives it.
- `light`, `dark` — a variant, laid over the rest of the file on a terminal of that appearance; one file can hold both.
- `colors` — pi's own theme block, taken as it is: a token ending in `Bg` fills that background, every other token is that tone's colour, and `""` leaves the token as binnacle has it. `$schema`, `name`, `export` and `appearance` are ignored.

A colour is one of the terminal's sixteen by name (`black` through `bright-white`), a 256-colour index from 0 to 255, `#rrggbb` or `#rgb`, `okhsl(h s% l%)`, `oklch(l c h)`, or the name of one of the file's vars.

The names binnacle draws:

- tones — `accent`, `muted`, `dim`, `success`, `warning`, `error`, `border` (an ask's frame), `borderAccent` (an approval's or a question's), `borderMuted` (the composer's frame, a show's gutter), `text`, `userMessageText`, `searchMatchText`, `toolTitle`, `toolOutput`, `thinkingText`, `mdHeading`, `mdLink`, `mdLinkUrl`, `mdCode`, `mdCodeBlock`, `mdCodeBlockBorder`, `mdQuote`, `mdQuoteBorder`, `mdHr`, `mdListBullet`.
- backgrounds — `userMessageBg` (a prompt's band), `searchMatchBg` (a search's matches).
- marks — `running`, `done`, `failed`, `problem`, `prompt`, `steer`, `thinking`, `context`, `approval`, `unknown`, `compaction`, `presented`, `retry`, `workflow`.

A theme may add names of its own — a tone, a background, a mark — but nothing draws them until a view names them, and a view that does is a plugin written separately. Pi's `agent`, `panelBg`, `syntax*` and `diff*` tokens have no part to draw: no view names them today, so setting them changes nothing. Keep them only when copying a pi theme whole.

On the main screen, a row already printed keeps the theme it was printed in; what is drawn after the change — the alternate screen included — takes the new theme. Tell the person so when they look for the change in what they already scrolled past.
