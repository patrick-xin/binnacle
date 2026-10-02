#!/bin/sh
# Wait until a Charge needs the Sheepdog, then print which and exit 0; exit 3 after half an hour of nothing, 1 when shepherd cannot watch.
# HANDLED holds "charge:needs" pairs already read, space-separated, so a Charge that stays settled does not wake the
# Sheepdog again. Leave it empty after prompting a Sheep again: a Sheep that settles a second time needs the same pair
# it did the first. A question always wakes it, whatever HANDLED holds: a Sheep's second question needs the same pair
# as its first, and one skipped is a Sheep left waiting.
# A reviewer beside a Sheep is no Charge: it asks by writing /tmp/review-<n>-ask.md, which wakes the Sheepdog too, until
# the Sheepdog answers and removes the file.
# Run it in the background, so its exit wakes the Sheepdog; never with & alone, which wakes no one.
cd "$(git worktree list --porcelain | sed -n '1s/^worktree //p')" || exit 1
end=$(( $(date +%s) + 1800 ))
while [ "$(date +%s)" -lt "$end" ]; do
  for ask in /tmp/review-*-ask.md; do [ -f "$ask" ] && { echo "reviewer asking: $ask"; exit 0; }; done
  out=$(shepherd watch --json --timeout 20000 2>/tmp/watch.err); status=$?
  # 3 is a quiet Flock; anything but 0 or 3 is shepherd failing to watch, said now rather than as a timeout later.
  [ "$status" -eq 3 ] && continue
  if [ "$status" -ne 0 ]; then echo "shepherd watch failed ($status):" >&2; cat /tmp/watch.err >&2; exit 1; fi
  fresh=$(printf '%s' "$out" | HANDLED="$HANDLED" python3 -c '
import json, os, sys
handled = set(os.environ.get("HANDLED", "").split())
rows = json.load(sys.stdin)
for row in rows:
    key = row["charge"] + ":" + row.get("needs", "")
    if row.get("needs") == "asking" or key not in handled: print(key, row.get("next", ""))
') || { echo "shepherd watch said what cannot be read: $out" >&2; exit 1; }
  if [ -n "$fresh" ]; then printf '%s\n' "$fresh"; exit 0; fi
  sleep 10
done
echo timeout; exit 3
