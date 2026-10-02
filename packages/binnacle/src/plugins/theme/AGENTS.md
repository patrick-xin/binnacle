# plugins/theme

The Theme row: the theme files a person's profile holds, read through the host's grant and registered as one theme registration, again on every change. Its config — set on its row, `binnacle-theme`, in the profile's patch — names them: `theme` one file, `light` and `dark` one each for a terminal of that appearance.

- `index.ts` — the plugin: parses its config, combines each file's last accepted changes — a hand-over becomes accepted only once the registration it drove stands — and registers the combination, the new registration standing before the last is disposed.
- `read.ts` — what one theme file holds as theme changes: pi's `colors` translated into tones and backgrounds, pi's other blocks read (`vars`) or ignored (`$schema`, `name`, `export`, `appearance`).

## Keep

- A file's data is parsed where it enters: what it holds that binnacle cannot draw is refused by the theme registration, and drawn as a notice naming the file's path.
