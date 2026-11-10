import type { Chain } from 'viem'
import { arbitrum, arbitrumSepolia, base, baseSepolia, mainnet, sepolia } from 'viem/chains'

// Every EVM chain the bridge can talk to, keyed by chainId. wagmi needs each chain at config time,
// so this is the only frontend file that changes when the backend adds a new chain.
export const KNOWN_EVM_CHAINS: Record<number, Chain> = {
  [mainnet.id]: mainnet,
  [sepolia.id]: sepolia,
  [base.id]: base,
  [baseSepolia.id]: baseSepolia,
  [arbitrum.id]: arbitrum,
  [arbitrumSepolia.id]: arbitrumSepolia,
}
