const raw = (m, p) => fetch('https://rpc.testnet.nimiqwatch.com', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) }).then((r) => r.json());
(async () => {
  const A = 'NQ55 ALPN 1214 108X UPK0 BBBE 4U94 BK96 FS38';
  const r = await raw('getTransactionsByAddress', [A, 25, null]);
  if (r.error) { console.log('ERR:', JSON.stringify(r.error).slice(0, 200)); return; }
  const txs = r.result?.data ?? r.result ?? [];
  console.log('tx count:', txs.length);
  for (const t of txs.slice(0, 5)) console.log('-', (t.from ?? t.sender), '->', (t.to ?? t.recipient), (t.value ?? t.amount), 'block', t.blockNumber);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
