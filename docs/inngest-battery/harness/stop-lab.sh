#!/usr/bin/env bash
# stop-lab.sh — stops app supervisor + dev server.
cd "$(dirname "$0")"
pkill -f "devserver/app.mjs" 2>/dev/null || true
pkill -f "supervise-app.sh" 2>/dev/null || true
pkill -f "inngest dev" 2>/dev/null || true
sleep 1
echo "[lab] stopped"
