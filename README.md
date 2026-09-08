# NimBty — Tiny tasks. Real rewards.

Put a bounty on anything that needs doing. Built on Nimiq testnet.

## Quick start

1. `npm install`
2. Start Postgres (local):

   docker run -d --name nimbty-db \
     -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=nimbty \
     -p 5432:5432 postgres:16

3. `cp .env.example .env` and fill in `DATABASE_URL` (+ `SESSION_SECRET`).
4. `npm run db:migrate -- --name init`
5. `npm run dev` → http://localhost:3000 shows the Phase 0 status screen
   (all pills green = scaffold verified).
6. `npm run build` must pass — it is part of the Phase 0 gate.

## Docs
See docs/architecture.md for stack decisions, escrow design and phase plan.
