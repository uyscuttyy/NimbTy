# NimbTy — Project Plan

## Audit (Phase 0, 08-SEP-26) — DONE
Stack: Next.js 15 App Router + TS, Postgres + Prisma (11 models + reviewNote), Tailwind v3, HMAC httpOnly sessions.

## Phases
- Phase 0 scaffold audit — DONE
- Phase 1 foundation (build green, DB migrated, /api/auth/session) — DONE
- Phase 2 wallet + Nimiq payments — DONE · verified vs live mainnet chain:
  key binding, real-tx verify true/false/unknown, offline payout sign+verify
- Phase 3 bounties (create/list/detail/fund/claim) — DONE · 7 API checks pass
- Phase 4 worker submission + protected deliverables — DONE · 28-check suite
- Phase 5 creator review + timers + auto-settlement cron — DONE · suite + live FUNDING_EXPIRED firing
- Phase 6 disputes + arbiter resolution — DONE · suite
- Phase 7 reputation/levels/streaks + profile/work/mine — DONE · real numbers verified
- Phase 8 sharing (/n/, ShareButtons) + funding-tx autodetect — DONE
- Phase 9 frontend (home/explore/post/detail/work/me/submit, BottomNav, states, a11y) — DONE · build 18/18, pages 200
- Phase 10 real testnet verification — BLOCKED (see below)

## Verification log
- `npm run build` green (18/18). Suites: scripts/phase2-test.mts, phase3-test.cjs, phase47-test.cjs — all PASS.
- Live mainnet RPC reads; funding-expiry + payout-retry behavior observed on dev server.

## Live testnet proof (09-SEP-26, TestAlbatross via rpc.testnet.nimiqwatch.com)
- B1 (5 NIM happy path): fund tx c3e4e7e4 @10974220 → OPEN → claim → submit → approve → PAID → escrow paid worker exactly 5.00 NIM. FULL LOOP PROVEN.
- B2 (3 NIM dispute): fund tx 42a08f6e @10975733 → claim → submit → dispute → arbiter WORKER_WINS → WORKER_PAID → worker +3.00 NIM.
- B3 (2 NIM review-expiry): funded @10975788, submitted, creator silent — auto-settle pending (~11:13Z).
- Worker profile: completed 2, earned 8, approval 67%, streak 1 — all from chain-backed rows.
- Escrow fee float: payouts cost fee-on-top, so escrow needs a float (12 NIM seeded from creator).
  Execution-time guard added: payouts refuse unless bounty funding verifies on-chain (a stale dev
  job paid 3 testnet NIM to a throwaway address before the guard — testnet-only, my oversight).
- Nimiq Pay insight: Pay wallets route through HTLC contracts; sender binding uses relatedAddresses
  fallback with memo as the binder (matchesFunding + 8 unit tests).
