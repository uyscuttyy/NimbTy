# NimBty — Memory (implementation decisions)

- 08-SEP-26: Build was red (SessionProvider duplicate `walletAddress` key; zod missing from deps; env.ts cast). Fixed; build green. Lesson: scaffold compiled ≠ scaffold verified.
- 08-SEP-26: No `/api/auth/session` route existed though SessionProvider fetched it. Added.
- Escrow decision: Nimiq L1 exposes protocol contracts (staking) but no general VM for escrow logic → custodial testnet escrow account + PaymentService abstraction; only release/refund impls change when contracts land. Server can move funds BUT only from validated transitions; every move = Payment + SettlementJob row.
- Auth honesty gap: Phase-1 signature proves Ed25519 key control; address↔pubkey binding (Address.fromPublicKey) lands in Phase 2 via pure-TS noble libs (no heavy SDK).
- Settlement: outbox table + cron endpoint; idempotent via status-guarded updateMany; never setTimeout.
- Protected deliverables: served only through status-checking endpoint; released on PAID/WORKER_PAID, never on CREATOR_REFUNDED. Frontend hiding ≠ security.
- Live-data rule: every displayed number derives from DB/payment state. Seed data isolated + labeled + removable.
- @nimiq/core 2.21 findings (verified empirically): Address.fromPublicKeys ignores input (returns constant);
  use Blake2b-256(pubkey)[:20] instead. KeyPair.toAddress() correct. tx.sign needs KeyPair (not PrivateKey).
  tx.hash() returns hex string directly. tx.verify(protocol_version, network_id) returns void, throws on invalid.
- Public RPC (rpc.nimiqwatch.com) tx shape uses from/to/senderData/recipientData, NOT sender/recipient/data;
  normalizeTransaction covers both. Unknown hash → RPC "Internal error", handled as not-found.
- No public TESTNET RPC exists (probed 6 candidates). Testnet = operator node via NIMIQ_RPC_URL.
- Vercel Cron sends GET + Bearer CRON_SECRET automatically; route accepts GET+POST, header or ?secret=.
- Dev-server note: never pipe `npm run dev` through `head` (SIGPIPE kills it); redirect to a log file.
