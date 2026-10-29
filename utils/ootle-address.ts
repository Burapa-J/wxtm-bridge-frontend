import { bech32m } from 'bech32'

// Ootle addresses run well past bech32's 90-character default limit.
const MAX_ADDRESS_LENGTH = 1023

// The bech32m prefix for the Universe network from getNetwork(); undefined where Ootle has none.
export function getOotleAddressPrefix(network: string | undefined): string | undefined {
  const name = network?.toLowerCase()
  if (name === 'mainnet') return 'otl_'
  if (name === 'esmeralda') return 'otl_esm_'
  return undefined
}

export function isOotleAddress(address: string, network: string | undefined): boolean {
  const prefix = getOotleAddressPrefix(network)
  if (!prefix) return false
  try {
    return bech32m.decode(address, MAX_ADDRESS_LENGTH).prefix === prefix
  } catch {
    return false
  }
}
