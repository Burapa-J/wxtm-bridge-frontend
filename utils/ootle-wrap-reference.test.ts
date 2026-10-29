import { describe, expect, it } from 'vitest'
import { ootleWrapReference } from './ootle-wrap-reference'

describe('ootleWrapReference', () => {
  it('matches the backend derivation', () => {
    // node -e 'crypto.createHash("sha256").update("ootle-wrap-reference:" + id).digest("hex").slice(0, 16)'
    expect(ootleWrapReference('9b2f4c1e-3a5d-4e6f-8a7b-1c2d3e4f5a6b')).toBe('1ef58d2c1b5acd02')
  })
})
