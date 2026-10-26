#!/usr/bin/env bash
# supervise-app.sh — restarts app.mjs after process.exit crashes (p2-i4-dyn probe).
# Simulates an orchestrator: app dies mid-request, comes back within ~0.4s.
cd "$(dirname "$0")"
while true; do
  echo "[sup] $(date -Is) starting app"
  INNGEST_DEV=1 PORT=3010 SELF_URL=http://127.0.0.1:3010 node app.mjs >> app.log 2>&1
  echo "[sup] $(date -Is) app exited code=$? — restarting in 0.4s" >> app.log
  sleep 0.4
done
