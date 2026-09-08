#!/usr/bin/env bash
set -euo pipefail

# ══════════════════════════════════════════════════════════════════
#  NimBty — PHASE 0 SCAFFOLD
#  Run from the repository root. Overwrites empty stub files.
# ══════════════════════════════════════════════════════════════════

[ -d prisma ] || { echo "ERROR: run this from the repo root (prisma/ not found)"; exit 1; }

echo "→ Writing config files..."

mkdir -p app/api/auth/logout app/api/auth/nonce app/api/auth/verify
mkdir -p "app/api/bounties/[publicId]/approve" "app/api/bounties/[publicId]/claim" "app/api/bounties/[publicId]/dispute" "app/api/bounties/[publicId]/fund" "app/api/bounties/[publicId]/revision" "app/api/bounties/[publicId]/submit"
mkdir -p app/api/cron/settle "app/api/disputes/[id]/resolve" app/api/profile "app/api/submissions/[id]/deliverable"
mkdir -p "app/n/[publicId]" app/post app/submit "app/submit/[claimId]"
mkdir -p lib/auth lib/bounty lib/money lib/payments lib/reputation lib/wallet

# ── package.json ────────────────────────────────────────────────
cat > package.json << 'EOF'
{
  "name": "nimbty",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "db:studio": "prisma studio",
    "db:seed": "tsx prisma/seed.ts"
  },
  "prisma": { "seed": "tsx prisma/seed.ts" },
  "dependencies": {
    "@prisma/client": "^6.3.0",
    "nanoid": "^5.0.9",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "prisma": "^6.3.0",
    "tailwindcss": "^3.4.17",
    "tsx": "^4.19.2",
    "typescript": "^5.7.0"
  }
}
EOF

cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF

cat > next.config.ts << 'EOF'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
EOF

cat > postcss.config.mjs << 'EOF'
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
EOF

cat > tailwind.config.ts << 'EOF'
import type { Config } from "tailwindcss";

/**
 * Design system (spec §11–12).
 * NOTE: keep these hex values in sync with the CSS vars in app/globals.css.
 */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#FAFAFA",
        surface: "#FFFFFF",
        ink: "#141A2E",
        muted: "#5B6478",
        brand: { DEFAULT: "#0582CA", deep: "#036AA3" },
        sunny: "#FFD64D",
        coral: "#FF6B6B",
        grape: "#7C6FF0",
        mint: "#3EC98C",
        blush: "#FF8FB1"
      },
      fontFamily: {
        display: ["var(--font-display)", "Fredoka", "sans-serif"],
        body: ["var(--font-body)", "Nunito", "system-ui", "sans-serif"]
      },
      boxShadow: {
        card: "0 2px 10px rgba(20, 26, 46, 0.07), 0 8px 24px rgba(20, 26, 46, 0.06)",
        pop: "0 6px 0 rgba(20, 26, 46, 0.9)",
        float: "0 12px 32px rgba(20, 26, 46, 0.12)"
      }
    }
  },
  plugins: []
} satisfies Config;
EOF

cat > .gitignore << 'EOF'
node_modules/
.next/
out/
build/
.env
.env.local
.env*.local
*.tsbuildinfo
next-env.d.ts
prisma/migrations/**/migration_lock.toml.bak
.DS_Store
EOF

cat > .env.example << 'EOF'
# ── Database ─────────────────────────────────────────────────────
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nimbty"

# ── App ──────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL="http://localhost:3000"
SESSION_SECRET="generate-64-bytes-hex"
CRON_SECRET="generate-random"
ARBITER_KEY="generate-random"

# ── Uploads (attachments; wire a blob provider in Phase 4) ──────
BLOB_READ_WRITE_TOKEN=""

# ── Nimiq ────────────────────────────────────────────────────────
NIMIQ_NETWORK="testnet"
NIMIQ_RPC_URL=""
ESCROW_ACCOUNT_ADDRESS=""
ESCROW_ACCOUNT_PRIVATE_KEY=""
NEXT_PUBLIC_HUB_BASE_URL=""

