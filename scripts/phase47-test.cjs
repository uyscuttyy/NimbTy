/* Phases 4-7 integration: submit → revision → approve → cron → dispute → resolve → profile.
 * The ONLY simulated step is chain funding (DB-level OPEN + CONFIRMED payment),
 * standing in for the fund-confirm already proven against live chain in Phase 2. */
const BASE = "http://localhost:3000";
const fs = require("fs");
const N = require("@nimiq/core");

const env = {};
for (const line of fs.readFileSync("/home/uyscutty/projects/NimbTy/.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?\s*(#.*)?$/);
  if (m) env[m[1]] = m[2];
}
process.env.DATABASE_URL = env.DATABASE_URL;
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function user() {
  const kp = N.KeyPair.generate();
  return {
    addr: kp.toAddress().toUserFriendlyAddress(),
    pub: kp.publicKey.toHex(),
    sign: (msg) => Buffer.from(N.Signature.create(kp.privateKey, kp.publicKey, Buffer.from(msg, "utf8")).serialize()).toString("hex"),
  };
}
async function login(u) {
  const n = await (await fetch(`${BASE}/api/auth/nonce`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walletAddress: u.addr }) })).json();
  const r = await fetch(`${BASE}/api/auth/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walletAddress: u.addr, nonce: n.nonce, signatureHex: u.sign(n.message), pubKeyHex: u.pub }) });
  const j = await r.json();
  if (!j.ok) throw new Error("login failed: " + JSON.stringify(j));
  return { user: j.user, cookie: r.headers.get("set-cookie").split(";")[0] };
}
async function api(cookie, method, path, body, headers = {}) {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json() };
}
async function harnessOpen(publicId) {
  const b = await prisma.bounty.findUnique({ where: { publicId } });
  await prisma.payment.create({ data: { bountyId: b.id, kind: "ESCROW_FUNDING", sender: "harness", recipient: "harness", amount: b.rewardAmount, currency: b.currency, status: "CONFIRMED", transactionHash: "harness-tx", confirmedAt: new Date() } });
  await prisma.bounty.update({ where: { id: b.id }, data: { status: "OPEN", fundedAt: new Date(), fundingTxHash: "harness-tx" } });
}
const results = [];
function check(name, cond, extra = "") { results.push([cond ? "PASS" : "FAIL", name, extra]); }

async function main() {
  const c = await login(user()), w = await login(user()), stranger = await login(user());

  // ── bounty 1: full approve path ──
  let r = await api(c.cookie, "POST", "/api/bounties", { title: "Review my whitepaper draft", description: "Read the 5-page draft and leave line-by-line comments in a shared doc.", rewardAmount: "7", deadlineAt: new Date(Date.now() + 8 * 3600e3).toISOString() });
  const pid = r.json.bounty.publicId;
  await harnessOpen(pid);
  r = await api(w.cookie, "POST", `/api/bounties/${pid}/claim`, {});
  check("claim", r.status === 201, r.status + " " + (r.json.claim?.id ?? r.json.code));
  const claimId = r.json.claim?.id;
  r = await api(w.cookie, "POST", `/api/bounties/${pid}/claim`, {});
  check("double claim rejected", r.status === 409);
  r = await api(c.cookie, "POST", `/api/bounties/${pid}/claim`, {});
  check("self claim rejected", r.json.code === "SELF_CLAIM");

  r = await api(w.cookie, "POST", `/api/bounties/${pid}/submit`, { summary: "x" });
  check("empty summary rejected", r.status === 400);
  r = await api(w.cookie, "POST", `/api/bounties/${pid}/submit`, {
    summary: "Reviewed all 5 pages, left 23 comments in the shared doc.",
    proofItems: [{ type: "LINK", url: "https://example.com/review-doc", label: "commented doc" }],
    finalDeliverable: [{ type: "LINK", url: "https://example.com/final-pdf", label: "annotated PDF" }],
  });
  check("submit", r.status === 201, r.status + " " + (r.json.submission?.id ?? r.json.code));
  const subId = r.json.submission?.id;
  const jobs = await prisma.settlementJob.findMany({ where: { bountyId: (await prisma.bounty.findUnique({ where: { publicId: pid } })).id, kind: "REVIEW_EXPIRED", status: "QUEUED" } });
  check("review-expiry job queued", jobs.length === 1);

  r = await api(c.cookie, "GET", `/api/submissions/${subId}`, null);
  check("creator reads submission", r.status === 200 && r.json.submission.hasFinalDeliverable === true);
  r = await api(stranger.cookie, "GET", `/api/submissions/${subId}`, null);
  check("stranger blocked", r.status === 403);
  r = await api(c.cookie, "GET", `/api/submissions/${subId}/deliverable`, null);
  check("deliverable locked pre-pay", r.json.code === "DELIVERABLE_LOCKED");

  r = await api(c.cookie, "POST", `/api/bounties/${pid}/revision`, {});
  check("revision needs reason", r.json.code === "REASON_REQUIRED");
  r = await api(c.cookie, "POST", `/api/bounties/${pid}/revision`, { reason: "Please also check the references section." });
  check("revision requested", r.status === 200 && r.json.status === "REVISION_REQUESTED");
  r = await api(w.cookie, "GET", "/api/work", null);
  check("work dashboard revision", r.json.work[0]?.latestSubmission?.status === "REVISION_REQUESTED");

  r = await api(w.cookie, "POST", `/api/bounties/${pid}/submit`, {
    summary: "Checked references too, 6 more comments added.",
    proofItems: [{ type: "TEXT", text: "All sections reviewed, screenshots attached in doc." }],
  });
  check("resubmit", r.status === 201);
  r = await api(c.cookie, "POST", `/api/bounties/${pid}/approve`, {});
  check("approve", r.status === 200 && r.json.settlement === "QUEUED", r.status + " " + JSON.stringify(r.json).slice(0, 80));
  const payoutJob = await prisma.settlementJob.findFirst({ where: { kind: "PAYOUT", status: "QUEUED" }, orderBy: { createdAt: "desc" } });
  check("payout job queued", !!payoutJob);
  r = await api(c.cookie, "GET", `/api/submissions/${subId}/deliverable`, null);
  check("deliverable unlocked on PAID", r.status === 200);

  // cron: wrong secret, then real (payout stays QUEUED w/o RPC — honest retry)
  r = await api(null, "POST", "/api/cron/settle", {}, { Authorization: "Bearer wrong" });
  check("cron rejects bad secret", r.status === 401);
  r = await api(null, "POST", "/api/cron/settle", {}, { Authorization: `Bearer ${env.CRON_SECRET}` });
  check("cron runs", r.status === 200, JSON.stringify(r.json.processed));
  const pj = await prisma.settlementJob.findUnique({ where: { id: payoutJob.id } });
  check("payout retries w/o RPC (no fake pay)", pj.status === "QUEUED" && !!pj.lastError, pj.status + " " + (pj.lastError ?? "").slice(0, 60));
  const pay = await prisma.payment.findFirst({ where: { bountyId: (await prisma.bounty.findUnique({ where: { publicId: pid } })).id, kind: "WORKER_PAYOUT" } });
  check("payout still PENDING", pay.status === "PENDING");

  // ── bounty 2: dispute path ──
  r = await api(c.cookie, "POST", "/api/bounties", { title: "Translate my tagline to French", description: "Translate the tagline and provide two alternatives with tone notes.", rewardAmount: "3", deadlineAt: new Date(Date.now() + 8 * 3600e3).toISOString() });
  const pid2 = r.json.bounty.publicId;
  await harnessOpen(pid2);
  await api(w.cookie, "POST", `/api/bounties/${pid2}/claim`, {});
  await api(w.cookie, "POST", `/api/bounties/${pid2}/submit`, { summary: "Translated, two alternatives provided.", proofItems: [{ type: "TEXT", text: "Petites tâches. Vraies récompenses." }] });
  r = await api(c.cookie, "POST", `/api/bounties/${pid2}/dispute`, { reason: "x" });
  check("dispute needs reason", r.json.code === "REASON_REQUIRED");
  r = await api(c.cookie, "POST", `/api/bounties/${pid2}/dispute`, { reason: "Only one alternative given, tone notes missing." });
  check("dispute opened", r.status === 201, r.status + " " + (r.json.dispute?.id ?? r.json.code));
  const did = r.json.dispute?.id;
  r = await api(null, "POST", `/api/disputes/${did}/resolve`, { resolution: "WORKER_WINS" }, { "x-arbiter-key": "wrong" });
  check("resolve rejects bad key", r.status === 403);
  r = await api(null, "POST", `/api/disputes/${did}/resolve`, { resolution: "WORKER_WINS", note: "Work matches the brief." }, { "x-arbiter-key": env.ARBITER_KEY });
  check("worker wins", r.status === 200 && r.json.status === "WORKER_PAID", r.status + " " + JSON.stringify(r.json).slice(0, 80));

  // ── reputation / dashboards ──
  r = await api(w.cookie, "GET", "/api/profile", null);
  check("profile real numbers", r.json.profile?.worker?.completed === 2 && Number(r.json.profile?.worker?.earned) === 10, JSON.stringify(r.json.profile?.worker));
  check("streak counted", r.json.profile?.streak?.current >= 1, JSON.stringify(r.json.profile?.streak));
  check("level derived", r.json.profile?.level?.name === "Newbie", r.json.profile?.level?.name);
  r = await api(c.cookie, "GET", "/api/bounties?scope=mine", null);
  check("creator dashboard", r.json.bounties?.length >= 2, String(r.json.bounties?.length));

  console.log(results.map(([s, n, x]) => `${s} ${n}${x ? " — " + x : ""}`).join("\n"));
  if (results.some(([s]) => s === "FAIL")) process.exit(1);
  console.log("PHASE47_API_OK");
}
main().catch((e) => { console.error("PHASE47FAIL:", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
