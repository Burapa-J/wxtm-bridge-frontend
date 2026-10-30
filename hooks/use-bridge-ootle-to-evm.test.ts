import { beforeEach, describe, expect, it, vi } from 'vitest'
import type TariL1Signer from '@/clients/tari-l1-signer'
import { useTariAccountStore } from '@/store/account'
import { lockOotleWrapInFlight, releaseOotleWrapInFlight } from '@/store/bridge'
import { getUnfinishedOotleWrapError } from './use-bridge-ootle-to-evm'

function signerWith(getOngoingBridgeTx: () => Promise<unknown>): TariL1Signer {
  return { getOngoingBridgeTx } as unknown as TariL1Signer
}

const OOTLE_WRAP = {
  network: 'Ootle',
  clientToken: 'secret',
  paymentId: 'p1',
  amount: '1',
  amountToReceive: '1',
  destinationAddress: '0x1',
}

describe('getUnfinishedOotleWrapError', () => {
  beforeEach(() => {
    releaseOotleWrapInFlight('p1')
    useTariAccountStore.setState({ ootleAccount: { address: 'otl_esm_me', network: 'esmeralda' } })
  })

  it('refuses while an Ootle wrap is in flight', async () => {
    lockOotleWrapInFlight('p1')
    expect(await getUnfinishedOotleWrapError(signerWith(async () => undefined))).toBe('ootle_wrap_unfinished')
  })

  it('refuses while TU holds an Ootle wrap with a clientToken', async () => {
    expect(await getUnfinishedOotleWrapError(signerWith(async () => OOTLE_WRAP))).toBe('ootle_wrap_unfinished')
  })

  it('refuses when TU cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(
      await getUnfinishedOotleWrapError(
        signerWith(async () => {
          throw new Error('timed out')
        }),
      ),
    ).toBe('ootle_wrap_check_failed')
  })

  it('allows a bridge when TU is free, or holds a confirmed or wXTM record', async () => {
    expect(await getUnfinishedOotleWrapError(signerWith(async () => undefined))).toBe('')
    expect(await getUnfinishedOotleWrapError(signerWith(async () => ({ ...OOTLE_WRAP, clientToken: undefined })))).toBe(
      '',
    )
    expect(await getUnfinishedOotleWrapError(signerWith(async () => ({ ...OOTLE_WRAP, network: undefined })))).toBe('')
  })

  it('does not check TU when the Ootle bridge is not loaded', async () => {
    useTariAccountStore.setState({ ootleAccount: undefined })
    expect(await getUnfinishedOotleWrapError(signerWith(async () => OOTLE_WRAP))).toBe('')
  })
})
