import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkTappletHost } from './universe'

const ALLOWED = ['tauri://localhost', 'https://tauri.localhost']

describe('checkTappletHost', () => {
  it('trusts a Universe parent', () => {
    expect(checkTappletHost(true, ['tauri://localhost'], ALLOWED)).toBe('trusted')
    expect(checkTappletHost(true, ['https://tauri.localhost', 'https://other.example'], ALLOWED)).toBe('trusted')
  })

  it('rejects an unframed tapplet or another parent origin', () => {
    expect(checkTappletHost(false, ['tauri://localhost'], ALLOWED)).toBe('untrusted')
    expect(checkTappletHost(true, ['https://evil.example'], ALLOWED)).toBe('untrusted')
    expect(checkTappletHost(true, [], ALLOWED)).toBe('untrusted')
  })

  it('cannot verify without ancestorOrigins', () => {
    expect(checkTappletHost(true, undefined, ALLOWED)).toBe('unverified')
  })
})

describe('UNIVERSE_ORIGINS', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('allows only the Tauri webview origins by default, even outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('NEXT_PUBLIC_ALLOW_UNIVERSE_DEV_ORIGIN', '')
    vi.resetModules()
    const { config } = await import('@/config')
    expect(config.UNIVERSE_ORIGINS).toEqual(['tauri://localhost', 'https://tauri.localhost'])
  })

  it('adds the Universe dev server only when opted in, also in production builds', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_ALLOW_UNIVERSE_DEV_ORIGIN', 'true')
    vi.resetModules()
    const { config } = await import('@/config')
    expect(config.UNIVERSE_ORIGINS).toEqual(['tauri://localhost', 'https://tauri.localhost', 'http://localhost:1420'])
  })
})
