#!/bin/bash
# Bottom Time — mobile Expo Metro launcher.
#
# Purpose: bridge the supervisor-managed `mobile` program (non-TTY,
# non-interactive) with the EXPO_TOKEN credential that `expo start --tunnel`
# now requires because `app.json` declares `expo.owner` + `expo.extra.eas`.
#
# Secrets live in /root/.eas-secrets/env.sh (mode 600). We source that file
# so EXPO_TOKEN is exported into the child `expo` process and never appears
# in supervisor config, repo, or process listings.
#
# Other env vars (CI, NGROK_AUTHTOKEN, EXPO_DEVTOOLS_LISTEN_ADDRESS) are
# still supplied by supervisor's `environment=` line — this wrapper only
# layers EXPO_TOKEN on top.
set -e
# shellcheck disable=SC1091
if [ -r /root/.eas-secrets/env.sh ]; then
  source /root/.eas-secrets/env.sh
fi
cd /app/mobile
exec yarn expo start --tunnel --port 3001
