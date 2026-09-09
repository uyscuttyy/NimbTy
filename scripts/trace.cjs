const rpc = (m, p) => fetch("https://rpc.testnet.nimiqwatch.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((r) => r.json()).then((j) => j.result?.data ?? j.result);
(async () => {
  for (const a of ["NQ11 3LDC R80J 040V X5EN K777 KB4R VF6Y VKA0", "NQ96 11JX YDT0 QXMT 6CBH 0P1M K0X9 3BCD FXN3", "NQ22 RGTC 990Y YB0N 7SH0 NNDC QART ES7M QYPP"]) {
    const acct = await rpc("getAccountByAddress", [a]);
    const txs = await rpc("getTransactionsByAddress", [a, 5, null]);
    console.log(a.slice(0, 9), "balance:", acct?.balance, "recent txs:", (txs || []).length);
  }
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