# ── Dev tooling ──────────────────────────────────────────────────
ALLOW_SEED="false"
EOF

# ── Prisma schema (spec §30) ────────────────────────────────────
cat > prisma/schema.prisma << 'EOF'
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Currency {
  NIM
  USDT
}

enum BountyStatus {
  DRAFT
  FUNDING
  FUNDED
  OPEN
  CLAIMED
  SUBMITTED
  REVISION_REQUESTED
  DISPUTED
  PAID
  WORKER_PAID
  CREATOR_REFUNDED
  EXPIRED_REFUNDED
  CANCELLED
}

enum ClaimStatus {
  ACTIVE
  WORK_COMPLETED
  ABANDONED
}

enum SubmissionStatus {
  PENDING_REVIEW
  REVISION_REQUESTED
  APPROVED
  DISPUTED
}

enum DisputeStatus {
  OPEN
  RESOLVED
}

enum DisputeResolution {
  WORKER_WINS
  CREATOR_WINS
}

enum DisputeOpenedBy {
  CREATOR
  WORKER
}

enum PaymentKind {
  ESCROW_FUNDING
  WORKER_PAYOUT
  CREATOR_REFUND
}

enum PaymentStatus {
  PENDING
  CONFIRMED
  FAILED
}

enum JobStatus {
  QUEUED
  PROCESSING
  DONE
  FAILED_PERMANENT
}

enum ProofItemType {
  TEXT
  LINK
  IMAGE
  FILE
}

model User {
  id            String   @id @default(cuid())
  walletAddress String   @unique
  displayName   String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  bounties    Bounty[]     @relation("CreatorBounties")
  claims      Claim[]
  submissions Submission[]
  disputes    Dispute[]
  reputation  Reputation?
  streak      Streak?
}

model Bounty {
  id            String       @id @default(cuid())
  publicId      String       @unique
  creatorId     String
  creator       User         @relation("CreatorBounties", fields: [creatorId])
  title         String
  description   String
  rewardAmount  Decimal      @db.Decimal(20, 4)
  currency      Currency     @default(NIM)
  deadlineAt    DateTime
  reviewHours   Int          @default(12)
  status        BountyStatus @default(DRAFT)

  escrowAddress String?
  fundingTxHash String?

  fundedAt  DateTime?
  settledAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  claims      Claim[]
  submissions Submission[]
  disputes    Dispute[]
  payments    Payment[]
  jobs        SettlementJob[]

  @@index([status, deadlineAt])
  @@index([status, createdAt])
}

model Claim {
  id        String      @id @default(cuid())
  bountyId  String
  bounty    Bounty      @relation(fields: [bountyId], onDelete: Cascade)
  workerId  String
  worker    User        @relation(fields: [workerId])
  status    ClaimStatus @default(ACTIVE)
  claimedAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt

  submissions Submission[]

  @@unique([bountyId, workerId])
  @@index([workerId, status])
}

model Submission {
  id               String           @id @default(cuid())
  bountyId         String
  bounty           Bounty           @relation(fields: [bountyId], onDelete: Cascade)
  claimId          String
  claim            Claim            @relation(fields: [claimId])
  workerId         String
  summary          String
  proofItems       Json
  finalDeliverable Json?
  revisionNumber   Int              @default(0)
  status           SubmissionStatus @default(PENDING_REVIEW)
  reviewDeadlineAt DateTime
  submittedAt      DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  @@index([status, reviewDeadlineAt])
  @@index([bountyId, status])
}

model Dispute {
  id             String             @id @default(cuid())
  bountyId       String
  bounty         Bounty             @relation(fields: [bountyId], onDelete: Cascade)
  submissionId   String?
  openedById     String
  openedBy       User               @relation(fields: [openedById])
  openedByRole   DisputeOpenedBy
  reason         String
  evidence       Json?
  status         DisputeStatus      @default(OPEN)
  resolution     DisputeResolution?
  resolutionNote String?
  resolvedAt     DateTime?
  resolvedBy     String?
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt

  @@index([status])
}

