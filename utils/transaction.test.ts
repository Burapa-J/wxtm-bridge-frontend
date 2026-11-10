import { describe, expect, it } from 'vitest'
import { UserTransactionDTO, UserUnwrappedTransactionDTO } from '@tari-project/wxtm-bridge-backend-api'
import type { OngoingUserTransaction } from '@/types/tapplet'
import { getTransactionAmount, isFailedTransaction } from './transaction'

const common = { paymentId: 'p', createdAt: '', destinationAddress: 'd' }
const wrap = {
  ...common,
  type: 'wrap',
  tokenAmount: '1000000',
  amountAfterFee: '995000',
  status: UserTransactionDTO.status.PENDING,
} as const
const unwrap = {
  ...common,
  type: 'unwrap',
  amount: '1000000000000000000',
  amountAfterFee: '995000000000000000',
  transactionHash: '',
  blockTimestamp: '',
  status: UserUnwrappedTransactionDTO.status.PENDING,
} as const

describe('getTransactionAmount', () => {
  it('uses the type, not which fields are present', () => {
    expect(getTransactionAmount(wrap)).toEqual({ amount: '1000000', amountAfterFee: '995000', decimals: 6 })
    expect(getTransactionAmount(unwrap)).toEqual({
      amount: unwrap.amount,
      amountAfterFee: unwrap.amountAfterFee,
      decimals: 18,
    })
    // a stray tokenAmount on an unwrap no longer turns it into a wrap
    const mixed = { ...unwrap, tokenAmount: '5' } as unknown as OngoingUserTransaction
    expect(getTransactionAmount(mixed).decimals).toBe(18)
  })
})

describe('isFailedTransaction (C23)', () => {
  it('ends the pending state for a rejected unwrap and a timed-out wrap only', () => {
    expect(isFailedTransaction({ type: 'unwrap', status: UserUnwrappedTransactionDTO.status.ERROR })).toBe(true)
    expect(isFailedTransaction({ type: 'wrap', status: UserTransactionDTO.status.TIMEOUT })).toBe(true)
    expect(isFailedTransaction({ type: 'unwrap', status: UserUnwrappedTransactionDTO.status.PENDING })).toBe(false)
    expect(isFailedTransaction({ type: 'unwrap', status: UserUnwrappedTransactionDTO.status.PROCESSING })).toBe(false)
    expect(isFailedTransaction({ type: 'wrap', status: UserTransactionDTO.status.SUCCESS })).toBe(false)
    expect(isFailedTransaction(undefined)).toBe(false)
  })
})
