#!/usr/bin/env bash
# start-lab.sh — starts app supervisor + Inngest dev server for the I5 battery.
set -u
cd "$(dirname "$0")"
BIN="$(cd .. && pwd)/node_modules/.bin/inngest"

# stop leftovers
pkill -f "devserver/app.mjs" 2>/dev/null || true
pkill -f "supervise-app.sh" 2>/dev/null || true
pkill -f "inngest dev" 2>/dev/null || true
sleep 1

nohup bash ./supervise-app.sh > supervise.log 2>&1 &
echo $! > supervise.pid
echo "[lab] app supervisor started (pid $!)"

nohup "$BIN" dev --no-discovery -u http://127.0.0.1:3010/api/inngest > dev.log 2>&1 &
echo $! > dev.pid
echo "[lab] dev server starting (pid $!) — ui http://127.0.0.1:8288"
