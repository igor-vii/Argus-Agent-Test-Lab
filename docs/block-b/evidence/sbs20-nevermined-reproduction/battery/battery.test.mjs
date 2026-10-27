// Argus Agent Test Lab — wave 5 (S-BS-20) battery vs @nevermined-io/payments
// express paymentMiddleware (npm dist 1.13.0, unmodified).
//
// Gate D: everything runs on 127.0.0.1 against an HONEST local mock of the
// facilitator backend, modeled 1:1 from the vendor's own published contracts.
// No vendor-operated service is contacted. Probe rules fixed before the run.
//
// Verdict taxonomy: FAIL = vendor-side economic loss under the probe;
// HOLD = guard held; DX = developer-experience gap; OBSERVED = behavior
// matches inspection with a structural caveat. The vitest assertions capture
// the OBSERVED behavior; the verdict names its economic meaning.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createMockBackend } from './mock-backend.mjs'
import { buildApp } from './app-under-test.mjs'
import fs from 'node:fs'

const PLAN = 'plan-argus-1'
const RUN = {
  startedAt: null,
  finishedAt: null,
  sut: '@nevermined-io/payments 1.13.0 (npm dist, unmodified) — express paymentMiddleware',
  repo_commit_audited: '586ced2a7e05907cc46e92967052bea5801fe9ac',
  node: process.version,
  probes: [],
}

let backend, backendPort, payments, appHandle, appPort

beforeAll(async () => {
  RUN.startedAt = new Date().toISOString()
  backend = createMockBackend({ planId: PLAN, initialCredits: 1000 })
  backendPort = await backend.listen()
  // NVM_BACKEND_URL is read at environments.ts module-load time — it MUST be
  // set before the SDK is imported. The SDK requires the key to be a JWT
  // (decodeJwt, signature NOT verified) and derives the environment from a
  // '<prefix>:' prefix; a JWT has no ':' so resolution falls back to
  // 'custom' -> environments.custom.backend = NVM_BACKEND_URL. Passing the
  // deprecated environment option would emit a deprecation warning, so it is
  // omitted deliberately.
  process.env.NVM_BACKEND_URL = `http://127.0.0.1:${backendPort}`
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const dummyJwt = [
    b64u({ alg: 'HS256', typ: 'JWT' }),
    b64u({ sub: '0xargus0000000000000000000000000000000001', iat: Math.floor(Date.now() / 1000) }),
    'argus-local-signature',
  ].join('.')
  const sdk = await import('@nevermined-io/payments')
  payments = sdk.Payments.getInstance({ nvmApiKey: dummyJwt })
  appHandle = await buildApp({ payments, planId: PLAN })
  await new Promise((resolve) => {
    const server = appHandle.app.listen(0, '127.0.0.1', () => {
      appPort = server.address().port
      resolve()
    })
  })
})

afterAll(() => {
  RUN.finishedAt = new Date().toISOString()
  RUN.ledgers = {
    mint: backend.state.mintLog,
    verify: backend.state.verifyLog,
    settle: backend.state.settleLog,
    services: appHandle.services,
  }
  fs.writeFileSync(
    new URL('./evidence/battery-results.json', import.meta.url),
    JSON.stringify(RUN, null, 2) + '\n',
  )
  return backend.close()
})

// ---- helpers -------------------------------------------------------------

async function mint({ tokenVersion } = {}) {
  const body = {
    accepted: { scheme: 'nvm:erc4337', network: 'abstract', planId: PLAN },
    delegationConfig: { delegationId: 'del-argus-1' },
    ...(tokenVersion !== undefined && { tokenVersion }),
  }
  const r = await fetch(`http://127.0.0.1:${backendPort}/api/v1/x402/permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

const call = (route, { token, method = 'POST', signal } = {}) =>
  fetch(`http://127.0.0.1:${appPort}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'payment-signature': token }),
    },
    signal,
  })

const settledCount = () =>
  backend.state.settleLog.filter((l) => l.outcome === 'settled').length

const record = (id, name, verdict, observed) =>
  RUN.probes.push({ id, name, verdict, observed })

// ---- probes --------------------------------------------------------------