model Payment {
  id              String        @id @default(cuid())
  bountyId        String
  bounty          Bounty        @relation(fields: [bountyId], onDelete: Cascade)
  kind            PaymentKind
  sender          String?
  recipient       String?
  amount          Decimal       @db.Decimal(20, 4)
  currency        Currency
  transactionHash String?
  status          PaymentStatus @default(PENDING)
  confirmedAt     DateTime?
  chainMeta       Json?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@index([bountyId, kind])
  @@index([status])
}

model Reputation {
  userId          String   @id
  user            User     @relation(fields: [userId])
  bountiesPosted  Int      @default(0)
  bountiesFunded  Int      @default(0)
  bountiesPaid    Int      @default(0)
  completed       Int      @default(0)
  submitted       Int      @default(0)
  approvals       Int      @default(0)
  earned          Decimal  @default(0) @db.Decimal(20, 4)
  paid            Decimal  @default(0) @db.Decimal(20, 4)
  disputesOpened  Int      @default(0)
  disputesAgainst Int      @default(0)
  disputesLost    Int      @default(0)
  updatedAt       DateTime @updatedAt
}

model Streak {
  userId          String    @id
  user            User      @relation(fields: [userId])
  current         Int       @default(0)
  longest         Int       @default(0)
  lastCompletedOn DateTime?
  updatedAt       DateTime  @updatedAt
}

model SettlementJob {
  id        String    @id @default(cuid())
  bountyId  String?
  bounty    Bounty?   @relation(fields: [bountyId])
  kind      String
  payload   Json
  status    JobStatus @default(QUEUED)
  attempts  Int       @default(0)
  lastError String?
  runAt     DateTime  @default(now())
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([status, runAt])
}

model AuthNonce {
  id            String    @id @default(cuid())
  walletAddress String
  nonce         String    @unique
  expiresAt     DateTime
  usedAt        DateTime?
  createdAt     DateTime  @default(now())
}
EOF

# ── Core lib: db, env, state machine, money ────────────────────
cat > lib/db.ts << 'EOF'
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
EOF

cat > lib/env.ts << 'EOF'
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(16).optional(),
  CRON_SECRET: z.string().optional(),
  ARBITER_KEY: z.string().optional(),
  NIMIQ_NETWORK: z.enum(["mainnet", "testnet"]).default("testnet"),
  NIMIQ_RPC_URL: z.string().optional(),
  ESCROW_ACCOUNT_ADDRESS: z.string().optional(),
  ESCROW_ACCOUNT_PRIVATE_KEY: z.string().optional(),
  NEXT_PUBLIC_HUB_BASE_URL: z.string().optional(),
  ALLOW_SEED: z.enum(["true", "false"]).default("false")
});

const parsed = schema.safeParse(process.env);

if (!parsed.success && process.env.NODE_ENV === "production") {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = parsed.success ? parsed.data : (schema.partial().parse(process.env) as typeof parsed.data);

export function requireEnv(key: keyof typeof parsed.data): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}
EOF

cat > lib/bounty/state-machine.ts << 'EOF'
import { Prisma, BountyStatus } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export const TERMINAL: ReadonlySet<BountyStatus> = new Set([
  BountyStatus.PAID,
  BountyStatus.WORKER_PAID,
  BountyStatus.CREATOR_REFUNDED,
  BountyStatus.EXPIRED_REFUNDED,
  BountyStatus.CANCELLED,
]);

/**
 * The ONLY legal transitions (spec §6).
 * API handlers derive the target from user INTENT; the client
 * can never pass a status value. All transitions are validated here.
 */
