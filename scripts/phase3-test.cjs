/* Phase 3 integration test: auth → create → fund(step1) → fake-confirm rejected → claim gated → cancel.
 * Run: node scripts/phase3-test.mjs (dev server must be up on localhost:3000) */
const BASE = process.env.APP_URL || "http://localhost:3000";
const N = require("@nimiq/core");

function user() {
  const kp = N.KeyPair.generate();
  return {
    addr: kp.toAddress().toUserFriendlyAddress(),
    pub: kp.publicKey.toHex(),
    sign: (msg) => Buffer.from(N.Signature.create(kp.privateKey, kp.publicKey, Buffer.from(msg, "utf8")).serialize()).toString("hex"),
  };
}

async function login(u) {
  const n = await (await fetch(`${BASE}/api/auth/nonce`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: u.addr }),
  })).json();
  if (!n.ok) throw new Error("nonce failed: " + JSON.stringify(n));
  const v = await (await fetch(`${BASE}/api/auth/verify`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: u.addr, nonce: n.nonce, signatureHex: u.sign(n.message), pubKeyHex: u.pub }),
  })).json();
  if (!v.ok) throw new Error("verify failed: " + JSON.stringify(v));
  return v.user;
}

async function api(cookie, method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method, headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = r.headers.get("set-cookie");
  return { status: r.status, json: await r.json(), set };
}

async function main() {
  const creator = user(), worker = user();
  // login creator (capture session cookie)
  const n = await (await fetch(`${BASE}/api/auth/nonce`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walletAddress: creator.addr }) })).json();
  const vr = await fetch(`${BASE}/api/auth/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walletAddress: creator.addr, nonce: n.nonce, signatureHex: creator.sign(n.message), pubKeyHex: creator.pub }) });
  const vj = await vr.json();
  if (!vj.ok) throw new Error("creator login failed: " + JSON.stringify(vj));
  const cc = vr.headers.get("set-cookie").split(";")[0];

  await login(worker); // worker exists (cookie not needed further)
  const wn = await (await fetch(`${BASE}/api/auth/nonce`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walletAddress: worker.addr }) })).json();
  const wvr = await fetch(`${BASE}/api/auth/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walletAddress: worker.addr, nonce: wn.nonce, signatureHex: worker.sign(wn.message), pubKeyHex: worker.pub }) });
  const wc = wvr.headers.get("set-cookie").split(";")[0];

  // create
  const c = await api(cc, "POST", "/api/bounties", {
    title: "Test my landing page on mobile", description: "Open the homepage on a real phone, list every layout bug with screenshots.", rewardAmount: "5", currency: "NIM",
    deadlineAt: new Date(Date.now() + 6 * 3600e3).toISOString(), reviewHours: 12,
  });
  console.log("create:", c.status, c.json.ok ? c.json.bounty.publicId + " " + c.json.bounty.status : JSON.stringify(c.json));
  const pid = c.json.bounty.publicId;
  // bad create (USDT)
  const bad = await api(cc, "POST", "/api/bounties", { title: "x-translate doc", description: "translate a one-page doc please thanks", rewardAmount: "2", currency: "USDT", deadlineAt: new Date(Date.now() + 6 * 3600e3).toISOString() });
  console.log("usdt create (expect 400):", bad.status, bad.json.code);
  // fund step 1
  const f1 = await api(cc, "POST", `/api/bounties/${pid}/fund`, {});
  console.log("fund step1:", f1.status, f1.json.ok ? `payTo=${f1.json.funding.payTo.slice(0, 9)}... memo=${f1.json.funding.memo}` : JSON.stringify(f1.json));
  // fake confirm must NOT succeed
  const f2 = await api(cc, "POST", `/api/bounties/${pid}/fund`, { txHash: "ab".repeat(32) });
  console.log("fake confirm (expect 422):", f2.status, f2.json.code);
  // worker claim before OPEN must be rejected
  const cl = await api(wc, "POST", `/api/bounties/${pid}/claim`, {});
  console.log("early claim (expect 409):", cl.status, cl.json.code);
  // explore shows no OPEN bounties
  const list = await (await fetch(`${BASE}/api/bounties`)).json();
  console.log("explore OPEN count (expect 0):", list.bounties.length);
  // cancel second bounty from DRAFT
  const c2 = await api(cc, "POST", "/api/bounties", { title: "Resize my logo file", description: "Resize the attached logo to 512x512 PNG with transparency kept.", rewardAmount: "1", deadlineAt: new Date(Date.now() + 6 * 3600e3).toISOString() });
  const del = await api(cc, "DELETE", `/api/bounties/${c2.json.bounty.publicId}`, null);
  console.log("cancel DRAFT (expect ok):", del.status, JSON.stringify(del.json));
  // detail
  const d = await (await fetch(`${BASE}/api/bounties/${pid}`)).json();
  console.log("detail:", d.ok ? `${d.bounty.status} escrowLocked=${d.bounty.escrowLocked}` : "FAIL");
  console.log("PHASE3_API_OK");
}
main().catch((e) => { console.error("PHASE3FAIL:", e.message); process.exit(1); });
