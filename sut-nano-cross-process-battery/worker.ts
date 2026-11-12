// Argus cross-process battery worker — role-driven, one OS process per role.
// SUT: agent-passport-system/agent-passport-gateway @ 99888e8 (PR #14).
// Frozen rows (issue x402-foundation/x402#4198, comment 6817874244, amended 6831739390):
//   R1 same key + same payment, two processes racing; R2a pre-existing key + changed request;
//   R2b fresh key + different amount/recipient; R3 different keys, same wallet, first unfinished;
//   R4 retry after publication across processes. Invariant: reservation count == 1 in R1,
//   no budget underflow or double-reserve in any row.
// No network: the fake Nano node mirrors the vendor's own test harness
// (test/payment-rails/nano-publish.test.ts). Deterministic scheduling via file barriers.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
// @ts-ignore nanocurrency-web has no type declarations
import nanoWebImport from 'nanocurrency-web'
import { initDB, getDB } from '../src/db/schema.js'
import { initGatewayIdentity } from '../src/gateway/identity.js'
import { initializeWalletFrontier } from '../src/payment-rails/wallet-frontier.js'
import { stateBlockHash } from '../src/payment-rails/nano-block.js'
import {
  reserveSend, takeOver, getOp, WalletOpError,
} from '../src/payment-rails/wallet-ops.js'
import type { Claim, SendRequest, WalletOp } from '../src/payment-rails/wallet-ops.js'
import { commitAttempt, publishAttempt, prepareOp } from '../src/payment-rails/nano-publish.js'
import type { NanoNode } from '../src/payment-rails/nano-publish.js'

const nano = (nanoWebImport as any).default || nanoWebImport
const role = process.argv[2]
const work = process.argv[3]
const params = JSON.parse(readFileSync(process.argv[4], 'utf8')) as any
const dir = (p: string) => join(work, p)

// ── Fake node, verbatim semantics of the vendor harness (nano-publish.test.ts) ──
const FRONTIER = 'F47B23107E5F34B2CE06F562B5C435DF72A533251CB414C51B2B62A8F63A00E4'
const node: NanoNode = {
  async call(body: any) {
    const rec: any = { role, action: body.action }
    if (body.action === 'account_info') rec.account = body.account
    if (body.action === 'process') { rec.subtype = body.subtype; rec.block = body.block }
    appendFileSync(dir('nodelog.jsonl'), JSON.stringify(rec) + '\n')
    if (body.action === 'account_info')
      return { frontier: FRONTIER, confirmed_frontier: FRONTIER, confirmed_balance: '50000', confirmed_representative: body.account }
    if (body.action === 'work_generate') return { work: '0123456789abcdef' }
    if (body.action === 'process') return { hash: stateBlockHash(body.block) }
    throw new Error(`unexpected action ${body.action}`)
  },
}

// ── Barriers: arrival marker, then poll for a release file (go / go-<role>) ──
function arrive(bar: string) { mkdirSync(dir(`bar/${bar}`), { recursive: true }); writeFileSync(dir(`bar/${bar}/${role}.arrived`), '1') }
async function waitGo(bar: string) {
  for (;;) {
    if (existsSync(dir(`bar/${bar}/go`)) || existsSync(dir(`bar/${bar}/go-${role}`))) return
    await sleep(4)
  }
}
function stepdone(n: number | string) { mkdirSync(dir('stepdone'), { recursive: true }); writeFileSync(dir(`stepdone/${n}-${role}`), '1') }

const LEASE = 30_000
const at = (owner: string, now: number): Claim => ({ owner, now, leaseMs: LEASE })

// ── Vendor test-harness fixtures, mirrored (pilot caps, frontier, two-hop chain) ──
process.env.NANO_PILOT_MAX_PAYMENT_RAW = '1000000000000000000000000000000000'
process.env.NANO_PILOT_MAX_WALLET_RAW = '1000000000000000000000000000000000'
process.env.NANO_PILOT_MAX_PAYMENTS = '100000'
process.env.NANO_WALLET_SEND_ENABLED = '1'
delete process.env.NANO_WALLETS_PAUSED

const TENANT = 'tnt_argus_battery'
const DEST = nano.wallet.fromLegacySeed('dd'.repeat(32)).accounts[0]
let n = 0

function agent(id: string) {
  getDB().prepare(`INSERT INTO agents (id, tenant_id, agent_id, public_key, status, is_root) VALUES (?, ?, ?, 'pk', 'active', 0)`).run(`row-${id}`, TENANT, id)
}
function del(parent: string, child: string, limit: string, parentDel: string | null): string {
  const id = `del-${++n}`
  getDB().prepare(`INSERT INTO delegations (id, tenant_id, parent_agent_id, child_agent_id, scope, status, spend_limit, spend_used, parent_delegation_id, spend_unit, spend_limit_minor, spend_used_minor) VALUES (?, ?, ?, ?, 'commerce:send', 'active', 0, 0, ?, 'nano:XNO:raw', ?, '0')`).run(id, TENANT, parent, child, parentDel, limit)
  return id
}

/** Bootstrap per trial: root→p→c two-hop chain, a wallet on a fresh account, recorded frontier. */
function bootstrap(): any {
  const t = ++n, root = `root-${t}`, p = `p-${t}`, c = `c-${t}`
  agent(root); agent(p); agent(c)
  const top = del(root, p, '5000', null)
  const low = del(p, c, '3000', top)
  const acct = nano.wallet.fromLegacySeed((0x2000 + t).toString(16).padStart(64, '0')).accounts[0]
  const walletId = `w-${t}`
  getDB().prepare(`INSERT INTO agent_wallets (id, tenant_id, agent_id, nano_address, wallet_index, status) VALUES (?, ?, ?, ?, ?, 'active')`).run(walletId, TENANT, c, acct.address, 10_000 + t)
  initializeWalletFrontier(getDB(), { walletId, frontier: FRONTIER, balanceRaw: '50000', by: 'battery', evidence: 'fixture', now: 0, replace: false })
  return { root, p, c, top, low, acct, walletId }
}

