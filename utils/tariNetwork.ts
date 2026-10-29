import useAppStore from '@/store/app'
import { getDeployments } from '@tari-project/wxtm-bridge-contracts/deployments'
import { mainnet, sepolia } from 'viem/chains'
import { getExplorerUrl } from './bridge-route'

// wXTM listings carry no chainId, so the explorer follows the Universe network.
function getWxtmChainId(): number {
  return useAppStore.getState().isMainNet ? mainnet.id : sepolia.id
}

export function getEtherscanBaseUrl(): string {
  return getExplorerUrl(getWxtmChainId())
}

export function buildEtherscanLink(transactionHash?: string, explorerUrl = getEtherscanBaseUrl()): string {
  if (transactionHash) {
    return `${explorerUrl}/tx/${transactionHash}`
  }

  return `${explorerUrl}/address/${getDeployments(getWxtmChainId()).wXTM}`
}
