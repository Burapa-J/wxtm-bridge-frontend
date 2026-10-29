import { afterEach, describe, expect, it, vi } from 'vitest'
import { GetOotleWrapTokenParamsRespDTO, OotlePublicEvmChainDTO } from '@tari-project/wxtm-bridge-backend-api'
import { base, baseSepolia, mainnet, sepolia } from 'viem/chains'
import {
  amountAfterFee,
  deriveRoute,
  getNetworkChoices,
  getOotleAssets,
  getTransactionAsset,
  getWxtmAsset,
  pickNetwork,
} from './bridge-route'

// The contracts package has no wTARI deployments yet, so the tests supply some.
const { WTARI_DEPLOYMENTS } = await vi.hoisted(async () => {
  const chains = await import('viem/chains')
  const deployments: Record<number, { wTARI: `0x${string}`; wTARIBridge: `0x${string}` }> = {
    [chains.baseSepolia.id]: {
      wTARI: '0x1111111111111111111111111111111111111111',
      wTARIBridge: '0x2222222222222222222222222222222222222222',
    },
    [chains.base.id]: {
      wTARI: '0x3333333333333333333333333333333333333333',
      wTARIBridge: '0x4444444444444444444444444444444444444444',
    },
  }
  return { WTARI_DEPLOYMENTS: deployments }
})

vi.mock('@tari-project/wxtm-bridge-contracts/deployments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tari-project/wxtm-bridge-contracts/deployments')>()
  return {
    ...actual,
    getDeployments: (chainId: number) => ({ ...actual.getDeployments(chainId), ...WTARI_DEPLOYMENTS[chainId] }),
  }
})

const UNKNOWN_CHAIN_ID = 999999

function chain(chainId: number, status: OotlePublicEvmChainDTO.status, name: string): OotlePublicEvmChainDTO {
  return {
    chainId,
    status,
    name,
    wTARI: WTARI_DEPLOYMENTS[chainId]?.wTARI ?? '0x5555555555555555555555555555555555555555',
    // params addresses may differ in case from the deployments
    wTARIBridge: (
      WTARI_DEPLOYMENTS[chainId]?.wTARIBridge ?? '0x6666666666666666666666666666666666666666'
    ).toUpperCase(),
    explorerUrl: `https://explorer-${chainId}.example`,
  }
}

function params(chains: OotlePublicEvmChainDTO[]): GetOotleWrapTokenParamsRespDTO {
  return {
    ootleNetwork: GetOotleWrapTokenParamsRespDTO.ootleNetwork.ESMERALDA,
    chains,
    coldAccountAddress: 'otl_esm_cold',
    wrapTokenFeePercentageBps: 30,
    unwrapTokenFeePercentageBps: 40,
  }
}

const fixture = params([
  chain(baseSepolia.id, OotlePublicEvmChainDTO.status.ACTIVE, 'Base Sepolia'),
  chain(base.id, OotlePublicEvmChainDTO.status.UNWRAP_ONLY, 'Base'),
  chain(UNKNOWN_CHAIN_ID, OotlePublicEvmChainDTO.status.ACTIVE, 'Unknown'),
])

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getOotleAssets', () => {
  it('keeps active and unwrap_only chains and hides an unknown chain with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const assets = getOotleAssets(fixture)

    expect(assets.map((a) => [a.chainId, a.status])).toEqual([
      [baseSepolia.id, 'active'],
      [base.id, 'unwrap_only'],
    ])
    expect(assets[0]).toMatchObject({
      kind: 'ootle',
      tariToken: 'TARI',
      evmToken: 'wTARI',
      chainName: 'Base Sepolia',
      tariDecimals: 6,
      evmDecimals: 18,
      tokenAddress: WTARI_DEPLOYMENTS[baseSepolia.id].wTARI,
      bridgeAddress: WTARI_DEPLOYMENTS[baseSepolia.id].wTARIBridge,
      explorerUrl: `https://explorer-${baseSepolia.id}.example`,
      wrapFeeBps: 30,
      unwrapFeeBps: 40,
    })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain(String(UNKNOWN_CHAIN_ID))
  })

  it('hides disabled chains', () => {
    expect(
      getOotleAssets(params([chain(baseSepolia.id, OotlePublicEvmChainDTO.status.DISABLED, 'Base Sepolia')])),
    ).toEqual([])
  })

  it('refuses a chain whose params addresses do not match getDeployments', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mismatched = {
      ...chain(baseSepolia.id, OotlePublicEvmChainDTO.status.ACTIVE, 'Base Sepolia'),
      wTARI: '0x9999999999999999999999999999999999999999',
    }

    expect(getOotleAssets(params([mismatched]))).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('refuses a known chain without a wTARI deployment', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(getOotleAssets(params([chain(mainnet.id, OotlePublicEvmChainDTO.status.ACTIVE, 'Ethereum')]))).toEqual([])
  })
})