export const ALLOWED_TRANSITIONS: Record<BountyStatus, ReadonlySet<BountyStatus>> = {
  [BountyStatus.DRAFT]:              new Set([BountyStatus.FUNDING, BountyStatus.CANCELLED]),
  [BountyStatus.FUNDING]:            new Set([BountyStatus.FUNDED, BountyStatus.DRAFT]),
  [BountyStatus.FUNDED]:             new Set([BountyStatus.OPEN]),
  [BountyStatus.OPEN]:               new Set([BountyStatus.CLAIMED, BountyStatus.EXPIRED_REFUNDED]),
  [BountyStatus.CLAIMED]:            new Set([BountyStatus.SUBMITTED, BountyStatus.EXPIRED_REFUNDED]),
  [BountyStatus.SUBMITTED]:          new Set([BountyStatus.PAID, BountyStatus.REVISION_REQUESTED, BountyStatus.DISPUTED]),
  [BountyStatus.REVISION_REQUESTED]: new Set([BountyStatus.SUBMITTED, BountyStatus.EXPIRED_REFUNDED]),
  [BountyStatus.DISPUTED]:           new Set([BountyStatus.WORKER_PAID, BountyStatus.CREATOR_REFUNDED]),
  [BountyStatus.PAID]:               new Set(),
  [BountyStatus.WORKER_PAID]:        new Set(),
  [BountyStatus.CREATOR_REFUNDED]:   new Set(),
  [BountyStatus.EXPIRED_REFUNDED]:   new Set(),
  [BountyStatus.CANCELLED]:          new Set(),
};

export class TransitionError extends Error {
  constructor(public from: BountyStatus, public to: BountyStatus) {
    super(`Illegal bounty transition ${from} -> ${to}`);
    this.name = "TransitionError";
  }
}

export function assertTransition(from: BountyStatus, to: BountyStatus): void {
  if (!ALLOWED_TRANSITIONS[from]?.has(to)) throw new TransitionError(from, to);
}

/**
 * Atomic optimistic transition — the race-safe primitive used for
 * claims (exactly one claimer), review actions and dispute resolution.
 * Returns whether THIS caller won the transition.
 */
export async function tryTransition(
  tx: Tx,
  bountyId: string,
  from: BountyStatus,
  to: BountyStatus,
  extraData: Prisma.BountyUpdateInput = {},
): Promise<boolean> {
  assertTransition(from, to);
  const res = await tx.bounty.updateMany({
    where: { id: bountyId, status: from },
    data: { status: to, ...extraData },
  });
  return res.count === 1;
}
EOF

cat > lib/money/format.ts << 'EOF'
import { Currency } from "@prisma/client";

/** NIM has 5 decimals (1 luna = 1e-5 NIM). USDT displays with 2. */
export const CURRENCY_META: Record<Currency, { decimals: number; symbol: string }> = {
  NIM: { decimals: 5, symbol: "NIM" },
  USDT: { decimals: 2, symbol: "$" },
};

export function formatReward(amount: string | number, currency: Currency): string {
  const meta = CURRENCY_META[currency];
  const n = typeof amount === "string" ? Number(amount) : amount;
  const formatted = n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: meta.decimals,
  });
  return currency === "USDT" ? `${meta.symbol}${formatted}` : `${formatted} NIM`;
}

/** Normalize user input (e.g. "5", "5.00", " 5 ") into a clean decimal string. */
export function parseAmount(input: string, currency: Currency): string {
  const n = Number(input.trim());
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid reward amount");
  const decimals = CURRENCY_META[currency].decimals;
  const parts = n.toFixed(decimals).split(".");
  parts[1] = parts[1].replace(/0+$/, "");
  return parts[1].length ? `${parts[0]}.${parts[1]}` : parts[0];
}
EOF

# ── Payment abstraction (spec §32) — Nimiq plugs in, in Phase 2 ─
cat > lib/payments/types.ts << 'EOF'
import { Currency } from "@prisma/client";

export interface FundingRequest {
  bountyId: string;
  publicId: string;
  payTo: string;
  amount: string;
  currency: Currency;
  memo: string;
  expiresAt: string;
}

