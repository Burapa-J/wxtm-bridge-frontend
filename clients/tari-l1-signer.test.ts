import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendSignerCall } from './tari-l1-signer'

describe('sendSignerCall', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('rejects and removes its listener when Universe never answers', async () => {
    vi.useFakeTimers()
    const removeEventListener = vi.fn()
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener,
      parent: { postMessage: vi.fn() },
    })

    const call = sendSignerCall('getOotleAccount', [], 1000)
    const result = expect(call).rejects.toThrow('timed out')
    vi.advanceTimersByTime(1000)

    await result
    expect(removeEventListener).toHaveBeenCalledTimes(1)
  })
})
