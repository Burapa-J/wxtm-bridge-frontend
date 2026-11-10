// Drives the real Ootle wrap hook (outside React) against an in-memory Universe slot with deferred
// backend/Universe responses, to check who owns the recovery record when starts overlap.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baseSepolia } from 'viem/chains'
import type TariL1Signer from '@/clients/tari-l1-signer'
import type { BridgeTxDetails } from '@/clients/tari-l1-signer'

// zustand's React binding needs a renderer; read the vanilla store directly instead.
vi.mock('zustand', async () => {
  const { createStore } = await import('zustand/vanilla')
  type StateCreator<T> = import('zustand/vanilla').StateCreator<T>
  return {
    create:
      () =>
      <T>(init: StateCreator<T>) => {
        const api = createStore<T>()(init)
        const hook = (selector: (s: T) => unknown = (s) => s) => selector(api.getState())
        return Object.assign(hook, api)
      },
  }
})
vi.mock('i18next', () => ({ default: { getFixedT: () => (key: string) => key } }))
vi.mock('./use-wallet', () => ({
  useWalletUtils: () => ({ addTokenToWalletAction: vi.fn(), isWalletOnChain: () => false }),
}))
vi.mock('./use-bridge-transaction', () => ({
  useBridgeTransaction: () => ({ getUserBackendBridgeTxs: vi.fn(async () => {}) }),
}))
vi.mock('@/clients/tari-ootle-signer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/clients/tari-ootle-signer')>()),
  sendOotleStealth: vi.fn(),
  waitOotleTransaction: vi.fn(),
}))
vi.mock('@tari-project/wxtm-bridge-backend-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tari-project/wxtm-bridge-backend-api')>()),
  OotleWrapTokenService: { createOotleWrapTokenTransaction: vi.fn(), updateOotleToTokensSent: vi.fn() },
}))

const { OotleWrapTokenService } = await import('@tari-project/wxtm-bridge-backend-api')
const { sendOotleStealth, waitOotleTransaction } = await import('@/clients/tari-ootle-signer')
const { useTariAccountStore } = await import('@/store/account')
const { useBridgeStore } = await import('@/store/bridge')
const useTariSigner = (await import('@/store/signer')).default
const { useBridgeOotleToEvm, removeStoredWrap } = await import('./use-bridge-ootle-to-evm')
const useAppStore = (await import('@/store/app')).default
const { ApiError } = await import('@tari-project/wxtm-bridge-backend-api')
const { loadOotleWrapCapabilities } = await import('@/utils/ootle-wrap-capabilities')

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}
const flush = () => new Promise((r) => setTimeout(r, 0))

// Universe's single ongoing-tx slot.
function fakeSigner() {
  const slot: { value?: BridgeTxDetails } = {}
  const signer = {
    getOngoingBridgeTx: vi.fn(async () => slot.value),
    setOngoingBridgeTx: vi.fn(async (tx: BridgeTxDetails) => {
      slot.value = { ...tx }
      return true
    }),
    removeOngoingBridgeTx: vi.fn(async () => {
      slot.value = undefined
      return true
    }),
  }
  return { slot, signer: signer as unknown as TariL1Signer & typeof signer }
}

const ASSET = { chainId: baseSepolia.id, kind: 'ootle' } as never
const ARGS = {
  amount: '1',
  evmAddress: '0x1111111111111111111111111111111111111111',
  amountAfterFee: '0.99',
  asset: ASSET,
}
const create = vi.mocked(OotleWrapTokenService.createOotleWrapTokenTransaction)
const send = vi.mocked(sendOotleStealth)
const wait = vi.mocked(waitOotleTransaction)

let tu: ReturnType<typeof fakeSigner>

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'debug').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  tu = fakeSigner()
  useTariSigner.setState({ signer: tu.signer })
  useTariAccountStore.setState({
    ootleAccount: { address: 'otl_esm_me', network: 'esmeralda' },
    ongoingBridgeTx: undefined,
  })
  useBridgeStore.setState({
    ootleWrapInFlightId: '',
    bridgeStartId: '',
    bridgeError: '',
    ootleColdAccountAddress: 'otl_cold',
    ootleDepositsReady: true,
  })
  useAppStore.setState({ network: 'esmeralda' })
  const local = new Map<string, string>()
  vi.stubGlobal('window', {
    localStorage: { getItem: (k: string) => local.get(k) ?? null, setItem: (k: string, v: string) => local.set(k, v) },
  })
  vi.mocked(OotleWrapTokenService.updateOotleToTokensSent).mockResolvedValue(undefined as never)
})

