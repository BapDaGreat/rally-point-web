import { beforeEach, describe, expect, it, vi } from 'vitest'
import { demoStore } from './demoStore'

vi.mock('./supabase', () => ({ isDemoMode: true, supabase: null }))
vi.mock('./demoStore', () => ({
  demoStore: {
    payMembership: vi.fn(),
  },
}))

describe('api membership renewal in demo mode', () => {
  beforeEach(() => vi.clearAllMocks())

  it('delegates safely without requiring a Supabase client', async () => {
    const { api } = await import('./api')

    await expect(
      api.payMembership('member-1', 2500, 'user-1'),
    ).resolves.toBeUndefined()
    expect(demoStore.payMembership).toHaveBeenCalledWith(
      'member-1',
      2500,
      'user-1',
    )
  })
})
