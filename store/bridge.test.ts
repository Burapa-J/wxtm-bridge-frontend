import { beforeEach, describe, expect, it } from 'vitest'
import {
  claimBridgeStart,
  lockOotleWrapInFlight,
  releaseBridgeStart,
  releaseOotleWrapInFlight,
  useBridgeStore,
} from './bridge'

beforeEach(() => useBridgeStore.setState({ ootleWrapInFlightId: '', bridgeStartId: '' }))

describe('Ootle wrap in-flight lock', () => {
  it('is released only by the wrap that holds it', () => {
    expect(lockOotleWrapInFlight('first')).toBe(true)
    releaseOotleWrapInFlight('second')
    expect(useBridgeStore.getState().ootleWrapInFlightId).toBe('first')
    releaseOotleWrapInFlight('first')
    expect(useBridgeStore.getState().ootleWrapInFlightId).toBe('')
  })

  it('is not taken over by another wrap', () => {
    expect(lockOotleWrapInFlight('first')).toBe(true)
    expect(lockOotleWrapInFlight('second')).toBe(false)
    expect(useBridgeStore.getState().ootleWrapInFlightId).toBe('first')
    // re-entrant for the holder
    expect(lockOotleWrapInFlight('first')).toBe(true)
  })
})

describe('bridge start claim', () => {
  it('admits one start at a time', () => {
    const a = claimBridgeStart()
    expect(a).not.toBe('')
    expect(claimBridgeStart()).toBe('')
    releaseBridgeStart('someone-else')
    expect(claimBridgeStart()).toBe('')
    releaseBridgeStart(a)
    const b = claimBridgeStart()
    expect(b).not.toBe('')
    expect(b).not.toBe(a)
  })
})
