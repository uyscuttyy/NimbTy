const raw = (m, p) => fetch("https://rpc.testnet.nimiqwatch.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((r) => r.json());
(async () => {
  const h = (await raw("getBlockNumber", [])).result?.data;
  const b = ((await raw("getBlockByNumber", [h, false])).result?.data);
  console.log("ts:", b?.timestamp, "=", new Date(b?.timestamp).toISOString());
  for (const t of [1790126846799, 1790131598044]) console.log("htlc timeout:", new Date(t).toISOString().slice(0, 10), t > (b?.timestamp ?? 0) ? "LOCKED" : "RECLAIMABLE");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
