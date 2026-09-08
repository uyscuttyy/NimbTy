# NimBty — Project Plan

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

## Blockers
- Phase 10 needs, on testnet: (1) a reachable JSON-RPC node (no public one exists — operator runs `nimiq-client`),
  (2) funded testnet wallets (escrow + creator + worker via the testnet faucet), (3) a human demo run.
  None are obtainable headlessly from here. Server code paths are chain-proven on mainnet reads.
