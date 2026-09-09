# NimbTy — Handoff

## What works (verified)
- `npm run build` green (Next 15, fixed SessionProvider, added zod).
- Postgres migrated (`npx prisma migrate status` → up to date). Schema: 11 models.
- Wallet auth: nonce → sign → httpOnly session. State machine + PaymentService interface.

## What remains
Phases 2–10 (see project-plan.md). All bounty/worker/review/dispute/reputation/share APIs + pages are stubs.

## Run it
1. `npm install`
2. Postgres: `docker run -d --name nimbTy-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=nimbTy -p 5432:5432 postgres:16`
3. `cp .env.example .env`, set DATABASE_URL, SESSION_SECRET (64-hex), CRON_SECRET, ARBITER_KEY.
4. Nimiq: NIMIQ_RPC_URL (testnet RPC), ESCROW_ACCOUNT_ADDRESS, ESCROW_ACCOUNT_PRIVATE_KEY (testnet only), NEXT_PUBLIC_HUB_BASE_URL.
5. `npx prisma migrate deploy && npm run dev` → http://localhost:3000
6. Settlement cron: `POST /api/cron/settle` with `Authorization: Bearer $CRON_SECRET` (or vercel.json schedule).

## Commands
- `npm run build` (gate), `npx prisma migrate status`, `npx prisma studio`
- API suites: `npx tsx scripts/phase2-test.mts` (needs NIMIQ_NETWORK=mainnet for live checks),
  `node scripts/phase3-test.cjs`, `node scripts/phase47-test.cjs` (dev server on :3000)
- Dev wallet: NEXT_PUBLIC_ALLOW_DEV_WALLET=true (local only, never prod).

## Local test state (this machine)
- Postgres `nimbTy` DB migrated (2 migrations). `.env` holds a THROWAWAY local escrow keypair
  (NQ12 EL40…) — test funds only, never use on mainnet; generate a fresh one for testnet demo.
- Dev server: `npm run dev` → :3000. Suites leave test bounties in DB (harness-funded, labeled sender "harness").

## Phase 10 runbook (needs a human)
1. Fresh testnet escrow keypair: `node -e "console.log(require('@nimiq/core').KeyPair.generate().privateKey.toHex())"`.
   Fund it via the Nimiq testnet faucet (faucet needs a manual claim).
2. Run a testnet node with RPC enabled (no public testnet RPC exists):
   `docker run ... ghcr.io/nimiq/core-rs-albatross` with `consensus.network="test-albatross"` + `[rpc]` section;
   set NIMIQ_RPC_URL to it, NIMIQ_NETWORK=testnet.
3. Set ALLOW_UNVERIFIED_WALLET_LOGIN=false, NEXT_PUBLIC_ALLOW_DEV_WALLET=false. Real wallets only.
4. Creator: post → FUND & POST → pay escrow + memo from wallet → I'VE PAID → BOUNTY LIVE.
5. Worker (second wallet): claim → submit → creator approves → cron pays out → profile updates.
6. Also demo: revision, dispute, and review-timeout auto-settlement.

## Limitations
- Escrow is a custodial testnet account, not a contract (Nimiq L1 has no general VM). All moves audit-logged.
- Disputes resolve via human arbiter endpoint (ARBITER_KEY), not automated.
- USDT path is schema/UX-ready; NIM is the verified rail first.

## Blockers
- Phase 10 needs funded Nimiq testnet wallets (faucet) + reachable testnet RPC.
