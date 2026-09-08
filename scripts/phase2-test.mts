import { addressFromPublicKeyHex, sameAddress, signPayout } from "../lib/nimiq/keys";
import { NimiqRpc, nimToLuna } from "../lib/nimiq/rpc";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const N = require("@nimiq/core");

async function main() {
  const kp = N.KeyPair.generate();
  const addr = kp.toAddress().toUserFriendlyAddress();
  const bound = addressFromPublicKeyHex(kp.publicKey.toHex());
  console.log("binding ok:", sameAddress(bound, addr), "|", bound);

  const rpc = new NimiqRpc("https://rpc.nimiqwatch.com");
  const head = await rpc.getBlockNumber();
  console.log("mainnet head:", head);
  const txs = await rpc.call<any[]>("getTransactionsByBlockNumber", [head - 3]);
  console.log("block txs:", txs.length, "| keys:", txs.length ? Object.keys(txs[0]).join(",") : "none");
  if (txs.length) {
    const t = txs[0];
    console.log("from:", t.sender ?? t.from, "| to:", t.recipient ?? t.to, "| value:", t.value, "| block:", t.blockNumber, "| data:", JSON.stringify(t.data ?? null)?.slice(0, 80));
    const one = await rpc.getTransactionByHash(t.hash);
    console.log("byHash ok:", !!one && (one as { hash: string }).hash === t.hash);
  }

  const worker = N.KeyPair.generate().toAddress().toUserFriendlyAddress();
  const s = signPayout({
    escrowPrivateKeyHex: kp.privateKey.toHex(), toAddress: worker,
    valueLuna: nimToLuna("5"), feeLuna: 500n,
    validityStartHeight: 100, networkId: 5, memo: "nimbty:abc123",
  });
  const tx = N.Transaction.deserialize(Buffer.from(s.rawHex, "hex"));
  console.log("payout hash match:", tx.hash() === s.txHash, "| value:", tx.value.toString());
  try { tx.verify(2, 5); console.log("verify(2,5): VALID (no throw)"); }
  catch (e) { console.log("verify(2,5) threw:", (e as Error).message); }
  try { tx.verify(2, 999); console.log("verify(2,999): NO THROW (bad)"); }
  catch (e) { console.log("verify(2,999) threw as expected"); }

  // 4) verifyTransaction against the REAL mainnet tx found on-chain
  const { paymentService } = await import("../lib/nimiq/keys").then(() => import("../lib/payments/nimbty-nimiq.service"));
  const realHash = "6d1229f4fa6e6d1b7c93fd74a3be524b61a51910a1328437c0eebd572ccd0426";
  const mkReq = (payTo: string, amount: string, memo: string) => ({
    bountyId: "x", publicId: "unused" as string, payTo, amount, currency: "NIM" as const,
    memo, expiresAt: new Date().toISOString(),
  });
  const good = await paymentService.verifyTransaction({ request: mkReq("NQ09 ET4R BJ71 ABPM MKKE 4G7R PC08 DP0H YPQ7", "0.86017", "You mined NIM"), txHash: realHash });
  console.log("real-tx verify (expect true):", good.verified, "| sender:", good.sender.slice(0, 14) + "...", "| block:", good.blockHeight);
  const bad = await paymentService.verifyTransaction({ request: mkReq("NQ09 ET4R BJ71 ABPM MKKE 4G7R PC08 DP0H YPQ7", "999", "nimbty:nope"), txHash: realHash });
  console.log("wrong-amount verify (expect false):", bad.verified);
  const missing = await paymentService.verifyTransaction({ request: mkReq("NQ09 ET4R BJ71 ABPM MKKE 4G7R PC08 DP0H YPQ7", "0.86017", "x"), txHash: "00".repeat(32) });
  console.log("unknown-hash verify (expect false):", missing.verified);
}
main().catch((e) => { console.error("TESTFAIL:", e); process.exit(1); });
