import { RistrettoPoint } from '@noble/curves/ed25519'
// The helper module only: the package root also pulls in its node clients.
import { decodeOotleAddress } from '@tari-project/ootle-ts-bindings/dist/helpers/ootleAddress'

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

function isRistrettoPoint(hex: string): boolean {
  try {
    RistrettoPoint.fromHex(hex)
    return true
  } catch {
    return false
  }
}

// A full Ootle address on Universe's network: decoded with the canonical Ootle decoder (the one the
// processor uses), on that network, with account and view keys that are valid Ristretto255 points.
// A checksum-valid address with a bad key would otherwise pass, and wTARI burned to it is never paid out.
export function isOotleAddress(address: string, network: string | undefined): boolean {
  const name = network?.toLowerCase()
  if (!name || !getOotleAddressPrefix(name)) return false
  try {
    const decoded = decodeOotleAddress(address)
    return (
      decoded.network === name && isRistrettoPoint(decoded.accountPublicKey) && isRistrettoPoint(decoded.viewOnlyKey)
    )
  } catch {
    return false
  }
}
