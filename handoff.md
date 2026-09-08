# NimBty — Handoff

## What works (verified)
- `npm run build` green (Next 15, fixed SessionProvider, added zod).
- Postgres migrated (`npx prisma migrate status` → up to date). Schema: 11 models.
- Wallet auth: nonce → sign → httpOnly session. State machine + PaymentService interface.

## What remains
Phases 2–10 (see project-plan.md). All bounty/worker/review/dispute/reputation/share APIs + pages are stubs.

## Run it
1. `npm install`
2. Postgres: `docker run -d --name nimbty-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=nimbty -p 5432:5432 postgres:16`
3. `cp .env.example .env`, set DATABASE_URL, SESSION_SECRET (64-hex), CRON_SECRET, ARBITER_KEY.
4. Nimiq: NIMIQ_RPC_URL (testnet RPC), ESCROW_ACCOUNT_ADDRESS, ESCROW_ACCOUNT_PRIVATE_KEY (testnet only), NEXT_PUBLIC_HUB_BASE_URL.
5. `npx prisma migrate deploy && npm run dev` → http://localhost:3000
6. Settlement cron: `POST /api/cron/settle` with `Authorization: Bearer $CRON_SECRET` (or vercel.json schedule).

## Commands
- `npm run build` (gate), `npx prisma migrate status`, `npx prisma studio`
- Dev wallet: NEXT_PUBLIC_ALLOW_DEV_WALLET=true (local only, never prod).

## Limitations
- Escrow is a custodial testnet account, not a contract (Nimiq L1 has no general VM). All moves audit-logged.
- Disputes resolve via human arbiter endpoint (ARBITER_KEY), not automated.
- USDT path is schema/UX-ready; NIM is the verified rail first.

## Blockers
- Phase 10 needs funded Nimiq testnet wallets (faucet) + reachable testnet RPC.
