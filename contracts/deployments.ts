// Vendored from wxtm-bridge-contracts (see scripts/sync-contracts.mjs); replaces the
// unpublished @tari-project/wxtm-bridge-contracts@0.2.0 `deployments` entry point.
import type { baseSepolia, mainnet, sepolia } from 'viem/chains'
import deployments from './deployments.json'

export type WagmiAddress = `0x${string}`

export interface Deployments {
  wXTM: WagmiAddress
  wXTMBridge: WagmiAddress
  wXTMController: WagmiAddress
  // wTARI set: undefined on chains without a wTARI deployment
  wTARI?: WagmiAddress
  wTARIController?: WagmiAddress
  wTARIBridge?: WagmiAddress
  wTARIBridgeStartBlock?: number
}

export const DEPLOYMENTS_SOURCE: string = deployments.source

const allDeployments = deployments.chains as { [chainId: string]: { [name: string]: string | number } | undefined }

// Chains with a wXTM deployment.
export type WxtmChain = typeof mainnet.id | typeof sepolia.id | typeof baseSepolia.id

// wXTM chains keep the required wXTM fields; any other chain id may lack them.
export function getDeployments(chainId: WxtmChain): Deployments
export function getDeployments(chainId: number): Partial<Deployments>
export function getDeployments(chainId: number): Partial<Deployments> {
  const dep = allDeployments[chainId] ?? {}

  return {
    wXTM: dep.wXTM as WagmiAddress,
    wXTMBridge: dep.wXTMBridge as WagmiAddress,
    wXTMController: dep.wXTMController as WagmiAddress,
    wTARI: dep.wTARI as WagmiAddress | undefined,
    wTARIController: dep.wTARIController as WagmiAddress | undefined,
    wTARIBridge: dep.wTARIBridge as WagmiAddress | undefined,
    wTARIBridgeStartBlock: dep.wTARIBridgeStartBlock as number | undefined,
  }
}
