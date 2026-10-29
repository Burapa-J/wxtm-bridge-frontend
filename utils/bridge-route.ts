import { getDeployments, WagmiAddress } from '@tari-project/wxtm-bridge-contracts/deployments'
import { GetOotleWrapTokenParamsRespDTO, OotlePublicEvmChainDTO } from '@tari-project/wxtm-bridge-backend-api'
import { mainnet, sepolia } from 'viem/chains'
import type { Network } from '@/components/network-box'
import type { NetworkOption } from '@/store/bridge'
import { config } from '@/config'
import { KNOWN_EVM_CHAINS } from './evm-chains'

export type AssetConfig = {
  kind: 'wxtm' | 'ootle'
  tariNetwork: 'Tari' | 'Ootle'
  tariToken: string
  evmToken: string
  chainId: number
  chainName: string
  status: 'active' | 'unwrap_only'
  tariDecimals: number
  evmDecimals: number
  minAmount: number
  maxAmount: number
  highThreshold: number
  tokenAddress: WagmiAddress
  bridgeAddress: WagmiAddress
  explorerUrl: string
  wrapFeeBps: number
  unwrapFeeBps: number
}

export type BridgeRoute = {
  asset: AssetConfig
  // true when going from the Tari side (Tari or Ootle) to the EVM chain
  isWrapping: boolean
}

const TARI_ICON = '/icons/tari.png'
const EVM_ICON = '/icons/eth.png'

export function getExplorerUrl(chainId: number): string {
  return KNOWN_EVM_CHAINS[chainId]?.blockExplorers?.default.url ?? ''
}

// wXTM follows the connected wallet's chain when it has a wXTM deployment, as before.
export function getWxtmAsset(
  connectedChainId: number | undefined,
  isMainNet: boolean,
  wrapFeeBps: number,
  unwrapFeeBps: number,
): AssetConfig {
  let chainId: number = isMainNet ? mainnet.id : sepolia.id
  if (connectedChainId !== undefined && getDeployments(connectedChainId).wXTM) {
    chainId = connectedChainId
  }
  const deployments = getDeployments(chainId)

  return {
    kind: 'wxtm',
    tariNetwork: 'Tari',
    tariToken: 'XTM',
    evmToken: 'wXTM',
    chainId,
    chainName: 'Ethereum',
    status: 'active',
    tariDecimals: 6,
    evmDecimals: 18,
    minAmount: config.MIN_BRIDGE_AMOUNT,
    maxAmount: config.MAX_BRIDGE_AMOUNT,
    highThreshold: config.HIGH_BRIDGE_THRESHOLD,
    tokenAddress: deployments.wXTM as WagmiAddress,
    bridgeAddress: deployments.wXTMBridge as WagmiAddress,
    explorerUrl: getExplorerUrl(chainId),
    wrapFeeBps,
    unwrapFeeBps,
  }
}

// One asset per params chain that is active or unwrap_only, compiled into the frontend,
// and whose wTARI addresses match the contracts package.
export function getOotleAssets(params: GetOotleWrapTokenParamsRespDTO): AssetConfig[] {
  const assets: AssetConfig[] = []

  for (const chain of params.chains) {
    let status: AssetConfig['status']
    if (chain.status === OotlePublicEvmChainDTO.status.ACTIVE) {
      status = 'active'
    } else if (chain.status === OotlePublicEvmChainDTO.status.UNWRAP_ONLY) {
      status = 'unwrap_only'
    } else {
      continue
    }

    if (!KNOWN_EVM_CHAINS[chain.chainId]) {
      console.warn(`[ TAPPLET-BRIDGE ] chain ${chain.chainId} (${chain.name}) is not known to this frontend; hiding it`)
      continue
    }

    const deployments = getDeployments(chain.chainId)
    if (
      !deployments.wTARI ||
      !deployments.wTARIBridge ||
      deployments.wTARI.toLowerCase() !== chain.wTARI.toLowerCase() ||
      deployments.wTARIBridge.toLowerCase() !== chain.wTARIBridge.toLowerCase()
    ) {
      console.warn(
        `[ TAPPLET-BRIDGE ] wTARI addresses for chain ${chain.chainId} do not match the deployments; hiding it`,
      )
      continue
    }

    assets.push({
      kind: 'ootle',
      tariNetwork: 'Ootle',
      tariToken: 'TARI',
      evmToken: 'wTARI',
      chainId: chain.chainId,
      chainName: chain.name,
      status,
      tariDecimals: 6,
      evmDecimals: 18,
      minAmount: config.MIN_BRIDGE_AMOUNT,
      maxAmount: config.MAX_BRIDGE_AMOUNT,
      highThreshold: config.HIGH_BRIDGE_THRESHOLD,
      tokenAddress: deployments.wTARI,
      bridgeAddress: deployments.wTARIBridge,
      explorerUrl: chain.explorerUrl,
      wrapFeeBps: params.wrapTokenFeePercentageBps,
      unwrapFeeBps: params.unwrapTokenFeePercentageBps,
    })
  }

  return assets
}

