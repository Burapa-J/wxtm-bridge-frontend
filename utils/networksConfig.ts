import { baseSepolia, mainnet, sepolia } from 'viem/chains'

export interface SupportedChain {
  id: number
  name: string
  icon: string
}

// Chains with a wXTM deployment.
export const supportedChains: SupportedChain[] = [
  {
    id: mainnet.id,
    name: 'ETH MAINNET',
    icon: '/eth.png',
  },
  {
    id: sepolia.id,
    name: 'SEPOLIA',
    icon: '/eth.png',
  },
  {
    id: baseSepolia.id,
    name: 'BASE SEPOLIA',
    icon: '/eth.png',
  },
]

export const chainsMap: Record<number, string> = {
  [mainnet.id]: 'ETH MAINNET',
  [sepolia.id]: 'SEPOLIA',
  [baseSepolia.id]: 'BASE SEPOLIA',
}
