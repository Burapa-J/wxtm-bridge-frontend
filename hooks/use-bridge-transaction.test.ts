import { describe, expect, it, vi } from 'vitest'
import { fetchAllPages } from './use-bridge-transaction'

describe('fetchAllPages', () => {
  it('pages until total is reached', async () => {
    const fetchPage = vi.fn(async (_limit: number, offset: number) => ({
      transactions: offset < 150 ? Array(Math.min(100, 150 - offset)).fill(offset) : [],
      total: 150,
    }))
    expect((await fetchAllPages(fetchPage)).length).toBe(150)
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('stops at the page cap when total never stops growing', async () => {
    const fetchPage = vi.fn(async () => ({ transactions: [1], total: Number.MAX_SAFE_INTEGER }))
    await fetchAllPages(fetchPage)
    expect(fetchPage).toHaveBeenCalledTimes(50)
  })

  it('stops when total is not a finite number', async () => {
    const fetchPage = vi.fn(async () => ({ transactions: [1], total: 'lots' as unknown as number }))
    await fetchAllPages(fetchPage)
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })
})
