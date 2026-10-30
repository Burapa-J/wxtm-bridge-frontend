import { describe, expect, it } from 'vitest'
import { lockOotleWrapInFlight, releaseOotleWrapInFlight, useBridgeStore } from './bridge'

describe('Ootle wrap in-flight lock', () => {
  it('is released only by the wrap that holds it', () => {
    lockOotleWrapInFlight('first')
    lockOotleWrapInFlight('second')
    releaseOotleWrapInFlight('first')
    expect(useBridgeStore.getState().ootleWrapInFlightId).toBe('second')
    releaseOotleWrapInFlight('second')
    expect(useBridgeStore.getState().ootleWrapInFlightId).toBe('')
  })
})
