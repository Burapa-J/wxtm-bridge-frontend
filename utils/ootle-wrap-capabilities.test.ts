import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_OOTLE_WRAP_CAPABILITIES,
  loadOotleWrapCapabilities,
  saveOotleWrapCapability,
} from './ootle-wrap-capabilities'

const store = new Map<string, string>()
const localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
}
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

beforeEach(() => {
  store.clear()
  vi.stubGlobal('window', { localStorage })
})

describe('Ootle wrap capabilities', () => {
  it('keeps them per network and Ootle account', () => {
    saveOotleWrapCapability('esmeralda', 'otl_esm_a', { paymentId: uuid(1), clientToken: 'tA' })
    saveOotleWrapCapability('Esmeralda', 'otl_esm_b', { paymentId: uuid(2), clientToken: 'tB' })
    expect(loadOotleWrapCapabilities('esmeralda', 'otl_esm_a')).toEqual([{ paymentId: uuid(1), clientToken: 'tA' }])
    expect(loadOotleWrapCapabilities('esmeralda', 'otl_esm_b')).toEqual([{ paymentId: uuid(2), clientToken: 'tB' }])
    expect(loadOotleWrapCapabilities('mainnet', 'otl_esm_a')).toEqual([])
    expect(loadOotleWrapCapabilities(undefined, 'otl_esm_a')).toEqual([])
  })

  it('keeps the newest 50, newest first, without duplicates', () => {
    for (let i = 0; i < MAX_OOTLE_WRAP_CAPABILITIES + 5; i++) {
      saveOotleWrapCapability('esmeralda', 'otl_esm_a', { paymentId: uuid(i), clientToken: `t${i}` })
    }
    saveOotleWrapCapability('esmeralda', 'otl_esm_a', { paymentId: uuid(10), clientToken: 't10-again' })
    const caps = loadOotleWrapCapabilities('esmeralda', 'otl_esm_a')
    expect(caps).toHaveLength(MAX_OOTLE_WRAP_CAPABILITIES)
    expect(caps[0]).toEqual({ paymentId: uuid(10), clientToken: 't10-again' })
    expect(caps[1].paymentId).toBe(uuid(MAX_OOTLE_WRAP_CAPABILITIES + 4))
    expect(caps.filter((c) => c.paymentId === uuid(10))).toHaveLength(1)
  })

  it('ignores malformed entries and storage it cannot use', () => {
    store.set(
      'ootleWrapCapabilities:esmeralda:otl_esm_a',
      JSON.stringify([{ paymentId: 'nope', clientToken: 'x' }, { paymentId: uuid(1), clientToken: 'ok', extra: 1 }, 7]),
    )
    expect(loadOotleWrapCapabilities('esmeralda', 'otl_esm_a')).toEqual([{ paymentId: uuid(1), clientToken: 'ok' }])
    store.set('ootleWrapCapabilities:esmeralda:otl_esm_a', '{not json')
    expect(loadOotleWrapCapabilities('esmeralda', 'otl_esm_a')).toEqual([])
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('denied')
      },
    })
    expect(() =>
      saveOotleWrapCapability('esmeralda', 'otl_esm_a', { paymentId: uuid(1), clientToken: 't' }),
    ).not.toThrow()
    expect(loadOotleWrapCapabilities('esmeralda', 'otl_esm_a')).toEqual([])
  })
})
