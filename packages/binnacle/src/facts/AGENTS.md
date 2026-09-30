# facts

One dsh session event as one fact, the unit everything above reads. The session log and its events are dsh's; folding facts into turns is `models`'.

- `adapt.ts` — the facts adapter: reads one session event, with binnacle's adapter or an author's, as one frozen fact.
- `stream.ts` — the answer streaming: dsh's frames for the attempt running now, assembled by dsh as it would keep them if cut short, until the attempt ends.
- `kinds.ts` — the kinds table: every kind of event dsh knows, and whether binnacle reads it, keeps it quiet or leaves it unread.

## Keep

- This is where dsh's event shapes are read, and nowhere else below the host; everything above knows only the facts it returns.