export interface TransactionVerification {
  verified: boolean;
  amountOk: boolean;
  recipientOk: boolean;
  sender: string;
  txHash?: string;
  blockHeight?: number;
}

export interface PayoutResult {
  txHash: string;
  status: "BROADCAST" | "CONFIRMED" | "FAILED";
}

/**
 * Server-side financial authority (spec §32).
 * The product NEVER calls Nimiq directly — everything goes through here.
 */
export interface PaymentService {
  getEscrowAddress(): string;
  createFundingRequest(input: {
    bountyId: string;
    publicId: string;
    amount: string;
    currency: Currency;
  }): Promise<FundingRequest>;
  verifyTransaction(input: { request: FundingRequest; txHash?: string }): Promise<TransactionVerification>;
  lockReward(bountyId: string, paymentId: string): Promise<void>;
  releaseToWorker(bountyId: string, to: string): Promise<PayoutResult>;
  refundCreator(bountyId: string, to: string): Promise<PayoutResult>;
}
EOF

cat > lib/payments/nimbty-nimiq.service.ts << 'EOF'
import type { Currency } from "@prisma/client";
import { requireEnv } from "@/lib/env";
import type {
  FundingRequest,
  PayoutResult,
  PaymentService,
  TransactionVerification,
} from "./types";

export class PaymentNotImplementedError extends Error {
  constructor(op: string, phase: number) {
    super(`PHASE_${phase}_NOT_IMPLEMENTED: PaymentService.${op}() is wired to the Nimiq testnet adapter in Phase ${phase}.`);
    this.name = "PaymentNotImplementedError";
  }
}

/**
 * Phase 0: interface scaffold only. Escrow address comes from env config —
 * nothing about money is hardcoded. Real Nimiq testnet RPC integration
 * (createFundingTransaction / verifyTransaction / payouts) lands in Phase 2.
 */
export class NimbtyNimiqService implements PaymentService {
  getEscrowAddress(): string {
    return requireEnv("ESCROW_ACCOUNT_ADDRESS");
  }

