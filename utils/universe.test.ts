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

  it('allows only the Tauri webview origins in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
    const { config } = await import('@/config')
    expect(config.UNIVERSE_ORIGINS).toEqual(['tauri://localhost', 'https://tauri.localhost'])
  })

  it('also allows the Universe dev server outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.resetModules()
    const { config } = await import('@/config')
    expect(config.UNIVERSE_ORIGINS).toContain('http://localhost:1420')
    expect(config.UNIVERSE_ORIGINS).not.toContain('http://tauri.localhost')
  })
})
