import useAppStore from '@/store/app'
import { createConfig, createStorage, cookieStorage, fallback, http, Transport } from 'wagmi'
import { walletConnect } from 'wagmi/connectors'
import type { Chain } from 'viem'
import { KNOWN_EVM_CHAINS } from './evm-chains'

export function getConfig(id?: string) {
  const { walletConnectProjectId, ethereumNodes } = useAppStore.getState()
  const projectId = id || walletConnectProjectId

  const urlsByChain = new Map(ethereumNodes.map((node) => [Number(node.chainId), node.urls]))

  // Prefer the backend-served public RPC nodes; fall back to viem's defaults
  // when the backend has no nodes for a chain (or the list could not be fetched).
  const transportFor = (chainId: number) => {
    const urls = urlsByChain.get(chainId)?.filter((url) => url.trim() !== '')
    return urls?.length ? fallback(urls.map((url) => http(url))) : http()
  }

  const chains = Object.values(KNOWN_EVM_CHAINS) as [Chain, ...Chain[]]
  const transports: Record<number, Transport> = {}
  for (const chain of chains) {
    transports[chain.id] = transportFor(chain.id)
  }

  return createConfig({
    chains,
    transports,
    connectors: [
      walletConnect({
        projectId: projectId,
      }),
    ],
    storage: createStorage({
      storage: cookieStorage,
    }),
    ssr: true,
  })
}
