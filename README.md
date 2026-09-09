# NimBty — Tiny tasks. Real rewards.

Put a bounty on anything that needs doing. NimBty is a mobile-first micro-bounty
marketplace settled in real Nimiq payments: a creator funds the reward **before**
work begins, the reward locks in escrow, a worker claims it, submits proof, and
gets paid — no chasing payments, no disappearing clients.

**Brand:** Tiny tasks. Real rewards. · Need something done? Fund it. · See something you can do? Earn it.

## How it works

```
CREATE BOUNTY → FUND (real Nimiq tx, verified on-chain) → REWARD LOCKED → OPEN
  → WORKER CLAIMS → SUBMITS PROOF → CREATOR REVIEWS
      ├── APPROVE & PAY → worker paid from escrow
      ├── REQUEST REVISION → worker resubmits (still locked)
      ├── DISPUTE → locked until arbiter resolves
      └── NO ACTION for 12h → auto-settles to the worker
```

- **No categories.** You just describe what needs doing: test a site, translate
  something, research, review, resize, check — anything small and legitimate.
- **Money first.** A bounty goes OPEN only after the funding transaction is
  verified on-chain (recipient + exact amount + memo + block inclusion).
- **Protected submissions.** Workers can attach a final deliverable that stays
  locked until they're paid — even in disputes. Creators never get the work and
  the refund.
- **Real reputation.** Levels, streaks, approval rates and earnings all derive
  from on-chain-backed database records. Nothing is hardcoded.

## Tech

- **App:** Next.js 15 (App Router) + TypeScript, Tailwind, mobile-first (bottom
  nav: Home · Explore · ＋Post · Work · Me), shareable bounty URLs (`/n/<id>`).
- **Data:** PostgreSQL + Prisma. A strict server-side state machine owns every
  bounty transition — the client can never post a status, and race-safe
  `updateMany` guards mean exactly one claimer, exactly one payout.
- **Money:** Nimiq testnet via a clean `PaymentService` (`verifyTransaction`,
  `releaseToWorker`, `refundCreator`). Funding is verified by hash against
  JSON-RPC; payouts are signed locally with the escrow key and relayed on-chain.
  Unverifiable money stays PENDING — never assumed, never faked.
- **Settlement:** outbox table + cron worker (`/api/cron/settle`, vercel.json
  schedule). Review expiry auto-pays the worker; retries back off; jobs are
  idempotent so double-runs can't double-pay.
- **Auth:** your wallet is your identity (signed challenge → httpOnly session).
  NimBty never asks for seed phrases or private keys.

> Honest limitation: Nimiq L1 has no general-purpose escrow VM, so the MVP
> escrow is a dedicated testnet account whose every movement is audit-logged and
> can only result from validated state transitions. Only `PaymentService`'s
> release/refund changes when on-chain contracts land. Disputes resolve via a
> human arbiter endpoint in the MVP. See `architecture.md`.

## Run it

1. `npm install`
2. Start Postgres:
   `docker run -d --name nimbty-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=nimbty -p 5432:5432 postgres:16`
3. `cp .env.example .env` — set `DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`,
   `ARBITER_KEY`, plus Nimiq: `NIMIQ_RPC_URL` (testnet node; no public testnet
   RPC is bundled), `ESCROW_ACCOUNT_ADDRESS`, `ESCROW_ACCOUNT_PRIVATE_KEY`
   (testnet only).
4. `npx prisma migrate deploy`
5. `npm run dev` → http://localhost:3000 · `npm run build` must stay green.

Demo flow: post a bounty → FUND & POST → pay the escrow address with the exact
amount + memo from any Nimiq wallet → I'VE PAID (server finds your tx) →
BOUNTY LIVE → second wallet claims → submits → creator approves → escrow pays
out → profiles update. Full runbook in `handoff.md`.

## Docs

- `prd.md` — product requirements & flows · `architecture.md` — system design
- `project-plan.md` — phase status & verification log · `handoff.md` — run/test/deploy
- `memory.md` — key implementation decisions (incl. Nimiq SDK findings)

## Status

MVP phases 0–9 complete and verified (35 automated API checks, green build).
Live testnet end-to-end is next — needs a funded testnet wallet plus RPC access.
