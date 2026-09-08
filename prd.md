# NimBty — PRD (locked spec, condensed)

Brand: NimBty — "Tiny tasks. Real rewards." / "Put a bounty on anything that needs doing."
Mobile-first bounty marketplace on Nimiq Pay. No categories. Creator funds before work; reward locked; worker claims, submits proof; creator APPROVES / REQUESTS REVISION / DISPUTES; silence for 12h review → worker auto-paid.

## Flows
- CREATE (title=what needs doing, reward, NIM/USDT, deadline, review 12h default, attachments) → FUND & POST (real wallet tx, server verifies, FUNDED→OPEN) → "BOUNTY LIVE, N NIM LOCKED"
- Worker: DO IT → claim modal (reward/deadline/locked) → START → IN PROGRESS countdown from deadlineAt → Submit (summary + proof links/uploads, preview vs final deliverable) → SUBMITTED, review timer starts
- Creator review: VIEW SUBMISSION → APPROVE & PAY (real payout) / REQUEST REVISION (reason required, locked, resubmit) / DISPUTE (reason required, locked, awaiting resolution)
- Dispute: human arbiter endpoint in MVP; WORKER_WINS→WORKER_PAID (deliverable released), CREATOR_WINS→CREATOR_REFUNDED (deliverable NOT released)
- Expiry: reviewExpiresAt → cron settles → WORKER PAID. Deadline passed with no claim → EXPIRED_REFUNDED. No CANCEL→REFUND after claim.
- Profile: game-style, all values from DB (completed, earned, approval, streaks from real completions, levels derived, never gate access).
- Sharing: /n/<id> public page (task/reward/deadline/status/action only), X/WhatsApp/Telegram/Discord/copy.
- Dashboards: My Work (active/submitted/revision/completed), My Bounties (live/in progress/awaiting review/disputed/completed).

## Non-negotiables
Server validates every transition (state, actor, timing, payment). Money moves only via SettlementJob from legal transitions. Timers from DB timestamps. No private keys/seed phrases ever. No hardcoded data in production.
