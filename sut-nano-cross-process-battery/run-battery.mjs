// Argus cross-process battery — parent orchestrator.
// SUT: agent-passport-system/agent-passport-gateway @ 99888e8 (PR #14, Nano lifecycle).
// Two independent OS processes per trial, one file-backed SQLite (WAL), file barriers.
// Frozen rows R1/R2a/R2b/R3/R4 + invariant, per the pre-registration and the R2 amendment.
// Run from the SUT clone root:  node battery-argus/run-battery.mjs [--smoke]
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
import Database from 'better-sqlite3'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const nanoWeb = require('nanocurrency-web')
const nano = nanoWeb.default || nanoWeb
const DEST2 = nano.wallet.fromLegacySeed('ee'.repeat(32)).accounts[0].address

const ROOT = process.cwd()
const SMOKE = process.argv.includes('--smoke')
const OUT = SMOKE ? join(ROOT, 'battery-argus', 'smoke') : join(ROOT, 'battery-argus', 'run')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const log = (m) => console.log(m)
const lines = []
function record(obj) { lines.push(JSON.stringify(obj)); }

// ── trial definitions: mode 'A'/'B' = sequenced (that role's reserve commits first); 'sim' = simultaneous ──
const trials = SMOKE ? [
  { id: 'SMOKE-1', row: 'SMOKE', mode: 'sim', preOp: false, key: 'smoke-key', overA: {}, overB: {} },
] : [
  // R1 — same key, same payment, two processes racing
  { id: 'R1-1', row: 'R1', mode: 'A', preOp: false, key: 'k-r1', overA: {}, overB: {} },
  { id: 'R1-2', row: 'R1', mode: 'B', preOp: false, key: 'k-r1', overA: {}, overB: {} },
  { id: 'R1-3', row: 'R1', mode: 'sim', preOp: false, key: 'k-r1', overA: {}, overB: {} },
  // R2a — key already exists, two processes race with a changed request
  { id: 'R2a-1', row: 'R2a', mode: 'sim', preOp: true, key: 'k-r2a', overA: { amountRaw: '2000' }, overB: { toAddress: DEST2 } },
  { id: 'R2a-2', row: 'R2a', mode: 'sim', preOp: true, key: 'k-r2a', overA: { toAddress: DEST2 }, overB: { amountRaw: '2000' } },
  // R2b — key new, two processes race with different amounts
  { id: 'R2b-1', row: 'R2b', mode: 'A', preOp: false, key: 'k-r2b', overA: { amountRaw: '1000' }, overB: { amountRaw: '2000' } },
  { id: 'R2b-2', row: 'R2b', mode: 'B', preOp: false, key: 'k-r2b', overA: { amountRaw: '1000' }, overB: { amountRaw: '2000' } },
  { id: 'R2b-3', row: 'R2b', mode: 'sim', preOp: false, key: 'k-r2b', overA: { amountRaw: '1000' }, overB: { amountRaw: '2000' } },
  // R3 — different keys, same wallet, first payment unfinished
  { id: 'R3-1', row: 'R3', mode: 'A', preOp: false, key: 'k-r3-a', overA: {}, overB: {}, keyB: 'k-r3-b' },
  { id: 'R3-2', row: 'R3', mode: 'B', preOp: false, key: 'k-r3-a', overA: {}, overB: {}, keyB: 'k-r3-b' },
  { id: 'R3-3', row: 'R3', mode: 'sim', preOp: false, key: 'k-r3-a', overA: {}, overB: {}, keyB: 'k-r3-b' },
  // R4 — retry after publication, across processes (fully sequenced by parent)
  { id: 'R4-1', row: 'R4', mode: 'R4', preOp: false, key: 'k-r4', overA: {}, overB: {} },
]

function spawnWorker(role, work, params) {
  const paramsFile = join(work, `params-${role}.json`)
  writeFileSync(paramsFile, JSON.stringify(params))
  const child = spawn('node_modules/.bin/tsx', ['battery-argus/worker.ts', role, work, paramsFile], { cwd: ROOT })
  return child
}

