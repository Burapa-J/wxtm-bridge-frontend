import { describe, expect, it } from 'vitest'
import { bech32, bech32m } from 'bech32'
import { isOotleAddress, isOotleParamsForNetwork } from './ootle-address'

// account key + view key
const KEYS = new Uint8Array(64).fill(7)

function encode(prefix: string): string {
  return bech32m.encode(prefix, bech32m.toWords(KEYS), 1023)
}

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
