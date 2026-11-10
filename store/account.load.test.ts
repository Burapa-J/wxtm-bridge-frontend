import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baseSepolia } from 'viem/chains'
import { bech32m } from 'bech32'
import { GetOotleWrapTokenParamsRespDTO, OotlePublicEvmChainDTO } from '@tari-project/wxtm-bridge-backend-api'

const mocks = vi.hoisted(() => ({ getParams: vi.fn(), getOotleAccount: vi.fn() }))
const BASE_SEPOLIA = baseSepolia.id
const WTARI = '0x1111111111111111111111111111111111111111'
const WTARI_BRIDGE = '0x2222222222222222222222222222222222222222'

vi.mock('@/contracts/deployments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contracts/deployments')>()
  return {
    ...actual,
    getDeployments: (chainId: number) => ({
      ...actual.getDeployments(chainId),
      ...(chainId === BASE_SEPOLIA ? { wTARI: WTARI, wTARIBridge: WTARI_BRIDGE } : {}),
    }),
  }
})
vi.mock('@tari-project/wxtm-bridge-backend-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tari-project/wxtm-bridge-backend-api')>()),
  OotleWrapTokenService: { getOotleWrapTokenParams: mocks.getParams },
}))
vi.mock('@/clients/tari-ootle-signer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/clients/tari-ootle-signer')>()),
  getOotleAccount: mocks.getOotleAccount,
  getOotleBalance: vi.fn(async () => ({ available: '0', pending: '0' })),
}))

const { loadOotleBridge, useTariAccountStore } = await import('./account')
const { useBridgeStore } = await import('./bridge')
const useAppStore = (await import('./app')).default

const BASEPOINT = 'e2f2ae0a6abc4e71a884a961c500515f58e30b6aa582dd8db6a65945e08d2d76'
const address = (hex: string) =>
  bech32m.encode('otl_esm_', bech32m.toWords(Uint8Array.from(Buffer.from(hex, 'hex'))), 1023)
const VALID = address(BASEPOINT.repeat(2))
const BAD_KEY = address('ff'.repeat(64))

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  useAppStore.setState({ network: 'esmeralda' })
  useTariAccountStore.setState({ ootleAccount: undefined })
  useBridgeStore.setState({ ootleAssets: [], ootleColdAccountAddress: '' })
  mocks.getParams.mockResolvedValue({
    depositAddressReady: true,
    ootleNetwork: GetOotleWrapTokenParamsRespDTO.ootleNetwork.ESMERALDA,
    coldAccountAddress: VALID,
    wrapTokenFeePercentageBps: 30,
    unwrapTokenFeePercentageBps: 40,
    chains: [
      {
        chainId: BASE_SEPOLIA,
        status: OotlePublicEvmChainDTO.status.ACTIVE,
        name: 'Base Sepolia',
        wTARI: WTARI,
        wTARIBridge: WTARI_BRIDGE,
        explorerUrl: '',
      },
    ],
  })
})

describe('loadOotleBridge validates the Universe Ootle account (C26)', () => {
  it('loads a valid account on the current network', async () => {
    mocks.getOotleAccount.mockResolvedValue({ address: VALID, network: 'esmeralda' })
    await loadOotleBridge()
    expect(useTariAccountStore.getState().ootleAccount?.address).toBe(VALID)
    expect(useBridgeStore.getState().ootleAssets).toHaveLength(1)
  })

  it.each([
    ['a key that is not a Ristretto point', { address: BAD_KEY, network: 'esmeralda' }],
    ['another network', { address: VALID, network: 'mainnet' }],
    ['a non-address', { address: 'otl_esm_mine', network: 'esmeralda' }],
  ])('hides Ootle for %s', async (_, account) => {
    mocks.getOotleAccount.mockResolvedValue(account)
    await loadOotleBridge()
    expect(useTariAccountStore.getState().ootleAccount).toBeUndefined()
    expect(useBridgeStore.getState().ootleAssets).toEqual([])
  })
})