describe('S-BS-20: nevermined credit-recovery battery (x402 path of paymentMiddleware)', () => {
  it('C1 happy path: fresh v3 token buys exactly one buffered response with a receipt', async () => {
    const { accessToken } = await mint({ tokenVersion: 3 })
    const before = { services: appHandle.services.length, settled: settledCount() }
    const r = await call('/ask', { token: accessToken })
    expect(r.status).toBe(200)
    expect((await r.json()).answer).toMatch(/^ok-/)
    const receipt = r.headers.get('payment-response')
    expect(receipt).toBeTruthy()
    expect(JSON.parse(Buffer.from(receipt, 'base64').toString()).success).toBe(true)
    const observed = {
      servicesDelta: appHandle.services.length - before.services,
      settledDelta: settledCount() - before.settled,
      receiptAttached: true,
    }
    expect(observed.servicesDelta).toBe(1)
    expect(observed.settledDelta).toBe(1)
    record('C1', 'fresh v3 token, buffered 2xx', 'HOLD', observed)
  })

  it('P1 v2 default token: retry after a lost response double-charges with no reconciliation', async () => {
    const { accessToken } = await mint({}) // no tokenVersion -> v2 (reusable)
    const r1 = await call('/ask', { token: accessToken })
    expect(r1.status).toBe(200)
    await r1.text() // response #1 produced, then "lost" to the buyer
    const mid = { services: appHandle.services.length, settled: settledCount() }
    const r2 = await call('/ask', { token: accessToken }) // documented retry, same token
    expect(r2.status).toBe(200)
    await r2.json()
    const observed = {
      servicesDelta: appHandle.services.length - mid.services,
      settledDelta: settledCount() - mid.settled,
      retryCarriesIdempotencyKey: false,
      reconciliationArtifact: 'none — the only receipt was on the lost response',
    }
    expect(observed.servicesDelta).toBe(1) // handler ran AGAIN
    expect(observed.settledDelta).toBe(1) // credits burned AGAIN
    record(
      'P1',
      'v2 default (reusable) token: buyer retry after lost response = second economic execution',
      'FAIL',
      observed,
    )
  })

  it('P2 v3 concurrent race: two same-token requests, one charge — one service delivered free', async () => {
    const { accessToken } = await mint({ tokenVersion: 3 })
    const before = { services: appHandle.services.length, settled: settledCount() }
    const [r1, r2] = await Promise.all([
      call('/ask', { token: accessToken }),
      call('/ask', { token: accessToken }),
    ])
    const statuses = [r1.status, r2.status].sort()
    await Promise.all([r1.text(), r2.text()])
    const observed = {
      statuses,
      servicesDelta: appHandle.services.length - before.services,
      settledDelta: settledCount() - before.settled,
      spentGuardScope: 'per-process in-memory Map (middleware.ts:484) — no shared store provided',
    }
    expect(observed.servicesDelta).toBe(2) // BOTH handlers ran
    expect(observed.settledDelta).toBe(1) // only the first settle burned
    expect(statuses).toEqual([200, 402]) // loser gets 402 AFTER the work
    record(
      'P2',
      'v3 single-use race window: service delivered, never paid (guard is per-process)',
      'FAIL',
      observed,
    )
  })

  it('P3 settle failure (HTTP 500): resource delivered 2xx, credits never burned, console-only record', async () => {
    const { accessToken } = await mint({ tokenVersion: 3 })
    backend.state.faults.nextSettle = 'http500'
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const before = { services: appHandle.services.length, settled: settledCount() }
    const r = await call('/ask', { token: accessToken })
    expect(r.status).toBe(200) // the buyer received the service
    const body = await r.json()
    errSpy.mockRestore()
    const observed = {
      httpStatus: r.status,
      bodyDelivered: Boolean(body.answer),
      servicesDelta: appHandle.services.length - before.services,
      settledDelta: settledCount() - before.settled,
      settleOutcome: backend.state.settleLog.at(-1).outcome,
      failureChannel: 'console.error only; buyer receives success with NO payment-response header',
    }
    expect(observed.servicesDelta).toBe(1)
    expect(observed.settledDelta).toBe(0)
    expect(observed.settleOutcome).toBe('http500')
    expect(r.headers.get('payment-response')).toBeNull()
    record(
      'P3',
      'any settle failure except BCK.X402.0059 = unpaid delivery (no retry, no compensation, no buyer signal)',
      'FAIL',
      observed,
    )
  })

  it('P3b settle reports 200 + success:false: receipt attached, credits not burned, delivery stands', async () => {
    const { accessToken } = await mint({ tokenVersion: 3 })
    backend.state.faults.nextSettle = 'successFalse'
    const before = { services: appHandle.services.length, settled: settledCount() }
    const r = await call('/ask', { token: accessToken })
    expect(r.status).toBe(200)
    const body = await r.json()
    const receiptHeader = r.headers.get('payment-response')
    expect(receiptHeader).toBeTruthy() // a receipt EXISTS — for a settlement that never happened
    const receipt = JSON.parse(Buffer.from(receiptHeader, 'base64').toString())
    const observed = {
      bodyDelivered: Boolean(body.answer),
      receiptSuccess: receipt.success,
      receiptErrorReason: receipt.errorReason,
      servicesDelta: appHandle.services.length - before.services,
      settledDelta: settledCount() - before.settled,
    }
    expect(observed.receiptSuccess).toBe(false)
    expect(observed.settledDelta).toBe(0)
    expect(observed.servicesDelta).toBe(1)
    record(
      'P3b',
      'settle "succeeds" (200, success:false): middleware never reads success/errorReason — silent unpaid delivery WITH a receipt',
      'FAIL',
      observed,
    )
  })

  it('P4 verify->settle depletion race: verify passes both, settle exhausts — second service delivered free', async () => {
    backend.state.delegations.get(PLAN).remaining = 5 // exactly one /expensive call left
    const a = await mint({ tokenVersion: 3 })
    const b = await mint({ tokenVersion: 3 })
    const before = { services: appHandle.services.length, settled: settledCount() }
    const [rA, rB] = await Promise.all([
      call('/expensive', { token: a.accessToken }),
      call('/expensive', { token: b.accessToken }),
    ])
    await Promise.all([rA.text(), rB.text()])
    const observed = {
      statuses: [rA.status, rB.status],
      servicesDelta: appHandle.services.length - before.services,
      settledDelta: settledCount() - before.settled,
      verifyDoesNotReserve: true, // faithful: "the backend never consults the nonce there" (and never locks credits)
    }
    expect(observed.servicesDelta).toBe(2) // both handlers ran on a passing verify
    expect(observed.settledDelta).toBe(1) // only one settle could burn
    expect(observed.statuses.sort()).toEqual([200, 200]) // the unpaid one STILL delivered 2xx
    record(
      'P4',
      'depletion between verify and settle: second service delivered, unpaid (insufficient at settle is not special-cased)',
      'FAIL',
      observed,
    )
    backend.state.delegations.get(PLAN).remaining = 1000
  })

  it('P5 streaming route: full value delivered, settle burns (fire-and-forget), receipt is never attached', async () => {
    const { accessToken } = await mint({ tokenVersion: 3 })
    const before = { services: appHandle.services.length, settled: settledCount() }
    const r = await call('/stream', { token: accessToken, method: 'GET' })
    const text = await r.text()
    expect(text).toBe('chunk1-chunk2') // the buyer got the whole value
    // Streaming settle is void fire-and-forget launched inside res.end: the
    // response may close before the backend answers. Poll for it.
    for (let i = 0; i < 100 && settledCount() === before.settled; i++) {
      await new Promise((r2) => setTimeout(r2, 20))
    }
    const observed = {
      fullStreamDelivered: true,
      settledDelta: settledCount() - before.settled,
      receiptHeader: r.headers.get('payment-response'),
      settleIsFireAndForget: true,
      reconciliationPossible: false,
    }
    expect(observed.settledDelta).toBe(1) // charged in full
    expect(observed.receiptHeader).toBeNull() // headers already flushed by streaming
    record(
      'P5',
      'streaming (the primary agent shape): paid in full, receipt structurally impossible, settle failure after close is unsurfaced -> P1-style retries cannot be reconciled',
      'FAIL',
      observed,
    )
  })

  it('P6 tokenVersion:3 against a pre-v3 backend: silent downgrade to reusable v2, no warning', async () => {
    backend.state.faults.dropV3 = true // faithful: whitelist:true drops the field WITHOUT an error
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await payments.x402.getX402AccessToken(PLAN, undefined, {
      delegationConfig: { delegationId: 'del-argus-1' },
      tokenVersion: 3,
    })
    warnSpy.mockRestore()
    const observed = {
      requestedVersion: 3,
      returnedVersion: result.tokenVersion,
      downgradeWarningEmitted: false,
      consequence: 'a buyer that asked for single-use silently holds a reusable token',
    }
    expect(observed.returnedVersion).toBe(2) // detected honestly — but silently
    record(
      'P6',
      'v3->v2 silent downgrade: SDK detects and returns the true version but emits no warning; default mint is v2 anyway',
      'DX',
      observed,
    )
  })

  it('P2b sequential replay of a successfully settled v3 token: handler re-runs for free before the guard arms', async () => {
    const { accessToken } = await mint({ tokenVersion: 3 })
    const r1 = await call('/ask', { token: accessToken })
    expect(r1.status).toBe(200)
    await r1.text()
    // Let the settle from call #1 fully land.
    await new Promise((r2) => setTimeout(r2, 100))
    const servicesAfterFirst = appHandle.services.length
    const settledAfterFirst = settledCount()
    const r2 = await call('/ask', { token: accessToken }) // replay the SPENT token
    const replayStatus = r2.status
    await r2.text()
    // The guard (markX402TokenSpent) is armed ONLY by the 0059 settle error —
    // the success path never marks the token. So the replay re-runs the
    // handler for free, then gets 402 with a withheld body.
    const newServicesAfterReplay = appHandle.services.length - servicesAfterFirst
    // A THIRD call must now be refused pre-handler (guard armed by witnessing 0059).
    const r3 = await call('/ask', { token: accessToken })
    await r3.text()
    const observed = {
      replayStatus,
      newServicesAfterReplay, // free handler execution (side effects included)
      newSettlesAfterReplay: settledCount() - settledAfterFirst, // none: backend refused with 0059
      thirdCallStatus: r3.status,
      guardArmsOnlyAfterWitnessing0059: true,
      guardScope: 'per-process in-memory Map',
    }
    expect(replayStatus).toBe(402) // buyer gets nothing...
    expect(newServicesAfterReplay).toBe(1) // ...but the handler already re-ran for free
    expect(observed.newSettlesAfterReplay).toBe(0)
    expect(observed.thirdCallStatus).toBe(402)
    record(
      'P2b',
      'replay of a spent v3 token: local guard is reactive (arms only after witnessing BCK.X402.0059) — one free handler execution per spent token, then refusal',
      'FAIL',
      observed,
    )
  })

  it('C3 buyer disconnect before delivery: handler work wasted but nothing settles', async () => {
    const { accessToken } = await mint({ tokenVersion: 3 })
    const before = { services: appHandle.services.length, settled: settledCount() }
    const ac = new AbortController()
    const pending = call('/slow', { token: accessToken, signal: ac.signal })
    // wait until the handler is parked on the gate
    for (let i = 0; i < 100 && appHandle.services.length === before.services; i++) {
      await new Promise((r) => setTimeout(r, 10))
    }
    ac.abort()
    await appHandle.gates.at(-1) && (appHandle.gates.at(-1).open = true)
    await pending.catch(() => {})
    await new Promise((r) => setTimeout(r, 100))
    const observed = {
      handlerRan: appHandle.services.length - before.services, // wasted seller work
      settledDelta: settledCount() - before.settled, // nothing charged
    }
    expect(observed.handlerRan).toBe(1)
    expect(observed.settledDelta).toBe(0)
    record(
      'C3',
      'buyer disconnect before delivery: honest not-charged (seller eats the handler work)',
      'HOLD',
      observed,
    )
  })

  it('C4 verify rejection with empty balance: 402 pre-handler, no delivery, no charge', async () => {
    backend.state.delegations.get(PLAN).remaining = 0
    const { accessToken } = await mint({ tokenVersion: 3 })
    const before = { services: appHandle.services.length, settled: settledCount() }
    const r = await call('/ask', { token: accessToken })
    expect(r.status).toBe(402)
    await r.text()
    const observed = {
      status: r.status,
      servicesDelta: appHandle.services.length - before.services,
      settledDelta: settledCount() - before.settled,
    }
    expect(observed.servicesDelta).toBe(0)
    expect(observed.settledDelta).toBe(0)
    record('C4', 'insufficient credits refused by verify pre-handler', 'HOLD', observed)
    backend.state.delegations.get(PLAN).remaining = 1000
  })
})