describe('Ootle wrap start ownership (C15a)', () => {
  it('a second start while the first is creating is refused and cannot touch the first record', async () => {
    const createA = deferred<{ paymentId: string; clientToken: string }>()
    const sendA = deferred<{ transactionId: string }>()
    create.mockReturnValueOnce(createA.promise as never)
    send.mockReturnValueOnce(sendA.promise)
    wait.mockResolvedValue({ status: 'Accepted' } as never)

    const { bridgeOotleToEvm } = useBridgeOotleToEvm()
    const a = bridgeOotleToEvm(ARGS)
    await flush()
    expect(create).toHaveBeenCalledTimes(1)
    // B starts while A's create is still pending
    await bridgeOotleToEvm(ARGS)
    expect(useBridgeStore.getState().bridgeError).toBe('bridge_start_in_progress')
    expect(create).toHaveBeenCalledTimes(1)

    createA.resolve({ paymentId: 'pA', clientToken: 'tokenA' })
    await flush()
    expect(tu.slot.value).toMatchObject({ paymentId: 'pA', clientToken: 'tokenA' })
    expect(useBridgeStore.getState().ootleWrapInFlightId).toBe('pA')

    // C starts while A's send is pending
    useBridgeStore.setState({ bridgeError: '' })
    await bridgeOotleToEvm(ARGS)
    expect(useBridgeStore.getState().bridgeError).not.toBe('')
    expect(create).toHaveBeenCalledTimes(1)
    expect(tu.slot.value).toMatchObject({ paymentId: 'pA', clientToken: 'tokenA' })

    sendA.resolve({ transactionId: 'txA' })
    await a
    // confirmed: token dropped, record kept for display, everything released
    expect(tu.slot.value).toMatchObject({ paymentId: 'pA' })
    expect(tu.slot.value?.clientToken).toBeUndefined()
    expect(useBridgeStore.getState().ootleWrapInFlightId).toBe('')
    expect(useBridgeStore.getState().bridgeStartId).toBe('')
  })

  it('does not overwrite another wrap clientToken that appears in TU before the first write', async () => {
    const other = { paymentId: 'pOther', clientToken: 'tokenOther', network: 'Ootle' } as BridgeTxDetails
    // empty for the unfinished check, then another instance's record appears
    tu.signer.getOngoingBridgeTx.mockResolvedValueOnce(undefined)
    tu.slot.value = other
    create.mockResolvedValueOnce({ paymentId: 'pB', clientToken: 'tokenB' } as never)

    await useBridgeOotleToEvm().bridgeOotleToEvm(ARGS)

    expect(tu.signer.setOngoingBridgeTx).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(tu.slot.value).toEqual(other)
    expect(useBridgeStore.getState().bridgeError).toBe('ootle_wrap_unfinished')
    expect(useBridgeStore.getState().ootleWrapInFlightId).toBe('')
  })

  it('a busy refusal only removes its own record', async () => {
    create.mockResolvedValueOnce({ paymentId: 'pB', clientToken: 'tokenB' } as never)
    send.mockImplementationOnce(async () => {
      // another wrap's record lands in TU while this send is being refused
      tu.slot.value = { paymentId: 'pA', clientToken: 'tokenA', network: 'Ootle' } as BridgeTxDetails
      const { OotleSignerError } = await import('@/clients/tari-ootle-signer')
      throw new OotleSignerError('busy')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await useBridgeOotleToEvm().bridgeOotleToEvm(ARGS)

    expect(tu.slot.value).toMatchObject({ paymentId: 'pA', clientToken: 'tokenA' })
  })

  it('a resumed wrap does not take the lock from the wrap that holds it', async () => {
    useBridgeStore.setState({ ootleWrapInFlightId: 'pA' })
    await useBridgeOotleToEvm().finishOotleWrap({
      paymentId: 'pB',
      clientToken: 'tokenB',
      ootleTransactionId: 'txB',
    } as BridgeTxDetails)
    expect(wait).not.toHaveBeenCalled()
    expect(useBridgeStore.getState().ootleWrapInFlightId).toBe('pA')
  })
})

describe('removeStoredWrap (C15b)', () => {
  it('removes the record only when it holds the given paymentId', async () => {
    tu.slot.value = { paymentId: 'pCurrent', clientToken: 'token' } as BridgeTxDetails
    await removeStoredWrap(tu.signer, 'pOlder')
    await removeStoredWrap(tu.signer, undefined)
    await removeStoredWrap(tu.signer, '')
    expect(tu.slot.value?.paymentId).toBe('pCurrent')
    await removeStoredWrap(tu.signer, 'pCurrent')
    expect(tu.slot.value).toBeUndefined()
  })
})

const PAYMENT_ID = '00000000-0000-4000-8000-0000000000aa'
const apiError = (status: number) =>
  new ApiError(
    { method: 'POST', url: '/ootle/wrap-token' },
    { url: '', ok: false, status, statusText: '', body: { message: 'x' } },
    'x',
  )

describe('Ootle wrap create responses (phase 2)', () => {
  it('keeps the wrap capability from create through confirmation, apart from the ongoing slot', async () => {
    create.mockResolvedValueOnce({ paymentId: PAYMENT_ID, clientToken: 'tokenA' } as never)
    send.mockResolvedValueOnce({ transactionId: 'txA' })
    wait.mockResolvedValue({ status: 'Accepted' } as never)

    await useBridgeOotleToEvm().bridgeOotleToEvm(ARGS)

    expect(loadOotleWrapCapabilities('esmeralda', 'otl_esm_me')).toEqual([
      { paymentId: PAYMENT_ID, clientToken: 'tokenA' },
    ])
    // the ongoing record no longer blocks new bridges
    expect(tu.slot.value?.clientToken).toBeUndefined()
  })

  it.each([
    [429, 'ootle_too_many_open_wraps'],
    [503, 'ootle_deposits_unavailable'],
  ])('maps a %s from create to %s without sending', async (status, key) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    create.mockRejectedValueOnce(apiError(status))
    await useBridgeOotleToEvm().bridgeOotleToEvm(ARGS)
    expect(useBridgeStore.getState().bridgeError).toBe(key)
    expect(send).not.toHaveBeenCalled()
    expect(useBridgeStore.getState().bridgeStartId).toBe('')
  })

  it('does not start while params say deposits are not accepted', async () => {
    useBridgeStore.setState({ ootleDepositsReady: false })
    await useBridgeOotleToEvm().bridgeOotleToEvm(ARGS)
    expect(useBridgeStore.getState().bridgeError).toBe('ootle_deposits_unavailable')
    expect(create).not.toHaveBeenCalled()
  })
})
