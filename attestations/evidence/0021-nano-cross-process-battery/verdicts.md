# argus-seal-0021 — Nano cross-process idempotency battery @ agent-passport-gateway 99888e8

Trials: 13 rows, PASS: 13/13; checks: 106/106.

| trial | row | mode | verdict |
|---|---|---|---|
| R1-1 | R1 | A | PASS |
| R1-2 | R1 | B | PASS |
| R1-3 | R1 | sim | PASS |
| R2a-1 | R2a | sim | PASS |
| R2a-2 | R2a | sim | PASS |
| R2b-1 | R2b | A | PASS |
| R2b-2 | R2b | B | PASS |
| R2b-3 | R2b | sim | PASS |
| R3-1 | R3 | A | PASS |
| R3-2 | R3 | B | PASS |
| R3-3 | R3 | sim | PASS |
| R4-1 | R4 | R4 | PASS |
| INVARIANT | INV | undefined | PASS |

## R1-1 (R1, mode=A) — PASS

- ok   process-exit: A=0 B=0
- ok   one-reservation-wins: winner=A loser=B mode=A
- ok   loser-observes-original: loser opId=b0b702e0-1bb3-4e22-874c-8138eaceeff3 winner opId=b0b702e0-1bb3-4e22-874c-8138eaceeff3
- ok   no-error-on-either: A=reserved B=replay
- ok   reservations-eq-1: distinct reserved ops=1 (hold rows=2)
- ok   ops-eq-1: wallet_ops rows=1
- ok   budget-decremented-once: low del-3: used=1000 limit=3000 | top del-2: used=1000 limit=5000
- ok   winner-published-once: publish=accepted
- ok   one-process-call: process calls=1
- ok   one-signature: node calls=account_info,work_generate,process
- ok   block-matches-stored: process block vs stored block_json
- ok   inv-no-underflow: low del-3: used=1000 limit=3000 | top del-2: used=1000 limit=5000

## R1-2 (R1, mode=B) — PASS

- ok   process-exit: A=0 B=0
- ok   one-reservation-wins: winner=B loser=A mode=B
- ok   loser-observes-original: loser opId=07cd2645-c536-4d1b-9598-0d6c0b3452be winner opId=07cd2645-c536-4d1b-9598-0d6c0b3452be
- ok   no-error-on-either: A=replay B=reserved
- ok   reservations-eq-1: distinct reserved ops=1 (hold rows=2)
- ok   ops-eq-1: wallet_ops rows=1
- ok   budget-decremented-once: low del-3: used=1000 limit=3000 | top del-2: used=1000 limit=5000
- ok   winner-published-once: publish=accepted
- ok   one-process-call: process calls=1
- ok   one-signature: node calls=account_info,work_generate,process
- ok   block-matches-stored: process block vs stored block_json
- ok   inv-no-underflow: low del-3: used=1000 limit=3000 | top del-2: used=1000 limit=5000

## R1-3 (R1, mode=sim) — PASS

- ok   process-exit: A=0 B=0
- ok   one-reservation-wins: winner=B loser=A mode=sim
- ok   loser-observes-original: loser opId=6f84f27c-13f6-419d-8f46-b322dba3bcdf winner opId=6f84f27c-13f6-419d-8f46-b322dba3bcdf
- ok   no-error-on-either: A=replay B=reserved
- ok   reservations-eq-1: distinct reserved ops=1 (hold rows=2)
- ok   ops-eq-1: wallet_ops rows=1
- ok   budget-decremented-once: low del-3: used=1000 limit=3000 | top del-2: used=1000 limit=5000
- ok   winner-published-once: publish=accepted
- ok   one-process-call: process calls=1
- ok   one-signature: node calls=account_info,work_generate,process
- ok   block-matches-stored: process block vs stored block_json
- ok   inv-no-underflow: low del-3: used=1000 limit=3000 | top del-2: used=1000 limit=5000

## R2a-1 (R2a, mode=sim) — PASS

- ok   process-exit: A=0 B=0
- ok   409-both: A=idempotency_mismatch B=idempotency_mismatch
- ok   zero-new-reservations: distinct reserved ops=1 ops=1 preOp=c92e75cc-efaa-4cce-a486-e1a5187e4c5c
- ok   stored-op-byte-identical: pre-race row snapshot vs post-race row
- ok   budget-untouched: low del-3: used=1000 limit=3000 | top del-2: used=1000 limit=5000
- ok   no-node-calls: node calls=0
- ok   inv-no-underflow: low del-3: used=1000 limit=3000 | top del-2: used=1000 limit=5000

## R2a-2 (R2a, mode=sim) — PASS

- ok   process-exit: A=0 B=0
- ok   409-both: A=idempotency_mismatch B=idempotency_mismatch
- ok   zero-new-reservations: distinct reserved ops=1 ops=1 preOp=294aabf3-455f-4a5d-84de-9f3a5f1b3953
- ok   stored-op-byte-identical: pre-race row snapshot vs post-race row
- ok   budget-untouched: low del-3: used=1000 limit=3000 | top del-2: used=1000 limit=5000
- ok   no-node-calls: node calls=0
- ok   inv-no-underflow: low del-3: used=1000 limit=3000 | top del-2: used=1000 limit=5000

