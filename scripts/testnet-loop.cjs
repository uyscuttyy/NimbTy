/* REAL testnet end-to-end (TestAlbatross): creator real keys → escrow → worker.
 * B1 (5 NIM): post → fund → claim → submit → approve → payout → verify balances.
 * B2 (3 NIM): + dispute → arbiter WORKER_WINS → payout.
 * B3 (2 NIM): + 1h review expiry → cron auto-settle (run with arg "3" after ~1h).
 * Usage: node scripts/testnet-loop.cjs [1|2|3]
 * NEVER prints mnemonics or private keys.
 */
const fs = require("fs");
const { pbkdf2Sync } = require("node:crypto");
const N = require("@nimiq/core");

const BASE = "http://localhost:3000";
const RPCU = "https://rpc.testnet.nimiqwatch.com";
const ESCROW = "NQ59 H7FY C7MQ 7401 K8A2 LUGA 51B9 562B ETG9";
const WHICH = process.argv[2] || "1";

const env = {};
for (const line of fs.readFileSync("/home/uyscutty/projects/NimbTy/.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)="(.*)"\s*$/);
  if (m) env[m[1]] = m[2];
}

// creator: real mnemonic-derived key
const seed = pbkdf2Sync(Buffer.from(env.CREATOR_MNEMONIC.trim().normalize("NFKD"), "utf8"), Buffer.from("mnemonic", "utf8"), 2048, 64, "sha512");
const cxpk = N.ExtendedPrivateKey.derivePathFromSeed("m/44'/242'/0'/0'", seed);
const cPriv = cxpk.privateKey;
const cPub = N.PublicKey.derive(cPriv);
const cPubHex = cPub.toHex();
const cAddr = cxpk.toAddress().toUserFriendlyAddress();
// worker: local test key
const wPriv = N.PrivateKey.fromHex(env.TEST_WORKER_PRIVKEY);
const wPub = N.PublicKey.derive(wPriv);
const wPubHex = wPub.toHex();
const wAddr = env.TEST_WORKER_ADDRESS;

const sign = (priv, pub, msg) => Buffer.from(N.Signature.create(priv, pub, Buffer.from(msg, "utf8")).serialize()).toString("hex");

async function rpc(method, params) {
  const r = await fetch(RPCU, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error("RPC " + method + ": " + JSON.stringify(j.error).slice(0, 160));
  return j.result?.data ?? j.result;
}
async function balance(addr) {
  const a = await rpc("getAccountByAddress", [addr]);
  return a?.balance != null ? BigInt(a.balance) : 0n;
}
async function login(addr, pubHex, priv) {
  const n = await (await fetch(`${BASE}/api/auth/nonce`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walletAddress: addr }) })).json();
  if (!n.ok) throw new Error("nonce: " + JSON.stringify(n));
  const r = await fetch(`${BASE}/api/auth/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walletAddress: addr, nonce: n.nonce, signatureHex: sign(priv, N.PublicKey.fromHex(pubHex), n.message), pubKeyHex: pubHex }) });
  const j = await r.json();
  if (!j.ok) throw new Error("login: " + JSON.stringify(j));
  return r.headers.get("set-cookie").split(";")[0];
}
async function api(cookie, method, path, body, headers = {}) {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json() };
}
async function sendTx(fromKp, fromAddr, toAddr, luna, memo) {
  const head = await rpc("getBlockNumber", []);
  const perByte = await rpc("getMinFeePerByte", []).catch(() => 1);
  const fee = BigInt(Math.max(138, perByte * 300));
  const sender = N.Address.fromUserFriendlyAddress(fromAddr);
  const recipient = N.Address.fromUserFriendlyAddress(toAddr);
  const tx = N.TransactionBuilder.newBasicWithData(sender, recipient, new Uint8Array(Buffer.from(memo, "utf8")), luna, fee, head, 5);
  const kp = N.KeyPair.derive(fromKp);
  kp.signTransaction(tx);
  const hash = await rpc("sendRawTransaction", [tx.toHex()]);
  return { hash, fee };
}
async function waitIncluded(hash, tries = 24) {
  for (let i = 0; i < tries; i++) {
    const tx = await rpc("getTransactionByHash", [hash]).catch(() => null);
    const t = tx ? (tx.hash ? tx : null) : null;
    const norm = t ? { block: t.blockNumber ?? null } : { block: null };
    if (norm.block !== null) return norm.block;
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("tx not included in time: " + hash);
}

const PLANS = {
  1: { reward: "5", title: "Test my landing page on mobile", desc: "Open the homepage on a real phone. List every layout bug with a screenshot link.", review: 12 },
  2: { reward: "3", title: "Translate my tagline to French", desc: "Translate the tagline, give two alternatives with tone notes.", review: 12 },
  3: { reward: "2", title: "Summarize this thread in 5 bullets", desc: "Read the linked thread and post a 5-bullet summary as proof.", review: 1 },
};

async function main() {
  const plan = PLANS[WHICH];
  if (!plan) throw new Error("arg must be 1|2|3");
  console.log("=== B" + WHICH, plan.reward, "NIM ===");
  console.log("creator:", cAddr, "| worker:", wAddr);
  const c0 = await balance(cAddr), e0 = await balance(ESCROW), w0 = await balance(wAddr);
  console.log("start balances — creator:", c0.toString(), "escrow:", e0.toString(), "worker:", w0.toString());

  const cc = await login(cAddr, cPubHex, cPriv);
  console.log("creator login (strict): ok");
  const wc = await login(wAddr, wPubHex, wPriv);
  console.log("worker login (strict): ok");

  let r = await api(cc, "POST", "/api/bounties", {
    title: plan.title, description: plan.desc, rewardAmount: plan.reward,
    deadlineAt: new Date(Date.now() + 6 * 3600e3).toISOString(), reviewHours: plan.review,
  });
  if (!r.json.ok) throw new Error("create: " + JSON.stringify(r.json));
  const pid = r.json.bounty.publicId;
  console.log("bounty:", pid, "DRAFT");

  r = await api(cc, "POST", `/api/bounties/${pid}/fund`, {});
  if (!r.json.ok) throw new Error("fund step1: " + JSON.stringify(r.json));
  const memo = r.json.funding.memo;
  console.log("funding window:", memo, "->", r.json.funding.payTo.slice(0, 12) + "...");

  const { hash: fundHash } = await sendTx(cPriv, cAddr, ESCROW, BigInt(plan.reward) * 100000n, memo);
  console.log("funding tx broadcast:", fundHash);
  const fundBlock = await waitIncluded(fundHash);
  console.log("funding included @", fundBlock);

  r = await api(cc, "POST", `/api/bounties/${pid}/fund`, { txHash: fundHash });
  if (!r.json.ok || !r.json.live) throw new Error("fund confirm: " + JSON.stringify(r.json));
  console.log("BOUNTY LIVE:", r.json.bounty.status);

  r = await api(wc, "POST", `/api/bounties/${pid}/claim`, {});
  if (!r.json.ok) throw new Error("claim: " + JSON.stringify(r.json));
  console.log("claimed by worker");

  r = await api(wc, "POST", `/api/bounties/${pid}/submit`, {
    summary: WHICH === "1" ? "Tested on a real phone, 4 layout bugs with screenshots in the doc." : WHICH === "2" ? "Translated, two alternatives with tone notes." : "Read the thread, 5-bullet summary below.",
    proofItems: [{ type: "LINK", url: "https://example.com/testnet-proof-b" + WHICH, label: "proof doc" }],
    finalDeliverable: [{ type: "TEXT", text: "Final deliverable payload for bounty " + pid }],
  });
  if (!r.json.ok) throw new Error("submit: " + JSON.stringify(r.json));
  const subId = r.json.submission.id;
  console.log("submitted:", subId, "| review until:", r.json.submission.reviewDeadlineAt);

  if (WHICH === "1") {
    r = await api(cc, "POST", `/api/bounties/${pid}/approve`, {});
    if (!r.json.ok) throw new Error("approve: " + JSON.stringify(r.json));
    console.log("approved, payout queued");
  } else if (WHICH === "2") {
    r = await api(cc, "POST", `/api/bounties/${pid}/dispute`, { reason: "Automated testnet dispute: tone notes missing from the translation." });
    if (!r.json.ok) throw new Error("dispute: " + JSON.stringify(r.json));
    console.log("disputed:", r.json.dispute.id);
    r = await api(null, "POST", `/api/disputes/${r.json.dispute.id}/resolve`, { resolution: "WORKER_WINS", note: "Testnet run: work matched the brief." }, { "x-arbiter-key": env.ARBITER_KEY });
    if (!r.json.ok) throw new Error("resolve: " + JSON.stringify(r.json));
    console.log("resolved:", r.json.status);
  } else {
    console.log("B3 submitted — review expires in ~1h, cron will auto-settle. Done for now.");
    return;
  }

  r = await api(null, "POST", "/api/cron/settle", {}, { Authorization: `Bearer ${env.CRON_SECRET}` });
  if (!r.json.ok) throw new Error("cron: " + JSON.stringify(r.json));
  console.log("cron:", JSON.stringify(r.json.processed));

  const bounty = await (await fetch(`${BASE}/api/bounties/${pid}`)).json();
  const payHash = bounty.bounty?.fundingTxHash;
  console.log("bounty status:", bounty.bounty?.status);
  void payHash;

  const c1 = await balance(cAddr), e1 = await balance(ESCROW), w1 = await balance(wAddr);
  console.log("end balances — creator:", c1.toString(), "escrow:", e1.toString(), "worker:", w1.toString());
  console.log("worker earned (luna):", (w1 - w0).toString());
  if (w1 - w0 < BigInt(plan.reward) * 100000n) throw new Error("WORKER NOT PAID IN FULL");
  console.log("TESTNET_LOOP_B" + WHICH + "_OK");
}
main().catch((e) => { console.error("LOOPFAIL:", e.message); process.exit(1); });
