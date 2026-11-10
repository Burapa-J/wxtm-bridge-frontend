import { describe, expect, it } from 'vitest'
import i18n from 'i18next'
import { UserTransactionDTO, UserUnwrappedTransactionDTO } from '@tari-project/wxtm-bridge-backend-api'
import type { OngoingUserTransaction } from '@/types/tapplet'
import {
  getTransactionAmount,
  getWrapModalTitle,
  isFailedTransaction,
  isOverHighBridgeThreshold,
  resolveFailedModalState,
  resolveWrapModalState,
} from './transaction'

const common = { paymentId: 'p', createdAt: '', destinationAddress: '0x1234567890abcdef1234567890abcdef12345678' }
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

describe('isOverHighBridgeThreshold', () => {
  it('compares base units against highThreshold * 10^decimals for 6-decimal wrap and 18-decimal unwrap', () => {
    // 10,000 XTM threshold at 6 decimals = 10,000,000,000 base units
    expect(isOverHighBridgeThreshold('10000000000', 6, 10000)).toBe(false)
    expect(isOverHighBridgeThreshold('10000000001', 6, 10000)).toBe(true)

    // 10,000 wXTM threshold at 18 decimals = 10000 * 10^18 wei
    expect(isOverHighBridgeThreshold('10000000000000000000000', 18, 10000)).toBe(false)
    expect(isOverHighBridgeThreshold('10000000000000000000001', 18, 10000)).toBe(true)
  })

  it('supports fractional asset thresholds without BigNumber underflow', () => {
    // 0.5 ETH threshold at 18 decimals = 500000000000000000 wei
    expect(isOverHighBridgeThreshold('500000000000000000', 18, 0.5)).toBe(false)
    expect(isOverHighBridgeThreshold('500000000000000001', 18, 0.5)).toBe(true)
    expect(isOverHighBridgeThreshold(undefined, 18, 0.5)).toBe(false)
    expect(isOverHighBridgeThreshold('not-a-number', 18, 0.5)).toBe(false)
  })
})

describe('resolveWrapModalState', () => {
  it('formats 18-decimal unwrap amountAfterFee with 18 decimals and prioritizes transaction.type over explicit type prop', () => {
    const state = resolveWrapModalState({
      // Even if a caller passes type="wrap" (e.g., page.tsx:184 fallback), transaction.type ("unwrap") wins
      type: 'wrap',
      amountAfterFeeProp: unwrap.amountAfterFee,
      transaction: unwrap as unknown as OngoingUserTransaction,
      routeIsWrapping: true,
      fallbackAmountAfterFee: '0',
    })
    expect(state.effectiveType).toBe('unwrap')
    expect(state.amountAfterFeePending).toBe('0.995')
  })

  it('formats live transaction.amountAfterFee when amountAfterFeeProp is omitted', () => {
    const state = resolveWrapModalState({
      transaction: wrap as unknown as OngoingUserTransaction,
      routeIsWrapping: false,
      fallbackAmountAfterFee: '999',
    })
    expect(state.effectiveType).toBe(wrap.type)
    expect(state.amountAfterFeePending).toBe('0.995')
  })
})

describe('resolveFailedModalState', () => {
  it('isolates history failed modal from live ongoingBridgeTx state and active route tab when fromHistory is true', () => {
    const historyUnwrapState = resolveFailedModalState({
      historyType: 'unwrap',
      fromHistory: true,
      paymentIdProp: '',
      ongoingBridgeTx: { type: 'wrap', paymentId: 'live-wrap-id' },
      routeIsWrapping: true,
    })
    expect(historyUnwrapState.isWrapping).toBe(false)
    expect(historyUnwrapState.paymentId).toBe('')

    const historyWrapStateOnUnwrapTab = resolveFailedModalState({
      historyType: 'wrap',
      fromHistory: true,
      paymentIdProp: 'history-wrap-id',
      ongoingBridgeTx: { type: 'unwrap', paymentId: '' },
      routeIsWrapping: false,
    })
    expect(historyWrapStateOnUnwrapTab.isWrapping).toBe(true)
    expect(historyWrapStateOnUnwrapTab.paymentId).toBe('history-wrap-id')
  })

  it('uses ongoingBridgeTx.type and paymentId for live failed modal when fromHistory is false', () => {
    const liveUnwrapState = resolveFailedModalState({
      historyType: 'wrap',
      fromHistory: false,
      paymentIdProp: undefined,
      ongoingBridgeTx: { type: 'unwrap', paymentId: 'live-unwrap-id' },
      routeIsWrapping: true,
    })
    expect(liveUnwrapState.isWrapping).toBe(false)
    expect(liveUnwrapState.paymentId).toBe('live-unwrap-id')
  })
})

describe('getWrapModalTitle', () => {
  i18n.init({
    lng: 'en',
    resources: {
      en: {
        main: {
          unknown_transaction_status: 'UNKNOWN',
          wrapping: 'Wrapping',
          unwrapping: 'Unwrapping',
          wrapped: 'wrapped',
          unwrapped: 'unwrapped',
          from: 'from',
          to: 'to',
          pending_title: '{{action}} {{amount}} {{fromToken}}',
          pending_subtext: 'Receive {{amount}} {{toToken}} ({{bridgingTime}}) {{direction}}',
          processing_title: 'Processing',
          processing_subtext: 'Being {{action}}',
        },
      },
    },
  })

  const bridgeInfo = { fromToken: 'XTM', toToken: 'wXTM', isWrapping: true }
  const feeData = {
    feeAmount: '5000',
    amountAfterFee: '0.995',
    feePercentage: 50,
    isOverHighBridgeThreshold: true,
  }

  it('defensively falls back to tx.type when the optional type parameter is omitted', () => {
    const res = getWrapModalTitle(bridgeInfo, feeData, wrap as unknown as OngoingUserTransaction, 'en')
    expect(res.title).toBe('Wrapping 1 XTM')
    expect(res.subtext).toBe('Receive 0.995 wXTM (24-72h) from')

    const processingWrap = {
      ...wrap,
      status: UserTransactionDTO.status.PROCESSING,
    } as unknown as OngoingUserTransaction
    const procRes = getWrapModalTitle(bridgeInfo, feeData, processingWrap, 'en')
    expect(procRes.title).toBe('Processing')
    expect(procRes.subtext).toBe('Being wrapped')
  })
})
