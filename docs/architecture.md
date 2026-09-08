# NimBty — Architecture

Tiny tasks. Real rewards. A micro-bounty marketplace settled in real Nimiq testnet payments.

## 1. Stack & why

| Layer | Choice | Reason |
|---|---|---|
| App | Next.js 15 (App Router) + TS | One deployable on Vercel; API routes next to UI |
| DB | PostgreSQL + Prisma | Relational integrity for money state; `updateMany` guards give race-safe state transitions |
| Styling | Tailwind v3 + design tokens | Playful-but-polished system (§11), cheap consistency |
| Auth | Wallet-signed challenge → HMAC httpOnly session | Wallet = identity (§31); no passwords, no private keys ever stored |
| Payments | `PaymentService` interface over Nimiq (Phase 2) | All chain access isolated behind one service (§32) |
| Settlement | Outbox table + Vercel cron endpoint | Vercel can't run daemons (§43); jobs are atomic + idempotent |

## 2. Where authority lives (non-negotiables)

- **State machine** (`lib/bounty/state-machine.ts`) is the ONLY transition map. Routes call `tryTransition` (optimistic `updateMany`) — the client can never post a status (§6, §36).
- **Timers** derive from DB timestamps (`deadlineAt`, `reviewDeadlineAt`, `SubAmbmission.reviewDeadlineAt`). The cron worker judges expiry server-side (§8, §35). Frontend countdowns are display-only.
- **Protected deliverables** (`Submission.finalDeliverable`) are served only through a status-checking endpoint. Released to creator only on PAID / WORKER_PAID. Never on CREATOR_REFUNDED (§7).
- **Money moves** originate only as `SettlementJob` rows created inside a validated state transition; the runner is idempotent and audit-logged.

## 3. Escrow: MVP design + contract path (§33)

MVP uses a dedicated **testnet escrow account** signed server-side via `ESCROW_ACCOUNT_PRIVATE_KEY` (env, testnet only). Every outgoing payment must reference a job produced by a legal transition; every incoming funding tx is verified on-chain by hash before FUNDED→OPEN.

Why not a smart contract yet: Nimiq's current L1 exposes protocol-level contracts (staking) without a general VM for arbitrary escrow logic. Forcing a fake "contract" would be worse than an honest custodial testnet account with compensating controls. **Migration path:** when general contracts land, only `PaymentService`'s release/refund implementations change — every call site already goes through it.

Trust tradeoff documented honestly: today the app server *can* move escrowed funds, but only ever in response to validated state transitions; every such movement is a row in `Payment` + `SettlementJob` (full audit trail).

## 4. Wallet auth (Phase 1 — implemented)

1. Client asks `/api/auth/nonce` for its address → server stores single-use nonce (10 min TTL).
2. Client signs the **exact server-built message** (never client-defined, §36).
3. `/api/auth/verify`: burns nonce → verifies **Ed25519** signature against submitted pubkey → upserts User (wallet = identity) → sets HMAC-signed httpOnly session cookie (30 d).
4. Replay is impossible: nonce is consumed before signature check. Sessions verify user existence against DB on every read.

**Honest Phase-1 limitation:** signature proves control of an Ed25519 key; binding that key to the *stated Nimiq address* (address↔pubkey derivation via `@nimiq/core`/`Address.fromPublicKey`) lands in Phase 2 behind `ALLOW_UNVERIFIED_WALLET_LOGIN=false`. The dev wallet adapter (browser key) exists only for local dev and is disabled by env in the real demo. We do NOT fake this as full wallet ownership yet — the abstraction (`lib/auth/verify-signature.ts`) is already where the strict check will live.

## 5. Known-uncertainty register (rule 47: document, don't fake)

| Item | Status |
|---|---|
| `@nimiq/hub-api` signMessage result shape (signerPubKey) | Assumed present; adapter isolated so a mismatch = 1-file fix |
| Nimiq Pay mobile deep-link sign flow | Interface shipped; real flow in Phase 2 with payments |
| USDT on Nimiq | Schema/UX-ready; custody path documented in Phase 2 after SDK verification |
| Dispute arbiter | Human arbiter via secured endpoint in MVP; rules fully implemented |
| Address checksum validation | Format-only in Phase 1; full validation with @nimiq/core in Phase 2 |

## 6. Vercel deployment shape (§43)

`app/api/cron/settle` (cron-protected by `CRON_SECRET`) drains `SettlementJob` (QUEUED, runAt ≤ now) and applies review/deadline expiry rules computed from DB timestamps. `vercel.json` cron schedule added in Phase 5.

## 7. Phase log

- **Phase 0 ✅** — scaffold, Prisma schema (11 models), state machine, PaymentService interface, env template, Postgres migrated.
- **Phase 1 ✅** — wallet auth (nonce→signature→session), Hub + dev adapters, auth API, session UI + error states, dev-auth E2E script, this document.
