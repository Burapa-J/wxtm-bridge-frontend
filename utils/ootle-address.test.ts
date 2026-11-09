import { describe, expect, it } from 'vitest'
import { bech32, bech32m } from 'bech32'
import { isOotleAddress, isOotleParamsForNetwork } from './ootle-address'

// account key + view key: the Ristretto255 basepoint and the identity, both valid points
const BASEPOINT = 'e2f2ae0a6abc4e71a884a961c500515f58e30b6aa582dd8db6a65945e08d2d76'
const KEYS = Uint8Array.from(Buffer.from(BASEPOINT + '00'.repeat(32), 'hex'))

function encode(prefix: string, keys: Uint8Array = KEYS): string {
  return bech32m.encode(prefix, bech32m.toWords(keys), 1023)
}

const withKeys = (account: string, view: string) => Uint8Array.from(Buffer.from(account + view, 'hex'))

describe('isOotleAddress', () => {
  it('accepts otl_esm_ addresses on Esmeralda only', () => {
    const address = encode('otl_esm_')
    expect(isOotleAddress(address, 'esmeralda')).toBe(true)
    expect(isOotleAddress(address, 'Esmeralda')).toBe(true)
    expect(isOotleAddress(address.toUpperCase(), 'esmeralda')).toBe(true)
    expect(isOotleAddress(address, 'mainnet')).toBe(false)
  })

  it('accepts otl_ addresses on mainnet only', () => {
    const address = encode('otl_')
    expect(isOotleAddress(address, 'mainnet')).toBe(true)
    expect(isOotleAddress(address, 'esmeralda')).toBe(false)
  })

  it('rejects networks without Ootle', () => {
    expect(isOotleAddress(encode('otl_esm_'), 'nextnet')).toBe(false)
    expect(isOotleAddress(encode('otl_esm_'), undefined)).toBe(false)
  })

  it('rejects malformed addresses', () => {
    const address = encode('otl_esm_')
    const lastChar = address.slice(-1) === 'q' ? 'p' : 'q'
    expect(isOotleAddress(address.slice(0, -1) + lastChar, 'esmeralda')).toBe(false)
    expect(isOotleAddress(bech32.encode('otl_esm_', bech32.toWords(KEYS), 1023), 'esmeralda')).toBe(false)
    expect(isOotleAddress('0x1234567890123456789012345678901234567890', 'esmeralda')).toBe(false)
    expect(isOotleAddress('', 'esmeralda')).toBe(false)
  })

  // C26: checksum and prefix are fine, the keys are not.
  it('rejects a checksum-valid address whose keys are not Ristretto points', () => {
    // the review's proof address: 64 0xff bytes
    const allFf = 'otl_esm_1llllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllc4arh2e'
    expect(bech32m.decode(allFf, 1023).prefix).toBe('otl_esm_')
    expect(isOotleAddress(allFf, 'esmeralda')).toBe(false)
    // non-canonical ("negative") encodings, in either key slot
    expect(isOotleAddress(encode('otl_esm_', withKeys('07'.repeat(32), BASEPOINT)), 'esmeralda')).toBe(false)
    expect(isOotleAddress(encode('otl_esm_', withKeys(BASEPOINT, '07'.repeat(32))), 'esmeralda')).toBe(false)
  })

  it('rejects a payload too short to hold both keys', () => {
    expect(isOotleAddress(encode('otl_esm_', Uint8Array.from(Buffer.from(BASEPOINT, 'hex'))), 'esmeralda')).toBe(false)
  })

  it('accepts a valid address carrying a destination tag, like the processor', () => {
    const tagged = new Uint8Array([...KEYS, ...new TextEncoder().encode('tag')])
    expect(isOotleAddress(encode('otl_esm_', tagged), 'esmeralda')).toBe(true)
  })
})

describe('isOotleParamsForNetwork', () => {
  it("accepts params for Universe's network with a cold account on it", () => {
    expect(isOotleParamsForNetwork('esmeralda', encode('otl_esm_'), 'esmeralda')).toBe(true)
    expect(isOotleParamsForNetwork('mainnet', encode('otl_'), 'MainNet')).toBe(true)
  })

  it('rejects a network mismatch', () => {
    expect(isOotleParamsForNetwork('esmeralda', encode('otl_esm_'), 'mainnet')).toBe(false)
    expect(isOotleParamsForNetwork('mainnet', encode('otl_'), 'esmeralda')).toBe(false)
    expect(isOotleParamsForNetwork('esmeralda', encode('otl_esm_'), undefined)).toBe(false)
  })

  it('rejects a cold account that is not an address on the network', () => {
    expect(isOotleParamsForNetwork('esmeralda', encode('otl_'), 'esmeralda')).toBe(false)
    expect(isOotleParamsForNetwork('esmeralda', 'otl_esm_cold', 'esmeralda')).toBe(false)
    expect(isOotleParamsForNetwork('esmeralda', '', 'esmeralda')).toBe(false)
  })
})
