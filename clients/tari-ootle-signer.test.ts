import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendSignerCall } from './tari-l1-signer'
import {
  getOotleAccount,
  getOotleBalance,
  OotleSignerError,
  sendOotleStealth,
  toOotleSignerError,
  waitOotleTransaction,
} from './tari-ootle-signer'

vi.mock('./tari-l1-signer', () => ({ sendSignerCall: vi.fn() }))

const mockedSendSignerCall = vi.mocked(sendSignerCall)

beforeEach(() => {
  mockedSendSignerCall.mockReset()
})

describe('toOotleSignerError', () => {
  it('maps Universe signer errors to codes', () => {
    expect(toOotleSignerError('l2_unavailable').code).toBe('l2_unavailable')
    expect(toOotleSignerError('Error: busy').code).toBe('busy')
    expect(toOotleSignerError('Error: denied').code).toBe('denied')
    expect(toOotleSignerError('Error: Invalid arguments for tapplet signer method: sendOotleStealth').code).toBe(
      'invalid_arguments',
    )
    expect(toOotleSignerError('Error: failed').code).toBe('failed')
    expect(toOotleSignerError(new Error('something else')).code).toBe('failed')
    expect(toOotleSignerError(undefined).code).toBe('failed')
  })
})

describe('Ootle signer calls', () => {
  it('sends the method and arguments over the signer channel', async () => {
    mockedSendSignerCall.mockResolvedValue({ transactionId: 'tx-1' })
    const req = { amount: '1000000', address: 'otl_esm_cold', payRef: '9b2f4c1e-3a5d-4e6f-8a7b-1c2d3e4f5a6b' }

    await expect(sendOotleStealth(req)).resolves.toEqual({ transactionId: 'tx-1' })
    expect(mockedSendSignerCall).toHaveBeenCalledWith('sendOotleStealth', [req])
  })

  it('turns an l2_unavailable result into an OotleSignerError', async () => {
    mockedSendSignerCall.mockResolvedValue({ error: 'l2_unavailable' })

    const error = await getOotleAccount().catch((e) => e)
    expect(error).toBeInstanceOf(OotleSignerError)
    expect(error.code).toBe('l2_unavailable')
  })

  it('turns a resultError rejection into an OotleSignerError', async () => {
    mockedSendSignerCall.mockRejectedValue('Error: busy')

    const error = await getOotleAccount().catch((e) => e)
    expect(error).toBeInstanceOf(OotleSignerError)
    expect(error.code).toBe('busy')
  })

  it('maps malformed results to failed', async () => {
    const calls = [
      () => getOotleAccount(),
      () => getOotleBalance(),
      () => sendOotleStealth({ amount: '1', address: 'a', payRef: 'p' }),
      () => waitOotleTransaction('tx-1', 1),
    ]
    for (const call of calls) {
      mockedSendSignerCall.mockResolvedValue({ address: 1, available: null, transactionId: 2, status: {} })
      const error = await call().catch((e) => e)
      expect(error).toBeInstanceOf(OotleSignerError)
      expect(error.code).toBe('failed')
    }
  })
})
