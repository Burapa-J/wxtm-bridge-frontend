import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baseSepolia } from 'viem/chains'
import { bech32m } from 'bech32'
import { GetOotleWrapTokenParamsRespDTO, OotlePublicEvmChainDTO } from '@tari-project/wxtm-bridge-backend-api'

const mocks = vi.hoisted(() => ({ getParams: vi.fn() }))

const WTARI = '0x1111111111111111111111111111111111111111'
const WTARI_BRIDGE = '0x2222222222222222222222222222222222222222'
const BASE_SEPOLIA = baseSepolia.id

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

const { refreshOotleRegistry, useTariAccountStore } = await import('./account')
const { setOotleConfig, useBridgeStore } = await import('./bridge')
const useAppStore = (await import('./app')).default

// A Ristretto basepoint for both keys: a valid Ootle address under the full check too.
const VALID_KEYS = Uint8Array.from(
  Buffer.from('e2f2ae0a6abc4e71a884a961c500515f58e30b6aa582dd8db6a65945e08d2d76'.repeat(2), 'hex'),
)
const COLD = bech32m.encode('otl_esm_', bech32m.toWords(VALID_KEYS), 1023)

function params(
  status: OotlePublicEvmChainDTO.status,
  ootleNetwork = GetOotleWrapTokenParamsRespDTO.ootleNetwork.ESMERALDA,
): GetOotleWrapTokenParamsRespDTO {
  return {
    ootleNetwork,
    coldAccountAddress: COLD,
    wrapTokenFeePercentageBps: 30,
    unwrapTokenFeePercentageBps: 40,
    chains: [
      { chainId: BASE_SEPOLIA, status, name: 'Base Sepolia', wTARI: WTARI, wTARIBridge: WTARI_BRIDGE, explorerUrl: '' },
    ],
  }
}

const statuses = () => useBridgeStore.getState().ootleAssets.map((a) => [a.chainId, a.status])

beforeEach(async () => {
  mocks.getParams.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  useAppStore.setState({ network: 'esmeralda' })
  useTariAccountStore.setState({ ootleAccount: { address: COLD, network: 'esmeralda' } })
  // the session loaded an active chain
  mocks.getParams.mockResolvedValueOnce(params(OotlePublicEvmChainDTO.status.ACTIVE))
  await refreshOotleRegistry()
  expect(statuses()).toEqual([[BASE_SEPOLIA, 'active']])
})

describe('refreshOotleRegistry (C15c)', () => {
  it('applies a status change made after the session loaded', async () => {
    mocks.getParams.mockResolvedValueOnce(params(OotlePublicEvmChainDTO.status.UNWRAP_ONLY))
    await refreshOotleRegistry()
    expect(statuses()).toEqual([[BASE_SEPOLIA, 'unwrap_only']])

    mocks.getParams.mockResolvedValueOnce(params(OotlePublicEvmChainDTO.status.DISABLED))
    expect(await refreshOotleRegistry()).toEqual([])
    expect(statuses()).toEqual([])
  })

  it('keeps the current list and reports undefined when the registry cannot be read', async () => {
    mocks.getParams.mockRejectedValueOnce(new Error('offline'))
    expect(await refreshOotleRegistry()).toBeUndefined()
    expect(statuses()).toEqual([[BASE_SEPOLIA, 'active']])
  })

  it('hides Ootle when the params turn out to be for another network', async () => {
    mocks.getParams.mockResolvedValueOnce(
      params(OotlePublicEvmChainDTO.status.ACTIVE, GetOotleWrapTokenParamsRespDTO.ootleNetwork.MAINNET),
    )
    expect(await refreshOotleRegistry()).toEqual([])
    expect(statuses()).toEqual([])
  })

  it('leaves the selector alone while the Ootle bridge is not loaded', async () => {
    useTariAccountStore.setState({ ootleAccount: undefined })
    setOotleConfig([], '')
    mocks.getParams.mockResolvedValueOnce(params(OotlePublicEvmChainDTO.status.ACTIVE))
    expect(await refreshOotleRegistry()).toHaveLength(1)
    expect(statuses()).toEqual([])
  })

  it('shares one request between concurrent refreshes', async () => {
    mocks.getParams.mockResolvedValue(params(OotlePublicEvmChainDTO.status.ACTIVE))
    await Promise.all([refreshOotleRegistry(), refreshOotleRegistry(), refreshOotleRegistry()])
    expect(mocks.getParams).toHaveBeenCalledTimes(2) // once in beforeEach
  })
})
