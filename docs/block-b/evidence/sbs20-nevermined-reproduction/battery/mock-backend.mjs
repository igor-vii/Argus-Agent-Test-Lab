// Argus Agent Test Lab — wave 5 (S-BS-20) mock facilitator backend.
//
// Honest-backend semantics modeled 1:1 from the vendor's own published
// contracts (src/x402/facilitator-api.ts, token-version.ts, middleware.ts
// comments), never invented:
//   - default mint = v2 (reusable, no nonce); v3 (single-use) is opt-in via
//     tokenVersion: 3 — backend minter is `(options.tokenVersion ?? 2) === 3`.
//   - verify NEVER consults the nonce (middleware.ts:1305 comment, verbatim:
//     "`verify` cannot catch it — the backend never consults the nonce there").
//   - settle spends the v3 nonce; a second settle of the same token rejects
//     with HTTP 402 + code BCK.X402.0059 (catalogued as httpStatus 402).
//   - verify simulates without burning; settle burns.
//   - settle may also report failure as 200 + { success: false } (documented
//     in facilitator-api.ts:650: "e.g. errorReason: 'Cannot order plan'").
// All traffic stays on 127.0.0.1. No vendor-operated service is contacted.
import http from 'node:http'
import { randomBytes } from 'node:crypto'

const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString('base64url')

export function createMockBackend({
  planId = 'plan-argus-1',
  initialCredits = 1000,
} = {}) {
  const state = {
    planId,
    delegations: new Map([[planId, { remaining: initialCredits, limit: initialCredits }]]),
    spentNonces: new Set(),
    tokens: new Map(), // nonce -> token envelope (evidence)
    mintLog: [],
    verifyLog: [],
    settleLog: [],
    faults: {
      // 'http500' | 'successFalse' for the next settle; 'dropV3' mints v2
      // regardless of the requested version (faithful to a ValidationPipe
      // with whitelist:true and no forbidNonWhitelisted — the field is
      // dropped WITHOUT an error, per token-version.ts header comment).
      nextSettle: null,
      dropV3: false,
    },
  }

  const json = (res, status, obj) => {
    const body = JSON.stringify(obj)
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    })
    res.end(body)
  }

  const readBody = (req) =>
    new Promise((resolve) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
        } catch {
          resolve({})
        }
      })
    })

  const decodeToken = (token) => {
    try {
      return JSON.parse(Buffer.from(token, 'base64url').toString('utf8'))
    } catch {
      return null
    }
  }

  const server = http.createServer(async (req, res) => {
    const url = req.url.split('?')[0]

    // ---- mint -----------------------------------------------------------
    if (req.method === 'POST' && url === '/api/v1/x402/permissions') {
      const body = await readBody(req)
      const requested = body.tokenVersion === 3 ? 3 : 2
      const version = state.faults.dropV3 ? 2 : requested
      state.faults.dropV3 = false
      const nonce = version === 3 ? randomBytes(32).toString('hex') : undefined
      const envelope = {
        payload: {
          planId: body.accepted?.planId ?? state.planId,
          agentId: body.accepted?.extra?.agentId,
          scheme: body.accepted?.scheme ?? 'nvm:erc4337',
          ...(version === 3 && {
            authorization: {
              nonce,
              resource: body.resource?.url ?? '',
              httpVerb: body.accepted?.extra?.httpVerb ?? '',
            },
          }),
          iat: Math.floor(Date.now() / 1000),
          ...(version === 3 && { exp: Math.floor(Date.now() / 1000) + 300 }),
        },
      }
      const accessToken = b64url(envelope)
      state.mintLog.push({ requested, minted: version, hasNonce: Boolean(nonce) })
      if (nonce) state.tokens.set(nonce, accessToken)
      // A pre-v3 backend has no tokenVersion field in its response at all.
      const out = { accessToken }
      if (!state.faults.dropV3 && version === requested) out.tokenVersion = version
      return json(res, 200, out)
    }

    // ---- verify (never consults the nonce, never burns) ------------------
    if (req.method === 'POST' && url === '/api/v1/x402/verify') {
      const body = await readBody(req)
      const decoded = decodeToken(body.x402AccessToken)
      const plan = state.delegations.get(decoded?.payload?.planId ?? '')
      const maxAmount = BigInt(body.maxAmount ?? '1')
      let result
      if (!plan) {
        result = { isValid: false, invalidReason: 'BCK.X402.0001 unknown plan' }
      } else if (plan.remaining < maxAmount) {
        result = {
          isValid: false,
          invalidReason: 'BCK.X402.0006 insufficient credits',
        }
      } else {
        result = {
          isValid: true,
          agentRequest: { agentRequestId: `ar-${state.verifyLog.length + 1}` },
        }
      }
      state.verifyLog.push({
        maxAmount: maxAmount.toString(),
        remaining: plan ? plan.remaining.toString() : null,
        isValid: result.isValid,
      })
      return json(res, 200, result)
    }

    // ---- settle (burns; v3 single-use via backend nonce store) -----------
    if (req.method === 'POST' && url === '/api/v1/x402/settle') {
      const body = await readBody(req)
      const fault = state.faults.nextSettle
      state.faults.nextSettle = null
      if (fault === 'http500') {
        state.settleLog.push({ outcome: 'http500' })
        return json(res, 500, { message: 'facilitator unavailable' })
      }
      const decoded = decodeToken(body.x402AccessToken)
      const auth = decoded?.payload?.authorization
      const nonce = typeof auth?.nonce === 'string' && auth.nonce.trim() !== '' ? auth.nonce : null
      const plan = state.delegations.get(decoded?.payload?.planId ?? '')
      const maxAmount = BigInt(body.maxAmount ?? '1')
      const record = (outcome) => {
        state.settleLog.push({
          outcome,
          singleUse: Boolean(nonce),
          maxAmount: maxAmount.toString(),
          remaining: plan ? plan.remaining.toString() : null,
        })
      }
      if (nonce && state.spentNonces.has(nonce)) {
        record('already_used')
        return json(res, 402, {
          message: 'Access token already used',
          code: 'BCK.X402.0059',
        })
      }
      if (!plan || BigInt(plan.remaining) < maxAmount) {
        record('insufficient')
        return json(res, 402, {
          message: 'insufficient credits',
          code: 'BCK.X402.0006',
        })
      }
      if (nonce) state.spentNonces.add(nonce)
      plan.remaining -= Number(maxAmount)
      if (fault === 'successFalse') {
        record('success_false')
        return json(res, 200, {
          success: false,
          errorReason: 'Cannot order plan',
          creditsRedeemed: '0',
          transaction: {},
        })
      }
      record('settled')
      return json(res, 200, {
        success: true,
        creditsRedeemed: maxAmount.toString(),
        transaction: { id: `tx-${state.settleLog.length}` },
      })
    }

    // ---- plan metadata (scheme resolution, cached by the SDK) ------------
    if (req.method === 'GET' && url.startsWith('/api/v1/protocol/plans/')) {
      return json(res, 200, {
        id: state.planId,
        registry: { price: { isCrypto: true } },
        metadata: { plan: {} },
      })
    }

    return json(res, 404, { message: `no route ${req.method} ${url}` })
  })

  return {
    state,
    listen: () =>
      new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve(server.address().port))
      }),
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}