/** Run reserveSend and shape the outcome for the result file. */
function tryReserve(r: SendRequest, claim: Claim): any {
  try {
    const out: any = reserveSend(getDB(), r, claim)
    if ('op' in out) return { kind: out.replay ? 'replay' : 'reserved', opId: out.op.id, replay: out.replay, status: out.op.status }
    return { kind: 'refused', refused: out.refused }
  } catch (e: any) {
    if (e instanceof WalletOpError) return { kind: 'error', code: e.code, message: e.message }
    return { kind: 'throw', message: String(e?.message ?? e) }
  }
}

const result: any = { role, row: params.row, trial: params.trial, steps: [] }
mkdirSync(dir('out'), { recursive: true })

// ── Role: setup — bootstrap the shared world (and the R2a pre-existing operation) ──
if (role === 'setup') {
  initDB(params.dbFile)
  initGatewayIdentity()
  getDB().prepare(`INSERT OR IGNORE INTO tenants (id, name, email) VALUES (?, ?, ?)`).run(TENANT, 'ArgusBattery', 'ab@test.local')
  const s = bootstrap()
  let preOp: any = null
  if (params.preOp) {
    const out: any = reserveSend(getDB(), {
      tenantId: TENANT, idempotencyKey: params.key, fromAgentId: s.c, walletId: s.walletId,
      nanoAccount: s.acct.address, delegationId: s.low, toAddress: DEST.address, amountRaw: '1000',
    }, at('setup', 0))
    if (!('op' in out)) throw new Error('setup pre-op failed: ' + JSON.stringify(out))
    preOp = out.op
  }
  const row = preOp ? getDB().prepare(`SELECT * FROM wallet_ops WHERE id = ?`).get(preOp.id) : null
  writeFileSync(dir('out/result-setup.json'), JSON.stringify({
    role: 'setup', c: s.c, wallet: s.acct.address, walletId: s.walletId, low: s.low, top: s.top,
    preOpId: preOp ? preOp.id : null, preOpRow: row,
  }, null, 2))
  stepdone('setup')
  process.exit(0)
}

// ── Roles A/B — the two racing processes ──
initDB(params.dbFile)
const world = JSON.parse(readFileSync(dir('out/result-setup.json'), 'utf8'))

/** The wallet account is bootstrap seed account no. params.trialNum; re-derived locally. */
function worldKey(): string {
  const t = Number(params.trialNum)
  const acct = nano.wallet.fromLegacySeed((0x2000 + t).toString(16).padStart(64, '0')).accounts[0]
  if (acct.address !== world.wallet) throw new Error('signer address mismatch vs setup wallet')
  return acct.privateKey
}

const r = (over: Partial<SendRequest> = {}): SendRequest => ({
  tenantId: TENANT, idempotencyKey: params.key, fromAgentId: world.c,
  walletId: world.walletId, nanoAccount: world.wallet, delegationId: world.low,
  toAddress: DEST.address, amountRaw: '1000', ...over,
} as SendRequest)

arrive('0')
await waitGo('0')

const over: any = {}
if (params.over) Object.assign(over, params.over)
const res = tryReserve(r(over), at(role, 0))
result.reserve = res
stepdone(0)

if ((params.row === 'R1' || params.row === 'R4') && res.kind === 'reserved') {
  // Winner continues: prepare (the one signature), commit, publish. The loser exits on replay.
  // In R4 this is process A building the original publication that B will retry against.
  const op = getOp(getDB(), res.opId) as WalletOp
  const signer = { address: world.wallet, privateKey: worldKey() }
  const prepared = await prepareOp(getDB(), node, op, at(role, 0), signer, DEST.address)
  stepdone(1)
  const commit: any = commitAttempt(getDB(), prepared, at(role, 1))
  if (!('token' in commit)) throw new Error('R1 winner commit refused: ' + JSON.stringify(commit))
  const pub: any = await publishAttempt(getDB(), node, commit.token, () => 2)
  result.publish = pub
  stepdone(2)
}

if (params.row === 'R4' && res.kind === 'replay') {
  // Cross-process retry after publication (role B only): reserve must replay the original
  // operation; prepareOp (the only signing path) is never called — asserted via the node log
  // too; then takeover of the expired lease, one more commit + publish of the SAME stored block.
  // Role A (res.kind === 'reserved') built the original publication above and stops here.
  if (res.kind !== 'replay') throw new Error(`R4 retry expected replay, got ${JSON.stringify(res)}`)
  const replayedOp = getOp(getDB(), res.opId) as WalletOp
  result.blockJsonBefore = replayedOp.block_json
  const taken = takeOver(getDB(), replayedOp.id, at(role, 60_000))
  if (!taken) throw new Error('R4 takeOver failed')
  const commit: any = commitAttempt(getDB(), taken, at(role, 60_001))
  if (!('token' in commit)) throw new Error('R4 retry commit refused: ' + JSON.stringify(commit))
  const pub: any = await publishAttempt(getDB(), node, commit.token, () => 60_002)
  result.publish = pub
  const after = getOp(getDB(), res.opId) as WalletOp
  result.blockJsonAfter = after.block_json
  result.attemptCount = after.attempt_count
}

writeFileSync(dir(`out/result-${role}.json`), JSON.stringify(result, null, 2))
process.exit(0)
