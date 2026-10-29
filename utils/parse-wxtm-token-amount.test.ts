import { describe, expect, it } from 'vitest'
import { isOverDailyLimit } from './parse-wxtm-token-amount'

describe('isOverDailyLimit', () => {
  it('blocks any amount once the limit is used up', () => {
    expect(isOverDailyLimit('1000', '0')).toBe(true)
  })

  it('blocks when less than 1 XTM remains', () => {
    expect(isOverDailyLimit('1000', '500000')).toBe(true)
  })

  it('compares in micro units', () => {
    expect(isOverDailyLimit('1000.000001', '1000000000')).toBe(true)
    expect(isOverDailyLimit('1000', '1000000000')).toBe(false)
    expect(isOverDailyLimit('999.5', '1000000000')).toBe(false)
  })
})