describe('deriveRoute', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const wxtm = getWxtmAsset(undefined, true, 50, 50, [])
  const assets = [wxtm, ...getOotleAssets(fixture)]
  const activeChain = { kind: 'evm' as const, chainId: baseSepolia.id }
  const retiringChain = { kind: 'evm' as const, chainId: base.id }
  const unknownChain = { kind: 'evm' as const, chainId: UNKNOWN_CHAIN_ID }
  const ethereum = { kind: 'evm' as const, chainId: wxtm.chainId }

  it('routes Tari <-> Ethereum to wXTM', () => {
    expect(deriveRoute('Tari', ethereum, assets)).toEqual({ asset: wxtm, isWrapping: true })
    expect(deriveRoute(ethereum, 'Tari', assets)).toEqual({ asset: wxtm, isWrapping: false })
  })

  it('wraps Ootle only to active chains', () => {
    expect(deriveRoute('Ootle', activeChain, assets)?.asset.chainId).toBe(baseSepolia.id)
    expect(deriveRoute('Ootle', retiringChain, assets)).toBeUndefined()
    expect(deriveRoute('Ootle', unknownChain, assets)).toBeUndefined()
  })

  it('unwraps to Ootle from active and unwrap_only chains', () => {
    expect(deriveRoute(activeChain, 'Ootle', assets)).toMatchObject({ isWrapping: false })
    expect(deriveRoute(retiringChain, 'Ootle', assets)).toMatchObject({ isWrapping: false })
  })

  it('rejects Tari <-> Ootle and Tari <-> wTARI chains', () => {
    expect(deriveRoute('Tari', 'Ootle', assets)).toBeUndefined()
    expect(deriveRoute('Ootle', 'Tari', assets)).toBeUndefined()
    expect(deriveRoute('Tari', activeChain, assets)).toBeUndefined()
    expect(deriveRoute(retiringChain, 'Tari', assets)).toBeUndefined()
    expect(deriveRoute('Ootle', ethereum, assets)).toBeUndefined()
  })

  it('picks a valid partner when the selected pair is invalid', () => {
    const networks = getNetworkChoices(assets)
    const byName = (name: string) => networks.find((n) => n.name === name)!

    expect(networks.map((n) => n.name)).toEqual(['Tari', 'Ethereum', 'Ootle', 'Base Sepolia', 'Base'])
    expect(pickNetwork('from', byName('Ootle'), byName('Tari'), byName('Ethereum'), networks, assets)).toEqual({
      from: byName('Ootle'),
      to: byName('Base Sepolia'),
    })
    expect(pickNetwork('from', byName('Base'), byName('Ootle'), byName('Base Sepolia'), networks, assets)).toEqual({
      from: byName('Base'),
      to: byName('Ootle'),
    })
  })
})

describe('getWxtmAsset', () => {
  it('follows the wallet onto a wXTM chain', () => {
    expect(getWxtmAsset(baseSepolia.id, false, 50, 50, []).chainId).toBe(baseSepolia.id)
  })

  it('does not follow the wallet onto a wTARI chain, so routes never share a chainId', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ootleAssets = getOotleAssets(fixture)
    const wxtm = getWxtmAsset(
      baseSepolia.id,
      false,
      50,
      50,
      ootleAssets.map((a) => a.chainId),
    )
    const assets = [wxtm, ...ootleAssets]

    expect(wxtm.chainId).toBe(sepolia.id)
    expect(deriveRoute('Tari', { kind: 'evm', chainId: baseSepolia.id }, assets)).toBeUndefined()
    expect(deriveRoute('Ootle', { kind: 'evm', chainId: wxtm.chainId }, assets)).toBeUndefined()
    expect(new Set(getNetworkChoices(assets).map((n) => JSON.stringify(n.option))).size).toBe(5)
  })
})

describe('getTransactionAsset', () => {
  it('picks the Ootle chain asset, else wXTM', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const assets = [getWxtmAsset(undefined, true, 50, 50, []), ...getOotleAssets(fixture)]

    expect(getTransactionAsset(undefined, assets)?.kind).toBe('wxtm')
    expect(getTransactionAsset(base.id, assets)?.chainId).toBe(base.id)
    expect(getTransactionAsset(UNKNOWN_CHAIN_ID, assets)).toBeUndefined()
  })
})

describe('amountAfterFee', () => {
  const oneThousand = BigInt(1000) * BigInt(10) ** BigInt(18)

  it('takes the fee in basis points', () => {
    expect(amountAfterFee(oneThousand, 50)).toBe(BigInt(995) * BigInt(10) ** BigInt(18))
    expect(amountAfterFee(oneThousand, 0)).toBe(oneThousand)
    expect(amountAfterFee(oneThousand, 10000)).toBe(BigInt(0))
    expect(amountAfterFee(BigInt(10001), 1)).toBe(BigInt(10000))
  })
})
