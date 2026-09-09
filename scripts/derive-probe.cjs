const fs = require("fs");
const { pbkdf2Sync } = require("node:crypto");
const N = require("@nimiq/core");
const TARGET = "NQ05F2ARXJ0TJLR1U505NXJFCUVUYXLHES5D";
const env = {};
for (const line of fs.readFileSync("/home/uyscutty/projects/NimbTy/.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)="(.*)"\s*$/);
  if (m) env[m[1]] = m[2];
}
const mnemonic = (env.CREATOR_MNEMONIC || "").trim();
const seed = pbkdf2Sync(Buffer.from(mnemonic.normalize("NFKD"), "utf8"), Buffer.from("mnemonic", "utf8"), 2048, 64, "sha512");
const rpc = (m, p) => fetch("https://rpc.testnet.nimiqwatch.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((r) => r.json()).then((j) => j.result?.data ?? j.result);
(async () => {
  const xpk = N.ExtendedPrivateKey.derivePathFromSeed("m/44'/242'/0'/0'", seed);
  const addr = xpk.toAddress().toUserFriendlyAddress().replace(/\s+/g, "");
  console.log("derived:", addr, addr === TARGET ? "*** MATCH ***" : "*** MISMATCH ***");
  const A = "NQ05 F2AR XJ0T JLR1 U505 NXJF CUVU YXLH ES5D";
  console.log("account:", JSON.stringify(await rpc("getAccountByAddress", [A])));
  const txs = await rpc("getTransactionsByAddress", [A, 10, null]);
  console.log("tx count:", (txs || []).length);
  for (const t of (txs || []).slice(0, 4)) console.log("-", (t.from ?? t.sender), "->", (t.to ?? t.recipient), t.value, "block", t.blockNumber);
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
