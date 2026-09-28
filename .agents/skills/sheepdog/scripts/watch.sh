#!/bin/sh
# Wait until a Charge needs the Sheepdog, then print which and exit 0; exit 3 after half an hour of nothing.
# HANDLED holds "charge:needs" pairs already answered, space-separated. Leave it empty after prompting a Sheep again:
# a Sheep that settles a second time needs the same pair it did the first.
# Run it in the background, so its exit wakes the Sheepdog; never with & alone, which wakes no one.
cd "$(git worktree list --porcelain | sed -n '1s/^worktree //p')" || exit 1
end=$(( $(date +%s) + 1800 ))
while [ "$(date +%s)" -lt "$end" ]; do
  fresh=$(shepherd watch --json --timeout 20000 2>/dev/null | HANDLED="$HANDLED" python3 -c '
import json, os, sys
handled = set(os.environ.get("HANDLED", "").split())
try: rows = json.load(sys.stdin)
except Exception: rows = []
for row in rows:
    key = row["charge"] + ":" + row.get("needs", "")
    if key not in handled: print(key, row.get("next", ""))
')
  if [ -n "$fresh" ]; then printf '%s\n' "$fresh"; exit 0; fi
  sleep 10
done
echo timeout; exit 3
