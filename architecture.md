# NimBty — Architecture (as implemented)

Next.js 15 App Router + TS · Postgres + Prisma (11 models) · Tailwind v3 (Fredoka + Nunito Sans)
Auth: wallet-signed challenge → HMAC httpOnly session. No passwords, no keys stored.

## Authority map
- State machine (`lib/bounty/state-machine.ts`) is the ONLY transition map. Routes derive intent,
  never accept status from clients. `tryTransition` = optimistic `updateMany` (race-safe claims/reviews).
- Timers derive from DB (`deadlineAt`, `reviewDeadlineAt`). Cron judges expiry server-side.
- Money moves ONLY as `SettlementJob` rows created inside validated transitions; executor is idempotent.
- Protected deliverables served only via `/api/submissions/[id]/deliverable`, gated on PAID/WORKER_PAID.

## Nimiq integration (real, verified)
- `lib/nimiq/rpc.ts`: JSON-RPC client. Testnet: https://rpc.testnet.nimiqwatch.com
  (verified live); mainnet defaults to public rpc.nimiqwatch.com. Override via NIMIQ_RPC_URL.
  Nodes want 3 params for address/block lookups. Handles both node-style
  (`sender/recipient/data`) and proxy-style (`from/to/senderData`) tx shapes.
- `lib/nimiq/keys.ts`: address↔pubkey binding (Blake2b-256[:20], verified vs SDK),
  IBAN checksum, offline payout signing. Network IDs from core-rs source: TestAlbatross=5, MainAlbatross=24.
  Note: `Address.fromPublicKeys` in @nimiq/core 2.21 ignores input — never use it.
- `PaymentService`: verifyTransaction (recipient + Luna + memo + inclusion; autodetect via
  findFundingTransaction), releaseToWorker/refundCreator (local sign + sendRawTransaction).
  Nimiq Pay pays out of HTLC contracts: sender binding = direct match then relatedAddresses
  fallback (`txInvolvesWallet`), memo is the real binder, contract creations/refunds excluded
  (`matchesFunding` + 8-case unit test). Unverifiable = PENDING forever.
  USDT rail refuses honestly (no silent conversion).
- Auth binding enforced in verify route (dev bypass only via ALLOW_UNVERIFIED_WALLET_LOGIN).

## Escrow (honest limitation, spec §34)
Custodial testnet account: Nimiq L1 has no general VM for escrow contracts. Server can move funds
BUT only from validated transitions; every move = Payment + SettlementJob row. Migration path:
only PaymentService release/refund impls change when contracts land.

## Settlement
Outbox + cron (`/api/cron/settle`, GET+POST, CRON_SECRET Bearer or ?secret=, vercel.json every 5 min).
Kinds: REVIEW_EXPIRED → auto-pay worker; PAYOUT → broadcast signed tx w/ backoff (10 tries);
FUNDING_EXPIRED → FUNDING→DRAFT; deadline sweep → EXPIRED_REFUNDED + creator refund.
Atomic job claim (QUEUED→PROCESSING) prevents double execution across runners.

## Frontend
Server data only. Home hero + live bounties, explore (search/sort), post→FundPanel
(pay anywhere + memo, server autodetects tx), /n/[id] role-based detail, SubmitForm,
ReviewPanel (approve/revision/dispute), work/me dashboards, ShareButtons, BottomNav (mobile).
USDT creation rejected; uploads endpoint 503s honestly until blob provider wired.

## Disputes / reputation
Human arbiter (ARBITER_KEY). WORKER_WINS→WORKER_PAID (deliverable unlocks);
CREATOR_WINS→refund (deliverable STAYS locked). Reputation/streak/levels all derived from rows.
