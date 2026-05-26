#!/usr/bin/env bash
set -euo pipefail

LABEL="com.fivedollars.daily"

if ! launchctl list | grep -q "$LABEL"; then
  echo "LaunchAgent is not loaded: $LABEL" >&2
  echo "Run npm run scheduler:install first." >&2
  exit 1
fi

launchctl start "$LABEL"
echo "Started LaunchAgent: $LABEL"
echo "Check progress with: npm run scheduler:status"
