#!/usr/bin/env bash
set -euo pipefail

LABEL="com.fivedollars.daily"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"

echo "Label: $LABEL"
echo "Plist: $PLIST_PATH"

if [[ ! -f "$PLIST_PATH" ]]; then
  echo "Installed: no"
  exit 1
fi

echo "Installed: yes"
plutil -lint "$PLIST_PATH"

if launchctl list | grep -q "$LABEL"; then
  echo "Loaded: yes"
  launchctl list | grep "$LABEL"
else
  echo "Loaded: no"
  exit 1
fi

echo
echo "Next scheduled run is controlled by StartCalendarInterval in the plist."
echo "Recent stdout log:"
tail -n 20 "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/logs/launchd.out.log" 2>/dev/null || true

echo
echo "Recent stderr log:"
tail -n 20 "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/logs/launchd.err.log" 2>/dev/null || true