function isEvmFor(option: NetworkOption, asset: AssetConfig): boolean {
  return typeof option === 'object' && option.asset === asset.kind && option.chainId === asset.chainId
}

// The same selector entry; the wXTM chain follows the wallet, so wXTM entries match on asset alone.
function isSameOption(a: NetworkOption, b: NetworkOption): boolean {
  if (typeof a !== 'object' || typeof b !== 'object') return a === b
  return a.asset === b.asset && (a.asset === 'wxtm' || a.chainId === b.chainId)
}

// Valid routes: Tari <-> the wXTM chain, and Ootle <-> each wTARI chain (wrapping only to active chains).
export function deriveRoute(from: NetworkOption, to: NetworkOption, assets: AssetConfig[]): BridgeRoute | undefined {
  for (const asset of assets) {
    if (from === asset.tariNetwork && isEvmFor(to, asset) && asset.status === 'active') {
      return { asset, isWrapping: true }
    }
    if (to === asset.tariNetwork && isEvmFor(from, asset)) {
      return { asset, isWrapping: false }
    }
  }
  return undefined
}

// The networks the selector offers: each asset's Tari side and its EVM chain.
export function getNetworkChoices(assets: AssetConfig[]): Network[] {
  const networks: Network[] = []
  for (const asset of assets) {
    if (!networks.some((n) => n.name === asset.tariNetwork)) {
      networks.push({ name: asset.tariNetwork, icon: TARI_ICON, token: asset.tariToken, option: asset.tariNetwork })
    }
    if (!networks.some((n) => isEvmFor(n.option, asset))) {
      networks.push({
        name: asset.chainName,
        icon: EVM_ICON,
        token: asset.evmToken,
        option: { kind: 'evm', chainId: asset.chainId, asset: asset.kind },
      })
    }
  }
  return networks
}

export function hasRouteFrom(network: Network, networks: Network[], assets: AssetConfig[]): boolean {
  return networks.some((other) => deriveRoute(network.option, other.option, assets) !== undefined)
}

export function hasRouteTo(network: Network, networks: Network[], assets: AssetConfig[]): boolean {
  return networks.some((other) => deriveRoute(other.option, network.option, assets) !== undefined)
}

// Picking a network keeps the other side when the pair is valid, otherwise picks the first valid partner.
export function pickNetwork(
  type: 'from' | 'to',
  picked: Network,
  from: Network,
  to: Network,
  networks: Network[],
  assets: AssetConfig[],
): { from: Network; to: Network } | undefined {
  if (type === 'from') {
    if (deriveRoute(picked.option, to.option, assets)) return { from: picked, to }
    for (const other of networks) {
      if (deriveRoute(picked.option, other.option, assets)) return { from: picked, to: other }
    }
  } else {
    if (deriveRoute(from.option, picked.option, assets)) return { from, to: picked }
    for (const other of networks) {
      if (deriveRoute(other.option, picked.option, assets)) return { from: other, to: picked }
    }
  }
  return undefined
}

// Resolves the stored selection against the current networks; falls back to the first route.
export function resolveSelection(
  fromOption: NetworkOption,
  toOption: NetworkOption,
  networks: Network[],
  assets: AssetConfig[],
): { from: Network; to: Network; route: BridgeRoute } {
  const from = networks.find((n) => isSameOption(n.option, fromOption))
  const to = networks.find((n) => isSameOption(n.option, toOption))
  if (from && to) {
    const route = deriveRoute(from.option, to.option, assets)
    if (route) return { from, to, route }
  }

  // assets[0] is always the wXTM asset, which is active.
  const asset = assets[0]
  return {
    from: networks.find((n) => n.option === asset.tariNetwork) as Network,
    to: networks.find((n) => isEvmFor(n.option, asset)) as Network,
    route: { asset, isWrapping: true },
  }
}

// The asset a transaction belongs to: its Ootle chain's asset, otherwise wXTM (always assets[0]).
// undefined for an Ootle chain the params no longer offer.
export function getTransactionAsset(ootleChainId: number | undefined, assets: AssetConfig[]): AssetConfig | undefined {
  if (ootleChainId === undefined) return assets[0]
  return assets.find((a) => a.kind === 'ootle' && a.chainId === ootleChainId)
}

// Labels for an Ootle transaction on a chain the params no longer offer.
export function getUnlistedOotleLabels(chainId: number): { tariToken: string; evmToken: string; chainName: string } {
  return { tariToken: 'TARI', evmToken: 'wTARI', chainName: KNOWN_EVM_CHAINS[chainId]?.name ?? String(chainId) }
}

export function amountAfterFee(value: bigint, feeBps: number): bigint {
  return value - (value * BigInt(feeBps)) / BigInt(10000)
}

// An 18-decimal EVM amount in 6-decimal Tari units, rounded down, as a string.
export function evmToTariUnits(value: bigint): string {
  return (value / BigInt(10) ** BigInt(12)).toString()
}
