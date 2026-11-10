import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baseSepolia } from 'viem/chains'
import { OotleUserWrapTransactionDTO, OotleWrapDetailsDTO } from '@tari-project/wxtm-bridge-backend-api'

const mocks = vi.hoisted(() => ({ list: vi.fn(), listUnwraps: vi.fn(), lookup: vi.fn() }))
vi.mock('@tari-project/wxtm-bridge-backend-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tari-project/wxtm-bridge-backend-api')>()),
  OotleWrapTokenService: { getOotleUserWrapTransactions: mocks.list, lookupOotleWraps: mocks.lookup },
  OotleTokensUnwrappedService: { getOotleUserUnwrapTransactions: mocks.listUnwraps },
}))

const { fromOotleWrap, getOotleTransactions } = await import('./use-bridge-transaction')
const { saveOotleWrapCapability } = await import('@/utils/ootle-wrap-capabilities')
const useAppStore = (await import('@/store/app')).default

const ME = 'otl_esm_me'
const PAYMENT_ID = '00000000-0000-4000-8000-000000000001'
const row = (reference: string): OotleUserWrapTransactionDTO => ({
  reference,
  toChainId: baseSepolia.id,
  createdAt: '2026-11-10T10:00:00.000Z',
  status: OotleUserWrapTransactionDTO.status.SUCCESS,
})
const details: OotleWrapDetailsDTO = {
  ...row('ref-known'),
  status: OotleWrapDetailsDTO.status.SUCCESS,
  paymentId: PAYMENT_ID,
  destinationAddress: '0x1111111111111111111111111111111111111111',
  tokenAmount: '1000000',
  amountAfterFee: '995000',
  feeAmount: '5000',
  transactionHash: '0xabc',
}

const store = new Map<string, string>()
beforeEach(() => {
  vi.resetAllMocks()
  store.clear()
  vi.stubGlobal('window', {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
  })
  useAppStore.setState({ network: 'esmeralda' })
  mocks.list.mockResolvedValue({ transactions: [row('ref-known'), row('ref-other')], total: 2 })
  mocks.listUnwraps.mockResolvedValue({ transactions: [], total: 0 })
})

describe('Ootle wrap history (M2)', () => {
  it('marks a listing row without lookup details as detailsHidden', () => {
    const tx = fromOotleWrap(row('ref-other'))
    expect(tx).toMatchObject({ paymentId: 'ref-other', detailsHidden: true, ootleChainId: baseSepolia.id })
    expect(tx.transactionHash).toBeUndefined()
  })

  it('looks up the wraps it holds tokens for and merges the details by reference', async () => {
    saveOotleWrapCapability('esmeralda', ME, { paymentId: PAYMENT_ID, clientToken: 'secret-token' })
    mocks.lookup.mockResolvedValue({ transactions: [details] })

    const { wraps } = await getOotleTransactions(ME)

    expect(mocks.lookup).toHaveBeenCalledWith({ wraps: [{ paymentId: PAYMENT_ID, clientToken: 'secret-token' }] })
    expect(wraps[0]).toMatchObject({
      paymentId: 'ref-known',
      tokenAmount: '1000000',
      destinationAddress: details.destinationAddress,
      transactionHash: '0xabc',
    })
    expect(wraps[0].detailsHidden).toBeUndefined()
    expect(wraps[1]).toMatchObject({ paymentId: 'ref-other', detailsHidden: true })
  })

  it('skips the lookup without tokens and survives a failed lookup without logging the token', async () => {
    await getOotleTransactions(ME)
    expect(mocks.lookup).not.toHaveBeenCalled()

    saveOotleWrapCapability('esmeralda', ME, { paymentId: PAYMENT_ID, clientToken: 'secret-token' })
    const { ApiError } = await import('@tari-project/wxtm-bridge-backend-api')
    mocks.lookup.mockRejectedValue(
      new ApiError(
        { method: 'POST', url: '/ootle/wrap-token/lookup', body: { wraps: [{ clientToken: 'secret-token' }] } },
        { url: '', ok: false, status: 500, statusText: 'err', body: { message: 'boom' } },
        'Internal Server Error',
      ),
    )
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { wraps } = await getOotleTransactions(ME)
    expect(wraps.every((w) => w.detailsHidden)).toBe(true)
    expect(JSON.stringify(logged.mock.calls)).not.toContain('secret-token')
  })
})
