# Evidence for record #0026 — apiguru amazon-scraper-v2 x402 surface probe

Sandbox run 2026-11-20 (~17:37–17:59 UTC). Two live HTTP calls total, within a
pre-set 1–2 free-call budget; no paid call. Sealed as `argus-finding-0026`,
signed by the probe-session key `argus-lab-probe-2026q4`.

| File | Content |
|---|---|
| `live_call_own_asin.txt` | Full capture of the single live-path call: `GET /agent/v1/v2/product-details?asin=B08N5WRWNW` → HTTP 404 "ASIN not found on this marketplace domain", 1.728826 s, 174 bytes, `x-free-probes-remaining: 2` (3→2 — the "billed 404" semantics for keyless clients), `x-price-next-call: $0.003`, `x-request-id: b675d905-2c2d-47ff-ae71-739204a3a4ba`. |

The sample-path call (docs ASIN `B09DJLW458` → 200 from a shared sample copy,
`free_calls_remaining` unchanged at 3, request_id `65347b57-…`) was captured in
the same run and is quoted verbatim in the record body and the report
(`docs/probe-run-2026-11-20/apiguru-x402-passport-2026-11-20.md`).

Checks:

```bash
node tools/registry/verify-registry.mjs     # whole registry, includes #0026
sha256sum -c manifest.sha256                # byte-exact artifact
```
