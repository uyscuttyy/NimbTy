const rpc = (m, p) => fetch("https://rpc.testnet.nimiqwatch.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((r) => r.json()).then((j) => j.result?.data ?? j.result);
const LUNA = 100000n;
(async () => {
  const addrs = {
    wallet1: "NQ55 ALPN 1214 108X UPK0 BBBE 4U94 BK96 FS38",
    wallet2: "NQ64 EA58 4N13 TDG3 B9LL 9QTH S3BU AJ34 FXJY",
    wallet3: "NQ05 F2AR XJ0T JLR1 U505 NXJF CUVU YXLH ES5D",
    escrow: "NQ59 H7FY C7MQ 7401 K8A2 LUGA 51B9 562B ETG9",
    worker: "NQ59 JTPJ NC9X UYV6 VX5K VU1R 8SBV 7MNL DEYM",
    htlc1: "NQ96 11JX YDT0 QXMT 6CBH 0P1M K0X9 3BCD FXN3",
    htlc2: "NQ22 RGTC 990Y YB0N 7SH0 NNDC QART ES7M QYPP",
    htlc3: "NQ11 3LDC R80J 040V X5EN K777 KB4R VF6Y VKA0",
  };
  for (const [name, a] of Object.entries(addrs)) {
    const acct = await rpc("getAccountByAddress", [a]);
    const nim = acct && acct.balance != null ? (BigInt(acct.balance) * 100n / LUNA).toString().replace(/(\d\d)$/, ".$1") : "?";
    console.log(name.padEnd(8), (acct?.type ?? "?").padEnd(6), "balance:", nim, "NIM");
  }
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
