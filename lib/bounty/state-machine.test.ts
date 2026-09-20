import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ALLOWED_TRANSITIONS,
  TERMINAL,
  TransitionError,
  assertTransition,
  tryTransition,
} from '@/lib/bounty/state-machine'
import { BountyStatus } from '@prisma/client'

describe('Bounty State Machine', () => {
  describe('ALLOWED_TRANSITIONS', () => {
    it('allows DRAFT → FUNDING and DRAFT → CANCELLED', () => {
      expect(ALLOWED_TRANSITIONS.DRAFT.has(BountyStatus.FUNDING)).toBe(true)
      expect(ALLOWED_TRANSITIONS.DRAFT.has(BountyStatus.CANCELLED)).toBe(true)
    })

    it('allows FUNDING → FUNDED and FUNDING → DRAFT', () => {
      expect(ALLOWED_TRANSITIONS.FUNDING.has(BountyStatus.FUNDED)).toBe(true)
      expect(ALLOWED_TRANSITIONS.FUNDING.has(BountyStatus.DRAFT)).toBe(true)
    })

    it('allows FUNDED → OPEN only', () => {
      expect(ALLOWED_TRANSITIONS.FUNDED.has(BountyStatus.OPEN)).toBe(true)
      expect(ALLOWED_TRANSITIONS.FUNDED.size).toBe(1)
    })

    it('allows OPEN → CLAIMED and OPEN → EXPIRED_REFUNDED', () => {
      expect(ALLOWED_TRANSITIONS.OPEN.has(BountyStatus.CLAIMED)).toBe(true)
      expect(ALLOWED_TRANSITIONS.OPEN.has(BountyStatus.EXPIRED_REFUNDED)).toBe(true)
    })

    it('allows CLAIMED → SUBMITTED and CLAIMED → EXPIRED_REFUNDED', () => {
      expect(ALLOWED_TRANSITIONS.CLAIMED.has(BountyStatus.SUBMITTED)).toBe(true)
      expect(ALLOWED_TRANSITIONS.CLAIMED.has(BountyStatus.EXPIRED_REFUNDED)).toBe(true)
    })

    it('allows SUBMITTED → PAID, REVISION_REQUESTED, DISPUTED', () => {
      expect(ALLOWED_TRANSITIONS.SUBMITTED.has(BountyStatus.PAID)).toBe(true)
      expect(ALLOWED_TRANSITIONS.SUBMITTED.has(BountyStatus.REVISION_REQUESTED)).toBe(true)
      expect(ALLOWED_TRANSITIONS.SUBMITTED.has(BountyStatus.DISPUTED)).toBe(true)
    })

    it('allows REVISION_REQUESTED → SUBMITTED and REVISION_REQUESTED → EXPIRED_REFUNDED', () => {
      expect(ALLOWED_TRANSITIONS.REVISION_REQUESTED.has(BountyStatus.SUBMITTED)).toBe(true)
      expect(ALLOWED_TRANSITIONS.REVISION_REQUESTED.has(BountyStatus.EXPIRED_REFUNDED)).toBe(true)
    })

    it('allows DISPUTED → WORKER_PAID and DISPUTED → CREATOR_REFUNDED', () => {
      expect(ALLOWED_TRANSITIONS.DISPUTED.has(BountyStatus.WORKER_PAID)).toBe(true)
      expect(ALLOWED_TRANSITIONS.DISPUTED.has(BountyStatus.CREATOR_REFUNDED)).toBe(true)
    })

    it('TERMINAL states have no outgoing transitions', () => {
      TERMINAL.forEach((status) => {
        expect(ALLOWED_TRANSITIONS[status].size).toBe(0)
      })
    })

    it('every non-terminal state has at least one transition', () => {
      Object.values(BountyStatus).forEach((status) => {
        if (!TERMINAL.has(status)) {
          expect(ALLOWED_TRANSITIONS[status].size).toBeGreaterThan(0)
        }
      })
    })
  })

  describe('assertTransition', () => {
    it('passes for valid transitions', () => {
      expect(() => assertTransition(BountyStatus.DRAFT, BountyStatus.FUNDING)).not.toThrow()
      expect(() => assertTransition(BountyStatus.OPEN, BountyStatus.CLAIMED)).not.toThrow()
      expect(() => assertTransition(BountyStatus.SUBMITTED, BountyStatus.PAID)).not.toThrow()
    })

    it('throws TransitionError for invalid transitions', () => {
      expect(() => assertTransition(BountyStatus.DRAFT, BountyStatus.OPEN)).toThrow(TransitionError)
      expect(() => assertTransition(BountyStatus.OPEN, BountyStatus.PAID)).toThrow(TransitionError)
      expect(() => assertTransition(BountyStatus.PAID, BountyStatus.OPEN)).toThrow(TransitionError)
    })

    it('throws TransitionError for terminal state transitions', () => {
      TERMINAL.forEach((status) => {
        Object.values(BountyStatus).forEach((to) => {
          expect(() => assertTransition(status, to)).toThrow(TransitionError)
        })
      })
    })
  })

  describe('tryTransition', () => {
    const mockUpdateMany = vi.fn()
    const mockTx = {
      bounty: {
        updateMany: mockUpdateMany,
      },
    } as unknown as Parameters<typeof tryTransition>[0]

    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('returns true when transition succeeds (count === 1)', async () => {
      mockUpdateMany.mockResolvedValue({ count: 1 })

      const result = await tryTransition(
        mockTx,
        'bounty-1',
        BountyStatus.DRAFT,
        BountyStatus.FUNDING
      )

      expect(result).toBe(true)
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: 'bounty-1', status: BountyStatus.DRAFT },
        data: { status: BountyStatus.FUNDING },
      })
    })

    it('returns false when transition fails (count === 0)', async () => {
      mockUpdateMany.mockResolvedValue({ count: 0 })

      const result = await tryTransition(
        mockTx,
        'bounty-1',
        BountyStatus.DRAFT,
        BountyStatus.FUNDING
      )

      expect(result).toBe(false)
    })

    it('includes extraData in the update', async () => {
      mockUpdateMany.mockResolvedValue({ count: 1 })

      await tryTransition(
        mockTx,
        'bounty-1',
        BountyStatus.FUNDING,
        BountyStatus.FUNDED,
        { fundingTxHash: 'abc123', fundedAt: new Date() }
      )

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: 'bounty-1', status: BountyStatus.FUNDING },
        data: {
          status: BountyStatus.FUNDED,
          fundingTxHash: 'abc123',
          fundedAt: expect.any(Date),
        },
      })
    })

    it('throws TransitionError for invalid transition', async () => {
      await expect(
        tryTransition(mockTx, 'bounty-1', BountyStatus.DRAFT, BountyStatus.OPEN)
      ).rejects.toThrow(TransitionError)
    })
  })
})