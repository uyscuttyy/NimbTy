import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  normalizeTransaction,
  txInvolvesWallet,
  nimToLuna,
  lunaToNim,
  rpcUrlFor,
  RpcUnavailableError,
  RpcError,
  NimiqRpc,
  type NormalizedTransaction,
} from '@/lib/nimiq/rpc'
import { matchesFunding, type FundingCriteria } from '@/lib/payments/nimbTy-nimiq.service'

describe('Nimiq RPC Utilities', () => {
  describe('normalizeTransaction', () => {
    it('normalizes node-style transaction (sender/recipient/data)', () => {
      const raw = {
        hash: 'tx123',
        sender: 'NQ12SENDER',
        recipient: 'NQ12RECIPIENT',
        value: 100000,
        blockNumber: 100,
        data: '0x6e696d6254793a74657374', // 'nimbTy:test' in hex
        flags: 0,
      }

      const normalized = normalizeTransaction(raw)

      expect(normalized.hash).toBe('tx123')
      expect(normalized.sender).toBe('NQ12SENDER')
      expect(normalized.recipient).toBe('NQ12RECIPIENT')
      expect(normalized.valueLuna).toBe(100000n)
      expect(normalized.blockNumber).toBe(100)
      expect(normalized.memoText.trim()).toBe('nimbTy:test')
      expect(normalized.isContractCreation).toBe(false)
    })

    it('normalizes proxy-style transaction (from/to/senderData)', () => {
      const raw = {
        hash: 'tx456',
        from: 'NQ12FROM',
        to: 'NQ12TO',
        value: '200000',
        blockNumber: 101,
        senderData: 'nimbTy:proxy',
        flags: 0,
      }

      const normalized = normalizeTransaction(raw)

      expect(normalized.sender).toBe('NQ12FROM')
      expect(normalized.recipient).toBe('NQ12TO')
      expect(normalized.valueLuna).toBe(200000n)
      expect(normalized.memoText.trim()).toBe('nimbTy:proxy')
    })

    it('handles contract creation (flags === 1)', () => {
      const raw = {
        hash: 'tx789',
        sender: 'NQ12SENDER',
        recipient: 'NQ12RECIPIENT',
        value: 100000,
        blockNumber: 102,
        data: '',
        flags: 1,
      }

      const normalized = normalizeTransaction(raw)

      expect(normalized.isContractCreation).toBe(true)
    })

    it('includes relatedAddresses for HTLC payments', () => {
      const raw = {
        hash: 'tx999',
        sender: 'NQ12CONTRACT',
        recipient: 'NQ12RECIPIENT',
        value: 100000,
        blockNumber: 103,
        data: 'nimbTy:htlc',
        relatedAddresses: ['NQ12WALLET1', 'NQ12WALLET2'],
        flags: 0,
      }

      const normalized = normalizeTransaction(raw)

      expect(normalized.relatedAddresses).toEqual(['NQ12WALLET1', 'NQ12WALLET2'])
      expect(normalized.sender).toBe('NQ12CONTRACT')
    })

    it('handles missing blockNumber (unconfirmed)', () => {
      const raw = {
        hash: 'tx000',
        sender: 'NQ12SENDER',
        recipient: 'NQ12RECIPIENT',
        value: 100000,
        blockNumber: null,
        data: '',
        flags: 0,
      }

      const normalized = normalizeTransaction(raw)

      expect(normalized.blockNumber).toBeNull()
    })
  })

  describe('txInvolvesWallet', () => {
    const baseTx: NormalizedTransaction = {
      hash: 'tx1',
      sender: 'NQ12SENDER',
      recipient: 'NQ12RECIPIENT',
      valueLuna: 100000n,
      blockNumber: 100,
      memoText: 'nimbTy:test',
      relatedAddresses: ['NQ12WALLET1', 'NQ12WALLET2'],
      isContractCreation: false,
    }

    it('returns true for direct sender match', () => {
      expect(txInvolvesWallet(baseTx, 'NQ12SENDER')).toBe(true)
    })

    it('returns true for relatedAddresses match (HTLC fallback)', () => {
      expect(txInvolvesWallet(baseTx, 'NQ12WALLET1')).toBe(true)
      expect(txInvolvesWallet(baseTx, 'NQ12WALLET2')).toBe(true)
    })

    it('returns false for unrelated address', () => {
      expect(txInvolvesWallet(baseTx, 'NQ12RANDOM')).toBe(false)
    })

    it('returns false for empty wallet', () => {
      expect(txInvolvesWallet(baseTx, '')).toBe(false)
    })

    it('handles case-insensitive address comparison', () => {
      // txInvolvesWallet uses sameAddress which is case-insensitive
      const tx = { ...baseTx, sender: 'nq12sender' }
      expect(txInvolvesWallet(tx, 'NQ12SENDER')).toBe(true)
    })
  })

  describe('matchesFunding', () => {
    const criteria = {
      payTo: 'NQ12ESCROW',
      amountLuna: 100000n,
      memo: 'nimbTy:bounty123',
      sender: 'NQ12CREATOR',
    }

    const validTx: NormalizedTransaction = {
      hash: 'tx1',
      sender: 'NQ12CREATOR',
      recipient: 'NQ12ESCROW',
      valueLuna: 100000n,
      blockNumber: 100,
      memoText: 'nimbTy:bounty123',
      relatedAddresses: ['NQ12CREATOR'],
      isContractCreation: false,
    }

    it('returns true for exact match', () => {
      expect(matchesFunding(validTx, criteria)).toBe(true)
    })

    it('returns false if not confirmed (blockNumber null)', () => {
      const tx = { ...validTx, blockNumber: null }
      expect(matchesFunding(tx, criteria)).toBe(false)
    })

    it('returns false for contract creation', () => {
      const tx = { ...validTx, isContractCreation: true }
      expect(matchesFunding(tx, criteria)).toBe(false)
    })

    it('returns false for wrong recipient', () => {
      const tx = { ...validTx, recipient: 'NQ12WRONG' }
      expect(matchesFunding(tx, criteria)).toBe(false)
    })

    it('returns false for wrong amount', () => {
      const tx = { ...validTx, valueLuna: 99999n }
      expect(matchesFunding(tx, criteria)).toBe(false)
    })

    it('returns false for missing memo', () => {
      const tx = { ...validTx, memoText: 'wrong memo' }
      expect(matchesFunding(tx, criteria)).toBe(false)
    })

    it('returns false for wrong sender when sender specified', () => {
      const tx = { ...validTx, sender: 'NQ12WRONG', relatedAddresses: ['NQ12WRONG'] }
      expect(matchesFunding(tx, criteria)).toBe(false)
    })

    it('returns true for HTLC sender via relatedAddresses', () => {
      const tx = {
        ...validTx,
        sender: 'NQ12CONTRACT',
        relatedAddresses: ['NQ12CREATOR'],
      }
      expect(matchesFunding(tx, criteria)).toBe(true)
    })

    it('ignores sender check when sender not specified', () => {
      const criteriaNoSender = { ...criteria, sender: undefined }
      const tx = { ...validTx, sender: 'NQ12ANYONE', relatedAddresses: [] }
      expect(matchesFunding(tx, criteriaNoSender)).toBe(true)
    })
  })

  describe('nimToLuna / lunaToNim', () => {
    it('converts NIM to Luna correctly', () => {
      expect(nimToLuna('1')).toBe(100000n)
      expect(nimToLuna('1.5')).toBe(150000n)
      expect(nimToLuna('0.00001')).toBe(1n)
      expect(nimToLuna('0.12345')).toBe(12345n)
    })

    it('converts Luna to NIM correctly', () => {
      expect(lunaToNim(100000n)).toBe('1')
      expect(lunaToNim(150000n)).toBe('1.5')
      expect(lunaToNim(1n)).toBe('0.00001')
      expect(lunaToNim(12345n)).toBe('0.12345')
    })

    it('round-trips correctly', () => {
      const amounts = ['0.00001', '0.12345', '1', '1.5', '100', '1000.00001']
      amounts.forEach((amt) => {
        expect(lunaToNim(nimToLuna(amt))).toBe(amt)
      })
    })
  })

  describe('rpcUrlFor', () => {
    const originalEnv = process.env.NIMIQ_RPC_URL

    beforeEach(() => {
      delete process.env.NIMIQ_RPC_URL
    })

    afterEach(() => {
      if (originalEnv) process.env.NIMIQ_RPC_URL = originalEnv
      else delete process.env.NIMIQ_RPC_URL
    })

    it('returns configured RPC URL when set', () => {
      process.env.NIMIQ_RPC_URL = 'https://custom-rpc.example.com'
      expect(rpcUrlFor('testnet')).toBe('https://custom-rpc.example.com')
      expect(rpcUrlFor('mainnet')).toBe('https://custom-rpc.example.com')
    })

    it('returns mainnet public RPC when network=mainnet and no config', () => {
      expect(rpcUrlFor('mainnet')).toBe('https://rpc.nimiqwatch.com')
    })

    it('returns empty string for testnet without config', () => {
      expect(rpcUrlFor('testnet')).toBe('')
    })
  })

  describe('Error classes', () => {
    it('RpcError has code and message', () => {
      const err = new RpcError('TEST_CODE', 'Test message')
      expect(err.code).toBe('TEST_CODE')
      expect(err.message).toBe('Test message')
      expect(err.name).toBe('RpcError')
    })

    it('RpcUnavailableError extends RpcError', () => {
      const err = new RpcUnavailableError('connection failed')
      expect(err.code).toBe('RPC_UNAVAILABLE')
      expect(err.message).toContain('connection failed')
      expect(err).toBeInstanceOf(RpcError)
    })
  })

  describe('NimiqRpc', () => {
    it('throws RpcUnavailableError when URL not provided', () => {
      expect(() => new NimiqRpc('')).toThrow(RpcUnavailableError)
    })

    it('constructs with valid URL', () => {
      const rpc = new NimiqRpc('https://test.example.com')
      expect(rpc).toBeInstanceOf(NimiqRpc)
    })
  })
})