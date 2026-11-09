// Drives the real unwrap hook (outside React, wagmi stubbed) to check the chain registry is re-read
// right before the irreversible burn.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baseSepolia } from 'viem/chains'
import type { AssetConfig } from '@/utils/bridge-route'

const mocks = vi.hoisted(() => ({
  writeContract: vi.fn(),
  refreshOotleRegistry: vi.fn(),
  signTypedData: vi.fn(),
}))

vi.mock('zustand', async () => {
  const { createStore } = await import('zustand/vanilla')
  type StateCreator<T> = import('zustand/vanilla').StateCreator<T>
  return {
    create:
      () =>
      <T,>(init: StateCreator<T>) => {
        const api = createStore<T>()(init)
        const hook = (selector: (s: T) => unknown = (s) => s) => selector(api.getState())
        return Object.assign(hook, api)
      },
  }
})
vi.mock('i18next', () => ({ default: { getFixedT: () => (key: string) => key } }))
vi.mock('wagmi', () => ({
  useConfig: () => ({}),
  useConnection: () => ({ chainId: baseSepolia.id }),
  useSwitchChain: () => ({ switchChainAsync: vi.fn() }),
  useReadContract: () => ({ data: ['0x0f', 'wTARI', '1', BigInt(baseSepolia.id), '0x1111111111111111111111111111111111111111', '0x', []] }),
  useWriteContract: () => ({ mutateAsync: mocks.writeContract, isPending: false, isSuccess: false, isError: false }),
}))
vi.mock('wagmi/actions', () => ({ getWalletClient: async () => ({ signTypedData: mocks.signTypedData }) }))
vi.mock('@/store/account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/account')>()),
  refreshOotleRegistry: mocks.refreshOotleRegistry,
}))
vi.mock('@tari-project/wxtm-bridge-backend-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tari-project/wxtm-bridge-backend-api')>()),
  OotleTokensUnwrappedService: { getOotleRemainingDailyLimit: vi.fn(async () => '1000000000000') },
}))

const { useBridgeStore } = await import('@/store/bridge')
const useAppStore = (await import('@/store/app')).default
const { bech32m } = await import('bech32')
const { useBridgeToTari } = await import('./use-bridge-to-tari')

const ASSET = {
  kind: 'ootle',
  chainId: baseSepolia.id,
  chainName: 'Base Sepolia',
  evmToken: 'wTARI',
  status: 'active',
  tokenAddress: '0x1111111111111111111111111111111111111111',
  bridgeAddress: '0x2222222222222222222222222222222222222222',
  unwrapFeeBps: 40,
} as unknown as AssetConfig
const ME = '0x3333333333333333333333333333333333333333'
const SIGNATURE = `0x${'11'.repeat(32)}${'22'.repeat(32)}1b`
const encode = (hex: string) =>
  bech32m.encode('otl_esm_', bech32m.toWords(Uint8Array.from(Buffer.from(hex, 'hex'))), 1023)
const DEST = encode('e2f2ae0a6abc4e71a884a961c500515f58e30b6aa582dd8db6a65945e08d2d76'.repeat(2))

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'debug').mockImplementation(() => {})
  mocks.signTypedData.mockResolvedValue(SIGNATURE)
  mocks.writeContract.mockResolvedValue('0xhash')
  useBridgeStore.setState({ bridgeError: '' })
  useAppStore.setState({ network: 'esmeralda' })
})

describe('useBridgeToTari on an Ootle route (C15c)', () => {
  it('burns when the fresh registry still lists the chain with the same addresses', async () => {
    mocks.refreshOotleRegistry.mockResolvedValue([ASSET])
    expect(await useBridgeToTari(ME, ASSET).bridgeToTari('1', ME, DEST)).toBe(true)
    expect(mocks.writeContract).toHaveBeenCalledTimes(1)
    // re-read after the signature prompt, immediately before the burn
    expect(mocks.signTypedData.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.refreshOotleRegistry.mock.invocationCallOrder[0],
    )
    expect(mocks.refreshOotleRegistry.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.writeContract.mock.invocationCallOrder[0],
    )
  })

  it('still burns on an unwrap_only chain', async () => {
    mocks.refreshOotleRegistry.mockResolvedValue([{ ...ASSET, status: 'unwrap_only' }])
    expect(await useBridgeToTari(ME, ASSET).bridgeToTari('1', ME, DEST)).toBe(true)
    expect(mocks.writeContract).toHaveBeenCalledTimes(1)
  })

  it('does not burn after the chain was disabled during the session', async () => {
    // disabled chains are dropped from the fresh asset list
    mocks.refreshOotleRegistry.mockResolvedValue([])
    expect(await useBridgeToTari(ME, ASSET).bridgeToTari('1', ME, DEST)).toBe(false)
    expect(mocks.writeContract).not.toHaveBeenCalled()
    expect(useBridgeStore.getState().bridgeError).toBe('ootle_chain_unavailable')
  })

  it('does not burn when the registry cannot be read', async () => {
    mocks.refreshOotleRegistry.mockResolvedValue(undefined)
    expect(await useBridgeToTari(ME, ASSET).bridgeToTari('1', ME, DEST)).toBe(false)
    expect(mocks.writeContract).not.toHaveBeenCalled()
    expect(useBridgeStore.getState().bridgeError).toBe('ootle_chain_check_failed')
  })
})

describe('useBridgeToTari destination check (C26)', () => {
  it('refuses a checksum-valid destination with invalid keys before any signature or burn', async () => {
    mocks.refreshOotleRegistry.mockResolvedValue([ASSET])
    expect(await useBridgeToTari(ME, ASSET).bridgeToTari('1', ME, encode('ff'.repeat(64)))).toBe(false)
    expect(useBridgeStore.getState().bridgeError).toBe('invalid_ootle_address')
    expect(mocks.signTypedData).not.toHaveBeenCalled()
    expect(mocks.writeContract).not.toHaveBeenCalled()
  })
})