  async createFundingRequest(input: {
    bountyId: string;
    publicId: string;
    amount: string;
    currency: Currency;
  }): Promise<FundingRequest> {
    return {
      bountyId: input.bountyId,
      publicId: input.publicId,
      payTo: this.getEscrowAddress(),
      amount: input.amount,
      currency: input.currency,
      memo: `nimbty:${input.publicId}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
  }

  async verifyTransaction(_input: { request: FundingRequest; txHash?: string }): Promise<TransactionVerification> {
    throw new PaymentNotImplementedError("verifyTransaction", 2);
  }

  async lockReward(_bountyId: string, _paymentId: string): Promise<void> {
    throw new PaymentNotImplementedError("lockReward", 2);
  }

  async releaseToWorker(_bountyId: string, _to: string): Promise<PayoutResult> {
    throw new PaymentNotImplementedError("releaseToWorker", 2);
  }

  async refundCreator(_bountyId: string, _to: string): Promise<PayoutResult> {
    throw new PaymentNotImplementedError("refundCreator", 2);
  }
}

export const paymentService = new NimbtyNimiqService();
EOF

# ── Reputation layer: level math (spec §25) ─────────────────────
cat > lib/reputation/service.ts << 'EOF'
/**
 * Level math is a pure function over REAL stored counters (Reputation.completed).
 * Nothing here invents numbers — levels are derived, never stored.
 */
export const LEVELS = [
  { name: "Newbie",        min: 0 },
  { name: "Bounty Rookie", min: 5 },
  { name: "Task Hunter",   min: 15 },
  { name: "Bounty Beast",  min: 30 },
  { name: "NimBty Pro",    min: 60 },
] as const;

export interface LevelInfo {
  index: number;
  name: string;
  completedAtLevel: number;
  nextLevelAt: number | null;
  progress: number; // 0..1, toward next level
}

export function getLevel(completed: number): LevelInfo {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) if (completed >= LEVELS[i].min) index = i;

  const current = LEVELS[index];
  const next = LEVELS[index + 1];
  const span = next ? next.min - current.min : 1;
  const progress = next ? Math.min(1, (completed - current.min) / span) : 1;

  return {
    index,
    name: current.name,
    completedAtLevel: completed - current.min,
    nextLevelAt: next ? next.min : null,
    progress,
  };
}

export function getApprovalRate(approvals: number, submitted: number): number | null {
  if (submitted === 0) return null;
  return Math.round((approvals / submitted) * 100);
}
EOF

# ── Wallet / auth placeholders, filled in Phase 1 ───────────────
cat > lib/wallet/types.ts << 'EOF'
import { Currency } from "@prisma/client";

export interface WalletProvider {
  connect(): Promise<{ address: string }>;
  signMessage(message: string): Promise<string>;
  sendTransaction(tx: { to: string; amount: string; currency: Currency; memo: string }): Promise<{ txHash: string }>;
}
EOF

cat > lib/wallet/hub.ts << 'EOF'
// Phase 1: Nimiq Hub adapter (desktop) implementing WalletProvider.
export {};
EOF

cat > lib/wallet/pay.ts << 'EOF'
// Phase 1: Nimiq Pay deep-link/RPC adapter (mobile) implementing WalletProvider.
export {};
EOF

cat > lib/auth/nonce.ts << 'EOF'
// Phase 1: nonce generation + single-use consumption (AuthNonce table).
export {};
EOF

cat > lib/auth/session.ts << 'EOF'
// Phase 1: signed httpOnly session cookie issuing/verification (SESSION_SECRET).
export {};
EOF

# ── App shell: layout, globals, home (Phase 0 smoke screen) ────
cat > app/globals.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: #FAFAFA;
  --surface: #FFFFFF;
  --ink: #141A2E;
  --muted: #5B6478;
  --brand: #0582CA;
  --brand-deep: #036AA3;
  --sunny: #FFD64D;
  --coral: #FF6B6B;
  --grape: #7C6FF0;
  --mint: #3EC98C;
  --blush: #FF8FB1;
}

body {
  background-color: var(--bg);
  color: var(--ink);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
EOF

cat > app/layout.tsx << 'EOF'
import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import "./globals.css";

const fredoka = Fredoka({ subsets: ["latin"], variable: "--font-display" });
const nunito = Nunito({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "NimBty — Tiny tasks. Real rewards.",
  description: "Put a bounty on anything that needs doing.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0582CA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fredoka.variable} ${nunito.variable}`}>
      <body className="font-body min-h-dvh antialiased">{children}</body>
    </html>
  );
}
EOF

cat > app/page.tsx << 'EOF'
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

async function checkDb(): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

