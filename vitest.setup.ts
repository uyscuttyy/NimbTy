import { vi, expect, describe, it, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter() {
    return { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }
  },
  usePathname() { return '/' },
  useSearchParams() { return new URLSearchParams() },
}))

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies() {
    return {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
    }
  },
  headers() {
    return new Headers()
  },
}))

// Mock Prisma client
const mockPrisma = {
  bounty: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  payment: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  settlementJob: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  claim: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  submission: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  reputation: {
    update: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  streak: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  $transaction: vi.fn(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma)),
}

vi.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}))

// Mock env
vi.mock('@/lib/env', () => ({
  env: {
    NIMIQ_NETWORK: 'testnet',
    NIMIQ_RPC_URL: 'https://rpc.testnet.nimiqwatch.com',
    ESCROW_ACCOUNT_ADDRESS: 'NQ12TESTADDRESS',
    ESCROW_ACCOUNT_PRIVATE_KEY: '0000000000000000000000000000000000000000000000000000000000000000',
    CRON_SECRET: 'test-secret',
    SESSION_SECRET: 'test-session-secret',
    ARBITER_KEY: 'test-arbiter-key',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_HUB_BASE_URL: 'https://hub.nimiq-testnet.com',
    NEXT_PUBLIC_NIMIQ_NETWORK: 'testnet',
    NEXT_PUBLIC_ALLOW_DEV_WALLET: 'false',
  },
  requireEnv: (key: string) => process.env[key] ?? '',
}))