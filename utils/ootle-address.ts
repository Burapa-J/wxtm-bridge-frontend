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

// The backend's Ootle network ('esmeralda' | 'mainnet') must be Universe's, and the cold account
// must be an address on it; otherwise deposits could go to the wrong network or a bogus address.
export function isOotleParamsForNetwork(
  ootleNetwork: string,
  coldAccountAddress: string,
  network: string | undefined,
): boolean {
  if (!network || ootleNetwork.toLowerCase() !== network.toLowerCase()) return false
  return isOotleAddress(coldAccountAddress, network)
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