## R2b-1 (R2b, mode=A) — PASS

- ok   process-exit: A=0 B=0
- ok   exactly-one-reservation: winner=A loser=B:idempotency_mismatch mode=A
- ok   sequenced-winner-matches-mode: mode=A winner=A
- ok   ops-eq-1: wallet_ops rows=1
- ok   reservations-eq-1: distinct reserved ops=1 (hold rows=2)
- ok   budget-by-winner-only: low del-3: used=1000 limit=3000 | top del-2: used=1000 limit=5000 expected=1000
- ok   inv-no-underflow: low del-3: used=1000 limit=3000 | top del-2: used=1000 limit=5000

## R2b-2 (R2b, mode=B) — PASS

- ok   process-exit: A=0 B=0
- ok   exactly-one-reservation: winner=B loser=A:idempotency_mismatch mode=B
- ok   sequenced-winner-matches-mode: mode=B winner=B
- ok   ops-eq-1: wallet_ops rows=1
- ok   reservations-eq-1: distinct reserved ops=1 (hold rows=2)
- ok   budget-by-winner-only: low del-3: used=2000 limit=3000 | top del-2: used=2000 limit=5000 expected=2000
- ok   inv-no-underflow: low del-3: used=2000 limit=3000 | top del-2: used=2000 limit=5000

## R2b-3 (R2b, mode=sim) — PASS

- ok   process-exit: A=0 B=0
- ok   exactly-one-reservation: winner=B loser=A:idempotency_mismatch mode=sim
- ok   ops-eq-1: wallet_ops rows=1
- ok   reservations-eq-1: distinct reserved ops=1 (hold rows=2)
- ok   budget-by-winner-only: low del-3: used=2000 limit=3000 | top del-2: used=2000 limit=5000 expected=2000
- ok   inv-no-underflow: low del-3: used=2000 limit=3000 | top del-2: used=2000 limit=5000

## R3-1 (R3, mode=A) — PASS

- ok   process-exit: A=0 B=0
- ok   second-refused: winner=A refused=B:wallet_busy
- ok   one-op-only: ops=1 distinct reserved ops=1
- ok   first-unfinished: op status=reserved
- ok   neither-signs: node calls=
- ok   budget-decremented-once: low del-3: used=1000 limit=3000 | top del-2: used=1000 limit=5000
- ok   inv-no-underflow: low del-3: used=1000 limit=3000 | top del-2: used=1000 limit=5000

## R3-2 (R3, mode=B) — PASS

- ok   process-exit: A=0 B=0
- ok   second-refused: winner=B refused=A:wallet_busy
- ok   one-op-only: ops=1 distinct reserved ops=1
- ok   first-unfinished: op status=reserved
- ok   neither-signs: node calls=
- ok   budget-decremented-once: low del-3: used=1000 limit=3000 | top del-2: used=1000 limit=5000
- ok   inv-no-underflow: low del-3: used=1000 limit=3000 | top del-2: used=1000 limit=5000

## R3-3 (R3, mode=sim) — PASS

- ok   process-exit: A=0 B=0
- ok   second-refused: winner=A refused=B:wallet_busy
- ok   one-op-only: ops=1 distinct reserved ops=1
- ok   first-unfinished: op status=reserved
- ok   neither-signs: node calls=
- ok   budget-decremented-once: low del-3: used=1000 limit=3000 | top del-2: used=1000 limit=5000
- ok   inv-no-underflow: low del-3: used=1000 limit=3000 | top del-2: used=1000 limit=5000

## R4-1 (R4, mode=R4) — PASS

- ok   process-exit: A=0 B=0
- ok   a-reserved: A reserve=reserved publish=accepted
- ok   b-replays-original: B reserve=replay opId match=true
- ok   b-no-new-signature: blockJson unchanged=true attempts=2
- ok   b-node-actions-process-only: B node actions=process
- ok   two-process-calls: process calls=2
- ok   same-stored-block-republished: block#1 vs block#2 canonical JSON
- ok   db-block-matches: stored block_json vs process call
- ok   attempts-recorded: attempts=1:accepted,2:accepted
- ok   one-op-one-reservation: ops=1 distinct reserved ops=1
- ok   budget-decremented-once: low del-3: used=1000 limit=3000 | top del-2: used=1000 limit=5000
- ok   inv-no-underflow: low del-3: used=1000 limit=3000 | top del-2: used=1000 limit=5000

## INVARIANT (INV, mode=undefined) — PASS

- ok   reservation-count-eq-1-in-R1: across all R1 trials
- ok   no-budget-underflow: spend_used_minor <= spend_limit_minor everywhere
- ok   no-double-reserve: budget decremented exactly once in every row
