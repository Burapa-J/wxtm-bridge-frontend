import { describe, expect, it } from 'vitest'
import { isSameTransaction, ootleWrapReference } from './ootle-wrap-reference'

const PAYMENT_ID = '9b2f4c1e-3a5d-4e6f-8a7b-1c2d3e4f5a6b'
// node -e 'crypto.createHash("sha256").update("ootle-wrap-reference:" + id).digest("hex").slice(0, 16)'
const REFERENCE = '1ef58d2c1b5acd02'

describe('ootleWrapReference', () => {
  it('matches the backend derivation', () => {
    expect(ootleWrapReference(PAYMENT_ID)).toBe(REFERENCE)
  })
})

describe('isSameTransaction', () => {
  const ootleWrapRow = { type: 'wrap' as const, paymentId: REFERENCE, ootleChainId: 1 }

  it('matches an Ootle wrap row by the reference of the local paymentId', () => {
    expect(isSameTransaction(ootleWrapRow, PAYMENT_ID)).toBe(true)
  })

  it('matches an Ootle wrap row against an id that is already its reference', () => {
    expect(isSameTransaction(ootleWrapRow, REFERENCE)).toBe(true)
  })

  it('matches other rows by paymentId only', () => {
    expect(isSameTransaction({ type: 'wrap', paymentId: PAYMENT_ID }, PAYMENT_ID)).toBe(true)
    expect(isSameTransaction({ type: 'wrap', paymentId: REFERENCE }, PAYMENT_ID)).toBe(false)
    expect(isSameTransaction({ type: 'unwrap', paymentId: REFERENCE, ootleChainId: 1 }, PAYMENT_ID)).toBe(false)
  })

  it('does not match a different or missing id', () => {
    expect(isSameTransaction(ootleWrapRow, 'another-payment-id')).toBe(false)
    expect(isSameTransaction(ootleWrapRow, undefined)).toBe(false)
    expect(isSameTransaction(ootleWrapRow, '')).toBe(false)
  })
})
