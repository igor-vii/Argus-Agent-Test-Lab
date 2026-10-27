// Argus Agent Test Lab — wave 5 (S-BS-20): app under test.
// SUT = the vendor's own express paymentMiddleware from the published npm
// dist (@nevermined-io/payments 1.13.0), UNMODIFIED, mounted on a plain
// express app with buffered, streaming, and slow routes. The facilitator
// backend behind it is the local honest mock (mock-backend.mjs).
import express from 'express'

// The SDK is imported LAZILY: environments.custom.backend is evaluated at
// module-load time from process.env.NVM_BACKEND_URL, so the import must happen
// only after the test's beforeAll has pointed it at the local mock.
export async function buildApp({ payments, planId }) {
  const { paymentMiddleware } = await import('@nevermined-io/payments/express')
  const app = express()
  app.use(express.json())

  // Service-delivery ledger: one entry per handler invocation, regardless of
  // payment outcome. The gap between services and settled credits IS the
  // finding surface.
  const services = []

  const protectedRoutes = paymentMiddleware(payments, {
    'POST /ask': { planId, credits: 1 },
    'POST /expensive': { planId, credits: 5 },
    'GET /stream': { planId, credits: 1 },
    'POST /slow': { planId, credits: 1 },
  })
  app.use(protectedRoutes)

  app.post('/ask', (req, res) => {
    services.push({ route: '/ask', at: Date.now() })
    res.json({ answer: `ok-${services.length}` })
  })

  app.post('/expensive', (req, res) => {
    services.push({ route: '/expensive', at: Date.now() })
    res.json({ answer: `big-${services.length}` })
  })

  app.get('/stream', (req, res) => {
    services.push({ route: '/stream', at: Date.now() })
    res.setHeader('Content-Type', 'text/plain')
    res.write('chunk1-')
    setTimeout(() => {
      res.write('chunk2')
      res.end()
    }, 40)
  })

  // Handler holds the response open until the test releases the gate — used
  // to land the buyer's abort BEFORE any byte reaches the wire.
  const gates = []
  app.post('/slow', (req, res) => {
    services.push({ route: '/slow', at: Date.now() })
    const gate = { open: false }
    gates.push(gate)
    const wait = setInterval(() => {
      if (gate.open) {
        clearInterval(wait)
        res.json({ answer: `slow-${services.length}` })
      }
    }, 10)
  })

  return { app, services, gates }
}
