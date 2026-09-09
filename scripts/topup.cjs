// One-off escrow fee-float top-up (plain transfer, no memo — never matches funding).
const fs = require("fs");
const { pbkdf2Sync } = require("node:crypto");
const N = require("@nimiq/core");
const RPCU = "https://rpc.testnet.nimiqwatch.com";
const env = {};
for (const line of fs.readFileSync("/home/uyscutty/projects/NimbTy/.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)="(.*)"\s*$/);
  if (m) env[m[1]] = m[2];
}
const seed = pbkdf2Sync(Buffer.from(env.CREATOR_MNEMONIC.trim().normalize("NFKD"), "utf8"), Buffer.from("mnemonic", "utf8"), 2048, 64, "sha512");
const cxpk = N.ExtendedPrivateKey.derivePathFromSeed("m/44'/242'/0'/0'", seed);
const rpc = (m, p) => fetch(RPCU, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((r) => r.json()).then((j) => { if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 160)); return j.result?.data ?? j.result; });
(async () => {
  const from = cxpk.toAddress();
  const head = await rpc("getBlockNumber", []);
  const perByte = await rpc("getMinFeePerByte", []).catch(() => 1);
  const tx = N.TransactionBuilder.newBasicWithData(from, N.Address.fromUserFriendlyAddress("NQ59 H7FY C7MQ 7401 K8A2 LUGA 51B9 562B ETG9"), new Uint8Array(0), 1200000n, BigInt(Math.max(138, perByte * 300)), head, 5);
  const kp = N.KeyPair.derive(cxpk.privateKey);
  kp.signTransaction(tx);
  console.log("topup hash:", await rpc("sendRawTransaction", [tx.toHex()]));
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
