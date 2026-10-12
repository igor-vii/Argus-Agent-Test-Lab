#!/bin/sh
# TASK F1-RETRY test-only PreSpend hook: unconditional deny. NOT upstream code.
# Log path is passed via the hook's own configured `env` (explicit user grant,
# runner.ts:103), because spend-hook inherited env goes through sanitizeSubprocessEnv().
LOG="${F1_HOOK_LOG:?}/f1_prespend_event.jsonl"
cat >> "$LOG"
printf '{"decision":"deny","reason":"ARGUS_F1_PRESPEND_DENY_TEST"}\n'
exit 2
