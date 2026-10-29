import { describe, expect, it } from 'vitest'
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
