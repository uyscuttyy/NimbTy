const rpc = (m, p) => fetch("https://rpc.testnet.nimiqwatch.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((r) => r.json()).then((j) => j.result?.data ?? j.result);
(async () => {
  for (const a of ["NQ11 3LDC R80J 040V X5EN K777 KB4R VF6Y VKA0", "NQ96 11JX YDT0 QXMT 6CBH 0P1M K0X9 3BCD FXN3"]) {
    console.log(a.slice(0, 9), JSON.stringify(await rpc("getAccountByAddress", [a])));
  }
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