function Pill({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-2xl border-2 p-4 ${
        ok ? "border-mint bg-mint/10" : "border-coral bg-coral/10"
      }`}
    >
      <span className="font-display text-lg font-semibold">
        {ok ? "\u2705" : "\u274C"} {label}
      </span>
      <span className="text-sm text-muted">{detail}</span>
    </div>
  );
}

export default async function Phase0Home() {
  const db = await checkDb();

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-5 py-10">
      <header className="text-center">
        <p className="font-display text-sm font-medium uppercase tracking-widest text-brand">
          NimBty · Phase 0
        </p>
        <h1 className="font-display mt-2 text-4xl font-bold leading-tight">
          Tiny tasks.
          <br />
          Real rewards.
        </h1>
      </header>

      <section className="grid gap-3" aria-label="Scaffold status">
        <Pill ok label="SCAFFOLD" detail="Next.js 15 + TypeScript + Tailwind is compiling." />
        <Pill
          ok={db.ok}
          label={db.ok ? "DATABASE" : "DATABASE NOT REACHABLE"}
          detail={
            db.ok
              ? "Postgres responds. Prisma schema is migrated."
              : `Set DATABASE_URL in .env, then run: npm run db:migrate — ${db.error ?? ""}`
          }
        />
        <Pill
          ok={Boolean(env.SESSION_SECRET)}
          label={env.SESSION_SECRET ? "CONFIG" : "CONFIG PARTIAL"}
          detail={
            env.SESSION_SECRET
              ? "SESSION_SECRET present. Wallet auth lands in Phase 1."
              : "Add SESSION_SECRET to .env (Phase 1 needs it)."
          }
        />
      </section>

      <section className="rounded-2xl bg-ink p-5 text-white">
        <h2 className="font-display text-lg font-semibold">What&apos;s next</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-white/80">
          <li>Phase 1 — wallet sign-in (Nimiq Hub / Pay adapters)</li>
          <li>Phase 2 — real Nimiq testnet funding (PaymentService goes live)</li>
          <li>Phase 3 — Home / Explore / Detail / Create UI</li>
          <li>Phase 4 — claim, submit, review, revision, dispute</li>
          <li>Phase 5 — cron settlement + review-expiry autopay</li>
        </ol>
      </section>
    </main>
  );
}
EOF

# ── Valid route stubs (real logic arrives in their phases) ─────
STUB_ROUTE='import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "not_implemented", message: "This endpoint is delivered in a later phase." },
    { status: 503 }
  );
}'

for f in \
  app/api/auth/logout/route.ts \
  app/api/auth/nonce/route.ts \
  app/api/auth/verify/route.ts \
  app/api/bounties/route.ts \
  "app/api/bounties/[publicId]/route.ts" \
  "app/api/bounties/[publicId]/approve/route.ts" \
  "app/api/bounties/[publicId]/claim/route.ts" \
  "app/api/bounties/[publicId]/dispute/route.ts" \
  "app/api/bounties/[publicId]/fund/route.ts" \
  "app/api/bounties/[publicId]/revision/route.ts" \
  "app/api/bounties/[publicId]/submit/route.ts" \
  app/api/cron/settle/route.ts \
  "app/api/disputes/[id]/resolve/route.ts" \
  app/api/profile/route.ts \
  "app/api/submissions/[id]/deliverable/route.ts"
do
  printf '%s\n' "$STUB_ROUTE" > "$f"
done

# ── Valid page stubs (real pages arrive in later phases) ────────
STUB_PAGE_BODY='This page is built in a later phase. The scaffold is ready for it.'
make_stub_page() {
  cat > "$1" << EOF2
export default function StubPage() {
  return (
    <main className="mx-auto max-w-xl px-5 py-16 text-center">
      <h1 className="font-display text-2xl font-bold">$2</h1>
      <p className="mt-2 text-muted">$STUB_PAGE_BODY</p>
    </main>
  );
}
EOF2
}

make_stub_page app/explore/page.tsx "Find something to do"
make_stub_page app/post/page.tsx "Post a bounty"
make_stub_page app/work/page.tsx "My work"
make_stub_page app/bounties/page.tsx "My bounties"
make_stub_page app/me/page.tsx "Me"
make_stub_page "app/n/[publicId]/page.tsx" "Bounty"
make_stub_page "app/submit/[claimId]/page.tsx" "Submit your work"

# ── Component stubs (real components later) ─────────────────────
cat > components/BountyCard.tsx << 'EOF'
export function BountyCard() {
  return null; // Phase 3
}
EOF

cat > components/Countdown.tsx << 'EOF'
export function Countdown() {
  return null; // Phase 3 — display-only, server timestamps are the source of truth (§35)
}
EOF

cat > components/RewardBadge.tsx << 'EOF'
export function RewardBadge() {
  return null; // Phase 3
}
EOF

cat > components/EmptyState.tsx << 'EOF'
export function EmptyState() {
  return null; // Phase 3
}
EOF

cat > components/Confetti.tsx << 'EOF'
export function Confetti() {
  return null; // Phase 2/3 — shown after confirmed funding (§39)
}
EOF

# ── Seed (isolated + guarded, spec §34) ─────────────────────────
cat > prisma/seed.ts << 'EOF'
/**
 * NimBty seed — DEV ONLY.
 * Refuses to run in production or unless ALLOW_SEED=true.
 * Marketplace seed data (demo bounties etc.) is added in Phase 7; the guard
 * and isolation ship now so no fake data can ever reach production.
 */
async function main() {
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_SEED !== "true") {
    console.log("[seed] Disabled. Set ALLOW_SEED=true (and NODE_ENV !== production) to run.");
    return;
  }
  console.log("[seed] Running development seeds... (Phase 7 adds demo bounties)");
  // Phase 7: insert demo users/bounties here.
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
EOF

# ── README + architecture starter ───────────────────────────────
cat > README.md << 'EOF'
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
EOF

cat > docs/architecture.md << 'EOF'
# NimBty — Architecture

## Stack
- Next.js 15 (App Router) + TypeScript — one deployable on Vercel (spec §42)
- PostgreSQL + Prisma — relational integrity for money state
- Tailwind CSS — design tokens in tailwind.config.ts + app/globals.css
- Fonts: Fredoka (display) + Nunito (body) via next/font

## Invariants
1. Server owns bounty state. Clients send intent (`approve`, `dispute`, ...),
   never status values. All transitions validate through
   `lib/bounty/state-machine.ts` (`ALLOWED_TRANSITIONS` + atomic `tryTransition`).
2. Timestamps are the source of truth (§35). Deadlines/review periods are stored
   (`deadlineAt`, `Submission.reviewDeadlineAt`); the cron endpoint
   `/api/cron/settle` decides expiry server-side. UI countdowns are display-only.
3. Escrow rules (§7). After `CLAIMED`, there is no cancel→refund shortcut.
   Submission deliverables are gated server-side; a dispute-losing creator never
   gains access to the protected final work.
4. Payments are verified, never trusted (§17). A bounty becomes FUNDED/OPEN only
   after confirmed inclusion of a real testnet transaction with the correct
   recipient + amount (checked in Phase 2's PaymentService implementation).

## Escrow design (Phase 0 status)
Nimiq's current testnet does not yet support Ethereum-style general-purpose
contracts, so the MVP financial authority is a dedicated escrow account
(`ESCROW_ACCOUNT_ADDRESS` / `ESCROW_ACCOUNT_PRIVATE_KEY`, testnet only, env-configured)
with compensating server-side controls:
- Outgoing payouts/refunds ONLY originate from `SettlementJob` records created by
  validated state transitions (outbox pattern), executed idempotently by the cron.
- Incoming funding is verified on-chain before any state transitions to FUNDED/OPEN.
- All financial actions are recorded in the `Payment` table with tx hashes.
Migration path: when Nimiq exposes contract capabilities fit for escrow, only the
`PaymentService` adapter changes — product code keeps calling the same interface.

## Known MVP limitations (documented, not faked)
- Escrow trust: funds sit in the escrow account; the settlement key is a
  server-side risk. Outbox controls prevent *application-level* fund misuse;
  full trustlessness requires a future Nimiq contract.
- Dispute arbitration is human (ARBITER_KEY) in the MVP.
- USDT is schema/UX-ready; the demo runs NIM testnet.

## Deployment (spec §43)
Vercel (frontend/api) + Postgres + `/api/cron/settle` triggered by Vercel Cron.
No long-lived workers anywhere. All secrets via env — see .env.example.
EOF

echo ""
echo "✅ Phase 0 files written."
echo ""
echo "Next steps:"
echo "  1) npm install"
echo "  2) cp .env.example .env   (then edit DATABASE_URL + SESSION_SECRET)"
echo "  3) npm run db:migrate -- --name init"
echo "  4) npm run dev            → open http://localhost:3000"
echo "  5) npm run build          (must pass — Phase 0 gate)"
