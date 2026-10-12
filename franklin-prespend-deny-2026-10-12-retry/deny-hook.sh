#!/bin/sh
# TEST-ONLY PreSpend hook (created outside the Franklin source tree).
# Unconditionally denies. Captures the exact stdin envelope it receives.
LOG="${F1_HOOK_LOG:?}"
INPUT="$(cat)"
printf '%s\n' "$INPUT" >> "$LOG"
printf '{"decision":"deny","reason":"ARGUS_F1_PRESPEND_DENY_TEST"}\n'
exit 2