async function waitFile(path, timeoutMs = 30000) {
  const t0 = Date.now()
  while (!existsSync(path)) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for ${path}`)
    await sleep(5)
  }
}

async function runTrial(def) {
  const work = join(OUT, def.id)
  mkdirSync(work, { recursive: true })
  const dbFile = join(work, 'gateway.db')
  const base = {
    row: def.row, trial: def.id, trialNum: 1, key: def.key, preOp: !!def.preOp,
    smoke: def.id.startsWith('SMOKE'), dbFile,
  }
  // setup process: fresh world (+ pre-existing op for R2a)
  const setup = spawnWorker('setup', work, base)
  await waitFile(join(work, 'stepdone', 'setup-setup'))
  const setupExit = new Promise((res) => setup.on('exit', res))
  if ((await setupExit) !== 0) throw new Error(`${def.id}: setup worker failed`)

  const pA = { ...base, over: def.overA }
  const pB = { ...base, over: def.overB }
  if (def.keyB) pB.key = def.keyB

  const A = spawnWorker('A', work, pA)
  const B = spawnWorker('B', work, pB)
  const exits = [Promise.all([new Promise((r) => A.on('exit', r)), new Promise((r) => B.on('exit', r))])]

  // both arrive at the start barrier
  await waitFile(join(work, 'bar', '0', 'A.arrived'))
  await waitFile(join(work, 'bar', '0', 'B.arrived'))
  await sleep(20) // let both settle into the polling loop

  if (def.mode === 'sim') {
    writeFileSync(join(work, 'bar', '0', 'go'), '1')
  } else if (def.mode === 'A') {
    writeFileSync(join(work, 'bar', '0', 'go-A'), '1')
    await waitFile(join(work, 'stepdone', '0-A'))
    writeFileSync(join(work, 'bar', '0', 'go-B'), '1')
  } else if (def.mode === 'B') {
    writeFileSync(join(work, 'bar', '0', 'go-B'), '1')
    await waitFile(join(work, 'stepdone', '0-B'))
    writeFileSync(join(work, 'bar', '0', 'go-A'), '1')
  } else if (def.mode === 'R4') {
    // fully sequenced: A reserves, prepares (the one signature), commits, publishes;
    // only then is B released for the cross-process retry
    writeFileSync(join(work, 'bar', '0', 'go-A'), '1')
    await waitFile(join(work, 'stepdone', '0-A'))
    await waitFile(join(work, 'stepdone', '1-A'))
    await waitFile(join(work, 'stepdone', '2-A'))
    writeFileSync(join(work, 'bar', '0', 'go-B'), '1')
  }

  const [ea, eb] = await Promise.race([
    exits[0],
    sleep(30000).then(() => { A.kill('SIGKILL'); B.kill('SIGKILL'); return [-9, -9] }),
  ])
  const rA = existsSync(join(work, 'out', 'result-A.json')) ? JSON.parse(readFileSync(join(work, 'out', 'result-A.json'), 'utf8')) : null
  const rB = existsSync(join(work, 'out', 'result-B.json')) ? JSON.parse(readFileSync(join(work, 'out', 'result-B.json'), 'utf8')) : null

  // direct database observations (workers gone, safe to open)
  const db = new Database(dbFile, { readonly: true })
  const ops = db.prepare('SELECT * FROM wallet_ops ORDER BY id').all()
  const reservations = db.prepare('SELECT * FROM wallet_op_reservations ORDER BY op_id, delegation_id').all()
  const resDistinct = new Set(reservations.map((r) => r.op_id)).size
  const attempts = db.prepare('SELECT * FROM wallet_op_attempts ORDER BY op_id, attempt_no').all()
  const delegations = db.prepare('SELECT id, spend_limit_minor, spend_used_minor FROM delegations ORDER BY id').all()
  const world = JSON.parse(readFileSync(join(work, 'out', 'result-setup.json'), 'utf8'))
  db.close()

  const nodelog = existsSync(join(work, 'nodelog.jsonl'))
    ? readFileSync(join(work, 'nodelog.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : []

  return { def, ea, eb, rA, rB, world, ops, reservations, resDistinct, attempts, delegations, nodelog }
}

const canon = (v) => JSON.stringify(v, (k, x) => (k === undefined ? x : x), 0, null)

function verdictsFor(t) {
  const checks = []
  const add = (id, ok, detail) => checks.push({ id, ok, detail: String(detail) })
  const { def, rA, rB, ops, reservations, resDistinct, delegations, nodelog, world, attempts } = t
  if (!rA || !rB) return [{ id: 'results-present', ok: false, detail: 'missing worker result files' }]
  const low = delegations.find((d) => d.id === world.low)
  const top = delegations.find((d) => d.id === world.top)
  const spendNow = (d) => `${d.id}: used=${d.spend_used_minor} limit=${d.spend_limit_minor}`

  const bothExited = t.ea === 0 && t.eb === 0
  add('process-exit', bothExited, `A=${t.ea} B=${t.eb}`)

  if (def.row === 'SMOKE') {
    const win = [rA, rB].find((x) => x.reserve && x.reserve.kind === 'reserved')
    const lose = [rA, rB].find((x) => x.reserve && x.reserve.kind === 'replay')
    add('smoke-one-reserved-one-replayed', !!win && !!lose, `A=${rA.reserve.kind} B=${rB.reserve.kind}`)
    add('smoke-ops-eq-1', ops.length === 1 && reservations.length === 1, `ops=${ops.length} reservations=${reservations.length}`)
    return checks
  }

  if (def.row === 'R1') {
    const win = [rA, rB].find((x) => x.reserve.kind === 'reserved')
    const lose = [rA, rB].find((x) => x.reserve.kind === 'replay')
    add('one-reservation-wins', !!win && !!lose && (def.mode === 'sim' ? true : (def.mode === 'A' ? win.role === 'A' : win.role === 'B')),
      `winner=${win ? win.role : 'none'} loser=${lose ? lose.role : 'none'} mode=${def.mode}`)
    add('loser-observes-original', !!lose && lose.reserve.opId === (win ? win.reserve.opId : null) && lose.reserve.replay === true,
      `loser opId=${lose ? lose.reserve.opId : 'n/a'} winner opId=${win ? win.reserve.opId : 'n/a'}`)
    add('no-error-on-either', [rA, rB].every((x) => !x.reserve.code && !x.reserve.refused && !x.reserve.message),
      `A=${rA.reserve.kind} B=${rB.reserve.kind}`)
    add('reservations-eq-1', resDistinct === 1, `distinct reserved ops=${resDistinct} (hold rows=${reservations.length})`)
    add('ops-eq-1', ops.length === 1, `wallet_ops rows=${ops.length}`)
    const spent = low.spend_used_minor === '1000' && top.spend_used_minor === '1000'
    add('budget-decremented-once', spent, `low ${spendNow(low)} | top ${spendNow(top)}`)
    add('winner-published-once', !!win && win.publish && win.publish.outcome === 'accepted', `publish=${win && win.publish ? win.publish.outcome : 'n/a'}`)
    const proc = nodelog.filter((c) => c.action === 'process')
    add('one-process-call', proc.length === 1, `process calls=${proc.length}`)
    add('one-signature', nodelog.filter((c) => c.action === 'work_generate').length === 1
      && nodelog.filter((c) => c.action === 'account_info').length === 1,
      `node calls=${nodelog.map((c) => c.action).join(',')}`)
    if (proc.length === 1 && ops.length === 1) {
      add('block-matches-stored', canon(proc[0].block) === canon(JSON.parse(ops[0].block_json)), 'process block vs stored block_json')
    }
  }

  if (def.row === 'R2a') {
    add('409-both', rA.reserve.kind === 'error' && rA.reserve.code === 'idempotency_mismatch'
      && rB.reserve.kind === 'error' && rB.reserve.code === 'idempotency_mismatch',
      `A=${rA.reserve.code} B=${rB.reserve.code}`)
    add('zero-new-reservations', resDistinct === 1 && ops.length === 1
      && ops[0].id === world.preOpId && reservations.every((r) => r.op_id === world.preOpId),
      `distinct reserved ops=${resDistinct} ops=${ops.length} preOp=${world.preOpId}`)
    add('stored-op-byte-identical', canon(world.preOpRow) === canon(ops[0]),
      'pre-race row snapshot vs post-race row')
    add('budget-untouched', low.spend_used_minor === '1000' && top.spend_used_minor === '1000',
      `low ${spendNow(low)} | top ${spendNow(top)}`)
    add('no-node-calls', nodelog.length === 0, `node calls=${nodelog.length}`)
  }

  if (def.row === 'R2b') {
    const win = [rA, rB].find((x) => x.reserve.kind === 'reserved')
    const lose = [rA, rB].find((x) => x.reserve.kind === 'error')
    add('exactly-one-reservation', !!win && !!lose && lose.reserve.code === 'idempotency_mismatch',
      `winner=${win ? win.role : 'none'} loser=${lose ? lose.role + ':' + lose.reserve.code : 'none'} mode=${def.mode}`)
    if (def.mode !== 'sim') {
      add('sequenced-winner-matches-mode', !!win && win.role === def.mode,
        `mode=${def.mode} winner=${win ? win.role : 'none'}`)
    }
    const winAmount = win && win.role === 'A' ? '1000' : '2000'
    add('ops-eq-1', ops.length === 1, `wallet_ops rows=${ops.length}`)
    add('reservations-eq-1', resDistinct === 1, `distinct reserved ops=${resDistinct} (hold rows=${reservations.length})`)
    add('budget-by-winner-only', low.spend_used_minor === winAmount && top.spend_used_minor === winAmount,
      `low ${spendNow(low)} | top ${spendNow(top)} expected=${winAmount}`)
  }

  if (def.row === 'R3') {
    const win = [rA, rB].find((x) => x.reserve.kind === 'reserved')
    const lose = [rA, rB].find((x) => x.reserve.kind === 'error')
    add('second-refused', !!win && !!lose && lose.reserve.code === 'wallet_busy',
      `winner=${win ? win.role : 'none'} refused=${lose ? lose.role + ':' + lose.reserve.code : 'none'}`)
    add('one-op-only', ops.length === 1 && resDistinct === 1, `ops=${ops.length} distinct reserved ops=${resDistinct}`)
    add('first-unfinished', ops.length === 1 && ops[0].status === 'reserved', `op status=${ops.length === 1 ? ops[0].status : 'n/a'}`)
    add('neither-signs', nodelog.length === 0, `node calls=${nodelog.map((c) => c.action).join(',')}`)
    add('budget-decremented-once', low.spend_used_minor === '1000' && top.spend_used_minor === '1000',
      `low ${spendNow(low)} | top ${spendNow(top)}`)
  }

  if (def.row === 'R4') {
    const a = rA, b = rB
    add('a-reserved', a.reserve.kind === 'reserved' && a.publish && a.publish.outcome === 'accepted',
      `A reserve=${a.reserve.kind} publish=${a.publish ? a.publish.outcome : 'n/a'}`)
    add('b-replays-original', b.reserve.kind === 'replay' && b.reserve.opId === a.reserve.opId,
      `B reserve=${b.reserve.kind} opId match=${b.reserve.opId === a.reserve.opId}`)
    add('b-no-new-signature', b.publish && b.publish.outcome === 'accepted'
      && b.blockJsonBefore === b.blockJsonAfter && b.attemptCount === 2,
      `blockJson unchanged=${b.blockJsonBefore === b.blockJsonAfter} attempts=${b.attemptCount}`)
    const bActions = nodelog.filter((c) => c.role === 'B').map((c) => c.action)
    add('b-node-actions-process-only', bActions.length === 1 && bActions[0] === 'process',
      `B node actions=${bActions.join(',')}`)
    const proc = nodelog.filter((c) => c.action === 'process')
    add('two-process-calls', proc.length === 2, `process calls=${proc.length}`)
    if (proc.length === 2) {
      add('same-stored-block-republished', canon(proc[0].block) === canon(proc[1].block),
        'block#1 vs block#2 canonical JSON')
    }
    add('db-block-matches', ops.length === 1 && canon(JSON.parse(ops[0].block_json)) === canon(proc[0] ? proc[0].block : null),
      'stored block_json vs process call')
    add('attempts-recorded', attempts.length === 2 && attempts.every((x) => x.outcome === 'accepted'),
      `attempts=${attempts.map((x) => x.attempt_no + ':' + x.outcome).join(',')}`)
    add('one-op-one-reservation', ops.length === 1 && resDistinct === 1,
      `ops=${ops.length} distinct reserved ops=${resDistinct}`)
    add('budget-decremented-once', low.spend_used_minor === '1000' && top.spend_used_minor === '1000',
      `low ${spendNow(low)} | top ${spendNow(top)}`)
  }

  // invariant row: applies to every trial
  if (def.row !== 'SMOKE') {
    add('inv-no-underflow', Number(low.spend_used_minor) <= Number(low.spend_limit_minor)
      && Number(top.spend_used_minor) <= Number(top.spend_limit_minor),
      `low ${spendNow(low)} | top ${spendNow(top)}`)
  }

  return checks
}

// ── main ──
const summary = []
const verdictsAll = []
for (const def of trials) {
  const t = await runTrial(def)
  record({ trial: def.id, row: def.row, mode: def.mode, ea: t.ea, eb: t.eb,
    rA: t.rA && t.rA.reserve, rB: t.rB && t.rB.reserve,
    ops: t.ops.length, reservations: t.reservations.length, resDistinct: t.resDistinct,
    delegations: t.delegations.map((d) => [d.id, d.spend_used_minor]),
    nodelog: t.nodelog.map((c) => c.role + ':' + c.action) })
  const checks = verdictsFor(t)
  const pass = checks.every((c) => c.ok)
  verdictsAll.push({ trial: def.id, row: def.row, mode: def.mode, pass, checks })
  summary.push(`${pass ? 'PASS' : 'FAIL'} ${def.id} (${def.row}, mode=${def.mode})`)
  log(`${pass ? 'PASS' : 'FAIL'} ${def.id} (${def.row}, mode=${def.mode})`)
  for (const c of checks.filter((c) => !c.ok)) log(`      ✗ ${c.id}: ${c.detail}`)
}

if (!SMOKE) {
  const invRes = verdictsAll.filter((v) => v.row === 'R1')
  addInvariant(invRes, verdictsAll)
}
function addInvariant(invRes2, all) {
  const r1ok = invRes2.every((v) => v.pass && v.checks.find((c) => c.id === 'reservations-eq-1')?.ok)
  const noUnderflow = all.every((v) => v.checks.find((c) => c.id === 'inv-no-underflow')?.ok)
  const noDouble = all.every((v) => {
    const b = v.checks.find((c) => c.id === 'budget-decremented-once' || c.id === 'budget-by-winner-only' || c.id === 'budget-untouched')
    return !b || b.ok
  })
  verdictsAll.push({ trial: 'INVARIANT', row: 'INV', pass: r1ok && noUnderflow && noDouble,
    checks: [
      { id: 'reservation-count-eq-1-in-R1', ok: r1ok, detail: 'across all R1 trials' },
      { id: 'no-budget-underflow', ok: noUnderflow, detail: 'spend_used_minor <= spend_limit_minor everywhere' },
      { id: 'no-double-reserve', ok: noDouble, detail: 'budget decremented exactly once in every row' },
    ] })
}

const totalPass = verdictsAll.filter((v) => v.pass).length
writeFileSync(join(OUT, 'verdicts.jsonl'), verdictsAll.map((v) => JSON.stringify(v)).join('\n') + '\n')
writeFileSync(join(OUT, 'log.jsonl'), lines.join('\n') + '\n')
const md = ['# argus battery — agent-passport-gateway @ 99888e8 (cross-process)', '',
  `Trials: ${verdictsAll.length}, PASS: ${totalPass}, FAIL: ${verdictsAll.length - totalPass}`, '', '```', ...summary, '```', ''].join('\n')
writeFileSync(join(OUT, 'verdicts.md'), md)
log(`\n${trials.length} trials + invariant: PASS ${totalPass}/${verdictsAll.length} rows`)
process.exit(totalPass === verdictsAll.length ? 0 : 1)
