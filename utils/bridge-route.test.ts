import { afterEach, describe, expect, it, vi } from 'vitest'
import { GetOotleWrapTokenParamsRespDTO, OotlePublicEvmChainDTO } from '@tari-project/wxtm-bridge-backend-api'
import { base, baseSepolia, mainnet, sepolia } from 'viem/chains'
import {
  amountAfterFee,
  deriveRoute,
  evmToTariUnits,
  getNetworkChoices,
  getOotleAssets,
  getSafeExplorerUrl,
  getTransactionAsset,
  getWxtmAsset,
  isSameOption,
  networkOptionKey,
  pickNetwork,
} from './bridge-route'
import { KNOWN_EVM_CHAINS } from './evm-chains'

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
    [chains.sepolia.id]: {
      wTARI: '0x7777777777777777777777777777777777777777',
      wTARIBridge: '0x8888888888888888888888888888888888888888',
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
    explorerUrl: `${KNOWN_EVM_CHAINS[chainId]?.blockExplorers?.default.url ?? 'https://unknown.example'}/`,
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
    // count only this test's calls; spies made while collecting other suites are reused
    warn.mockClear()

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
      explorerUrl: baseSepolia.blockExplorers.default.url,
      wrapFeeBps: 30,
      unwrapFeeBps: 40,
    })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain(String(UNKNOWN_CHAIN_ID))
  })

  it('labels chains with the viem name, not the params name', () => {
    const [asset] = getOotleAssets(params([chain(baseSepolia.id, OotlePublicEvmChainDTO.status.ACTIVE, 'Ethereum')]))
    expect(asset.chainName).toBe(baseSepolia.name)
  })

  it('hides disabled chains', () => {
    expect(
      getOotleAssets(params([chain(baseSepolia.id, OotlePublicEvmChainDTO.status.DISABLED, 'Base Sepolia')])),
    ).toEqual([])
  })

  it('refuses a chain whose params addresses do not match getDeployments', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    warn.mockClear()
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
  const wxtm = getWxtmAsset(undefined, true, 50, 50)
  const assets = [wxtm, ...getOotleAssets(fixture)]
  const activeChain = { kind: 'evm' as const, chainId: baseSepolia.id, asset: 'ootle' as const }
  const retiringChain = { kind: 'evm' as const, chainId: base.id, asset: 'ootle' as const }
  const unknownChain = { kind: 'evm' as const, chainId: UNKNOWN_CHAIN_ID, asset: 'ootle' as const }
  const ethereum = { kind: 'evm' as const, chainId: wxtm.chainId, asset: 'wxtm' as const }

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
  it('follows the wallet onto a wXTM chain, even one that also has wTARI', () => {
    expect(getWxtmAsset(baseSepolia.id, false, 50, 50).chainId).toBe(baseSepolia.id)
  })
})

describe('wXTM and wTARI on the same chain', () => {
  it('stay two distinct network options with separate routes', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wxtm = getWxtmAsset(sepolia.id, false, 50, 50)
    const assets = [
      wxtm,
      ...getOotleAssets(params([chain(sepolia.id, OotlePublicEvmChainDTO.status.ACTIVE, 'Sepolia')])),
    ]
    const wxtmOption = { kind: 'evm' as const, chainId: sepolia.id, asset: 'wxtm' as const }
    const wtariOption = { kind: 'evm' as const, chainId: sepolia.id, asset: 'ootle' as const }

    expect(wxtm.chainId).toBe(sepolia.id)
    expect(getNetworkChoices(assets).map((n) => n.option)).toEqual(['Tari', wxtmOption, 'Ootle', wtariOption])
    expect(deriveRoute('Tari', wxtmOption, assets)?.asset.kind).toBe('wxtm')
    expect(deriveRoute('Ootle', wtariOption, assets)?.asset.kind).toBe('ootle')
    expect(deriveRoute('Tari', wtariOption, assets)).toBeUndefined()
    expect(deriveRoute('Ootle', wxtmOption, assets)).toBeUndefined()
    expect(deriveRoute(wtariOption, 'Tari', assets)).toBeUndefined()
    expect(deriveRoute(wxtmOption, 'Ootle', assets)).toBeUndefined()
  })
})

describe('getTransactionAsset', () => {
  it('picks the Ootle chain asset, else wXTM', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const assets = [getWxtmAsset(undefined, true, 50, 50), ...getOotleAssets(fixture)]

    expect(getTransactionAsset(undefined, assets)?.kind).toBe('wxtm')
    expect(getTransactionAsset(base.id, assets)?.chainId).toBe(base.id)
    expect(getTransactionAsset(UNKNOWN_CHAIN_ID, assets)).toBeUndefined()
  })
})

describe('getSafeExplorerUrl', () => {
  const known = baseSepolia.blockExplorers.default.url

  it('accepts an https params URL on the known explorer host', () => {
    expect(getSafeExplorerUrl(baseSepolia.id, `${known}/`)).toBe(known)
  })

  it('falls back to the known explorer otherwise', () => {
    expect(getSafeExplorerUrl(baseSepolia.id, known.replace('https:', 'http:'))).toBe(known)
    expect(getSafeExplorerUrl(baseSepolia.id, 'https://evil.example')).toBe(known)
    expect(getSafeExplorerUrl(baseSepolia.id, 'javascript:alert(1)')).toBe(known)
    expect(getSafeExplorerUrl(baseSepolia.id, 'not a url')).toBe(known)
  })

  it('gives nothing for a chain without a known explorer', () => {
    expect(getSafeExplorerUrl(UNKNOWN_CHAIN_ID, 'https://explorer.example')).toBe('')
  })
})

describe('evmToTariUnits', () => {
  it('converts an after-fee amount with more than 6 decimals without throwing', () => {
    // 1234.567891 at 50 bps is 1228.395051545
    const value = BigInt(1234567891) * BigInt(10) ** BigInt(12)
    expect(evmToTariUnits(amountAfterFee(value, 50))).toBe('1228395051')
    expect(evmToTariUnits(value)).toBe('1234567891')
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

describe('isSameOption and networkOptionKey', () => {
  const wxtmOnSepolia = { kind: 'evm' as const, chainId: sepolia.id, asset: 'wxtm' as const }
  const wxtmOnMainnet = { kind: 'evm' as const, chainId: mainnet.id, asset: 'wxtm' as const }
  const wtariOnSepolia = { kind: 'evm' as const, chainId: sepolia.id, asset: 'ootle' as const }
  const wtariOnBase = { kind: 'evm' as const, chainId: base.id, asset: 'ootle' as const }

  it('tells wXTM and wTARI apart on the same chain', () => {
    expect(isSameOption(wxtmOnSepolia, wtariOnSepolia)).toBe(false)
    expect(networkOptionKey(wxtmOnSepolia)).not.toBe(networkOptionKey(wtariOnSepolia))
  })

  it('matches wTARI by chain and wXTM on asset alone', () => {
    expect(isSameOption(wtariOnSepolia, wtariOnBase)).toBe(false)
    expect(isSameOption(wtariOnSepolia, { ...wtariOnSepolia })).toBe(true)
    expect(isSameOption(wxtmOnSepolia, wxtmOnMainnet)).toBe(true)
  })

  it('matches the Tari side by name', () => {
    expect(isSameOption('Tari', 'Tari')).toBe(true)
    expect(isSameOption('Tari', 'Ootle')).toBe(false)
    expect(isSameOption('Ootle', wtariOnSepolia)).toBe(false)
    expect(networkOptionKey('Ootle')).toBe('Ootle')
  })
})
