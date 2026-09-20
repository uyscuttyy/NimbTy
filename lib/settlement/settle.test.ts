import { describe, it, expect, vi, beforeEach } from 'vitest'
import { applyWorkerPaid, queuePayout, recordCompletion } from '@/lib/settlement/settle'
import { BountyStatus, ClaimStatus, PaymentKind, PaymentStatus, Currency } from '@prisma/client'
import type { Prisma } from '@prisma/client'

describe('Settlement Primitives', () => {
  const mockUpdateMany = vi.fn()
  const mockFindUnique = vi.fn()
  const mockCreate = vi.fn()
  const mockUpdate = vi.fn()
  const mockDeleteMany = vi.fn()
  const mockUpsert = vi.fn()

  const mockTx = {
    bounty: {
      updateMany: mockUpdateMany,
      findUnique: mockFindUnique,
    },
    payment: {
      create: mockCreate,
      findFirst: mockFindUnique,
      findUnique: mockFindUnique,
      update: mockUpdate,
      updateMany: mockUpdateMany,
    },
    settlementJob: {
      create: mockCreate,
      deleteMany: mockDeleteMany,
    },
    claim: {
      update: mockUpdate,
      findUnique: mockFindUnique,
      updateMany: mockUpdateMany,
    },
    submission: {
      update: mockUpdate,
      findUnique: mockFindUnique,
    },
    reputation: {
      update: mockUpdate,
      findUnique: mockFindUnique,
    },
    streak: {
      findUnique: mockFindUnique,
      upsert: mockUpsert,
    },
    $transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
  } as unknown as Prisma.TransactionClient

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('queuePayout', () => {
    it('creates payment and settlement job', async () => {
      mockCreate
        .mockResolvedValueOnce({ id: 'payment-1' })
        .mockResolvedValueOnce({ id: 'job-1' })

      const paymentId = await queuePayout(mockTx, {
        bountyId: 'bounty-1',
        to: 'NQ12WORKER',
        amount: '10',
        currency: 'NIM',
        kind: 'WORKER_PAYOUT',
        rail: 'release',
      })

      expect(paymentId).toBe('payment-1')
      expect(mockCreate).toHaveBeenCalledTimes(2)
      // First call: payment.create
      expect(mockCreate).toHaveBeenNthCalledWith(1, {
        data: {
          bountyId: 'bounty-1',
          kind: 'WORKER_PAYOUT',
          sender: process.env.ESCROW_ACCOUNT_ADDRESS ?? '',
          recipient: 'NQ12WORKER',
          amount: '10',
          currency: 'NIM',
          status: 'PENDING',
        },
      })
      // Second call: settlementJob.create
      expect(mockCreate).toHaveBeenNthCalledWith(2, {
        data: {
          bountyId: 'bounty-1',
          kind: 'PAYOUT',
          payload: { paymentId: 'payment-1', to: 'NQ12WORKER', rail: 'release' },
          runAt: expect.any(Date),
        },
      })
    })
  })

  describe('applyWorkerPaid', () => {
    const baseInput = {
      bountyId: 'bounty-1',
      submissionId: 'submission-1',
      claimId: 'claim-1',
      workerId: 'worker-1',
      workerWallet: 'NQ12WORKER',
      creatorId: 'creator-1',
      amount: '10',
      currency: 'NIM' as Currency,
    }

    it('returns false when transition fails', async () => {
      mockUpdateMany.mockResolvedValue({ count: 0 })

      const result = await applyWorkerPaid(mockTx, baseInput)

      expect(result).toBe(false)
    })

    it('completes full worker paid flow on successful transition', async () => {
      mockUpdateMany.mockResolvedValue({ count: 1 })
      mockUpdate.mockResolvedValue({})
      mockDeleteMany.mockResolvedValue({ count: 1 })
      mockCreate
        .mockResolvedValueOnce({ id: 'payment-1' })
        .mockResolvedValueOnce({})

      const result = await applyWorkerPaid(mockTx, baseInput)

      expect(result).toBe(true)

      // Transition SUBMITTED -> PAID
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: 'bounty-1', status: BountyStatus.SUBMITTED },
        data: { status: BountyStatus.PAID, settledAt: expect.any(Date) },
      })

      // Submission approved
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'submission-1' },
        data: { status: 'APPROVED' },
      })

      // Claim completed
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'claim-1' },
        data: { status: ClaimStatus.WORK_COMPLETED },
      })

      // Review expiry jobs cleaned up
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { bountyId: 'bounty-1', kind: 'REVIEW_EXPIRED', status: 'QUEUED' },
      })

      // Payout queued (payment.create + settlementJob.create)
      expect(mockCreate).toHaveBeenCalledTimes(2)

      // Reputation updated for worker
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { userId: 'worker-1' },
        data: {
          completed: { increment: 1 },
          approvals: { increment: 1 },
          earned: { increment: '10' },
        },
      })

      // Reputation updated for creator
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { userId: 'creator-1' },
        data: { bountiesPaid: { increment: 1 } },
      })
    })
  })

  describe('recordCompletion', () => {
    it('creates new streak for first completion', async () => {
      mockFindUnique.mockResolvedValue(null)
      mockUpsert.mockResolvedValue({})

      await recordCompletion(mockTx, 'worker-1')

      expect(mockUpsert).toHaveBeenCalledWith({
        where: { userId: 'worker-1' },
        create: {
          userId: 'worker-1',
          current: 1,
          longest: 1,
          lastCompletedOn: expect.any(Date),
        },
        update: {
          current: 1,
          longest: 1,
          lastCompletedOn: expect.any(Date),
        },
      })
    })

    it('increments streak for consecutive days', async () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      yesterday.setHours(0, 0, 0, 0)

      mockFindUnique.mockResolvedValue({
        current: 5,
        longest: 10,
        lastCompletedOn: yesterday,
      })
      mockUpsert.mockResolvedValue({})

      await recordCompletion(mockTx, 'worker-1')

      expect(mockUpsert).toHaveBeenCalledWith({
        where: { userId: 'worker-1' },
        create: expect.any(Object),
        update: {
          current: 6,
          longest: 10,
          lastCompletedOn: expect.any(Date),
        },
      })
    })

    it('resets streak when gap > 1 day', async () => {
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
      threeDaysAgo.setHours(0, 0, 0, 0)

      mockFindUnique.mockResolvedValue({
        current: 5,
        longest: 10,
        lastCompletedOn: threeDaysAgo,
      })
      mockUpsert.mockResolvedValue({})

      await recordCompletion(mockTx, 'worker-1')

      expect(mockUpsert).toHaveBeenCalledWith({
        where: { userId: 'worker-1' },
        create: expect.any(Object),
        update: {
          current: 1,
          longest: 10,
          lastCompletedOn: expect.any(Date),
        },
      })
    })

    it('does not increment for same day completion', async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      mockFindUnique.mockResolvedValue({
        current: 5,
        longest: 10,
        lastCompletedOn: today,
      })
      mockUpsert.mockResolvedValue({})

      await recordCompletion(mockTx, 'worker-1')

      expect(mockUpsert).toHaveBeenCalledWith({
        where: { userId: 'worker-1' },
        create: expect.any(Object),
        update: {
          current: 5,
          longest: 10,
          lastCompletedOn: expect.any(Date),
        },
      })
    })
  })
})