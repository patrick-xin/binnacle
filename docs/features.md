# Feature map

Everything a person can do with binnacle, by the stage of their journey it serves, each with its page. A page says what a person can do with the feature, how its parts work together, and the choices a person may ask to change. It changes with its feature, in the same commit. Why binnacle as a whole is shaped the way it is belongs to [the architecture](architecture.md) and its decision records.

## Arrive: where am I, and what can I do?

- [Session](features/session.md): open a session with an agent, check one opens, and quit.
- [Status line](features/status-line.md): the line under the composer — what the session runs and where it stands, and a notice while one stands.

## Ask: how do I say it?

- [Composer](features/composer.md): type a line and send it to the agent.

## Watch: what is it doing?

- [Transcript](features/transcript.md): the session log drawn as turns, with what was sent, answered, called and returned.
- [Tool cards](features/tool-cards.md): each tool call read as its tool presents it — its title, and what it returned folded beneath.

## Decide: what does the agent ask?

- [Blocks](features/blocks.md): the containers a view draws with — an ask that fits the room it is given, its prose paged and its offers windowed by keys, its edges always drawn.
- [Approvals](features/approvals.md): what the agent asks to do, in the composer's place — allow it once or reject it by a key, and what was decided drawn in the transcript.
- [Questions](features/questions.md): what the agent asks a person, in the composer's place — pick an option, type an answer, or skip, one question at a time.

## Review: what happened?

- [TUI mode](features/tui-mode.md): read the session on the alternate screen or in the terminal's scrollback, and switch between them.
- [Trajectory](features/trajectory.md): every event the session logged, machinery included, on a screen of its own — one line each, grouped by turn, any one opening to its record.
- [Keys](features/keys.md): reach what content offers from the keyboard — focus it, open it, on either screen.

## Tune: can I make it mine?

- [Theme](features/theme.md): the tones content is drawn in, a band's background, their colours, and how each kind's folds start — kept as files in the profile, one for a light terminal and one for a dark.
- [Presets](features/presets.md): choose the composition a session's agent runs on — dsh's web presets copied byte for byte, and binnacle's own `author` — for now by editing the profile's patch.
- [Authoring](features/authoring.md): a plugin in the profile reads the session's events its own way and draws any kind of entry its own way.
