// fiangshi census probe — observation only, no judgment.
// Usage (inside the fiangshi clone at the pinned commit, after `npm ci`):
//   FIANGSHI_NOW=2026-11-24T14:00:00Z npx tsx argus-fiangshi-probe.ts <out.json> <receipts_dir>
// Outputs: bands, served_at, verbatim payee rows for the two pinned sellers, pin lookup
// (chain, pos, verifyReceipt), chain-walk verdicts, and the raw receipt objects.
import('./src/census.ts').then(async m => {
  const fs = await import('node:fs');
  const path = process.argv[2] || 'probe_out.json';
  const rdir = process.argv[3] || 'receipts';
  const { verifyReceipt, verifyChain } = await import('./src/core/receipt.ts');

  const c = m.loadCensus();
  const SELLERS = ['api.cleave.fi/x402/gas', 'api.bitrefill.com/x402/gift-cards/search'];
  const PINS: Record<string, string> = {
    R1_cleave: 'd2c68884841332834a1e0b203e2175c5e1e92de5d279344bd6504db6b5bf4ce0',
    R2_bitrefill_20nov: '97b5dded4c5cff75d5b26377b659ef40c7620c45cf143fac27910fb8b1af7691',
    R3_bitrefill_24nov: '83d618ba5344776c16fd8b159ad7d6c177838db2057b7cad2c993c8a6a076819',
  };

  const out: any = {
    FIANGSHI_NOW: process.env.FIANGSHI_NOW || 'real_clock',
    served_at: c.served_at,
    stale_limit_hours: c.stale_limit_hours,
    bands: c.bands,
    payee_rows: c.payees.filter((p: any) => SELLERS.some(s => (p.url || '').includes(s))),
  };

  const chains = c.chains || [];
  const all: any[] = [];
  chains.forEach((ch: any, i: number) => { if (Array.isArray(ch)) ch.forEach((r: any) => all.push({ r, i })); });
  fs.mkdirSync(rdir, { recursive: true });
  out.pins = {};
  for (const [k, id] of Object.entries(PINS)) {
    const hit = all.find(x => x.r.receipt_hash === id);
    if (!hit) { out.pins[k] = { found: false }; continue; }
    const r = hit.r;
    const ch = chains[hit.i];
    const pos = ch.findIndex((x: any) => x.receipt_hash === id);
    const vc = verifyChain(ch);
    fs.writeFileSync(`${rdir}/${id}.json`, JSON.stringify(r, null, 2));
    out.pins[k] = {
      found: true, chain: hit.i, pos, chain_len: ch.length,
      verify_receipt: verifyReceipt(r),
      prev_ok: pos > 0 ? ch[pos - 1].receipt_hash === r.prev_hash : 'genesis',
      next_ok: pos < ch.length - 1 ? ch[pos + 1].prev_hash === id : 'head',
      chain_walk_ok: vc.ok, chain_walk_errors: vc.errors.slice(0, 5),
      prev_hash: r.prev_hash, band: r.band, as_of: r.as_of ?? null, url: r.url,
    };
  }
  out.chain_walk_all = chains.map((ch: any, i: number) => ({ chain: i, len: ch.length, ok: verifyChain(ch).ok }));
  fs.writeFileSync(path, JSON.stringify(out, null, 1));
  console.log(`probe done: NOW=${out.FIANGSHI_NOW} bands=${JSON.stringify(c.bands)} pins=${Object.entries(out.pins).map(([k, v]: any) => `${k}:${v.found}`).join(' ')}`);
});
