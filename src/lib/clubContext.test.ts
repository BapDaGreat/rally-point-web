import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CLUB_HEADER,
  clubAwareFetch,
  isDatabaseRequest,
  rememberClub,
  rememberedClub,
  requireActiveClubId,
  setActiveClubId,
} from './clubContext'

const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}'))

function sentHeaders(): Headers {
  const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit | undefined
  return new Headers(init?.headers)
}

beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  setActiveClubId(null)
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('club context', () => {
  it('adds the active club to database requests', async () => {
    setActiveClubId('club-davao')
    await clubAwareFetch('https://example.supabase.co/rest/v1/members?select=*', { headers: { apikey: 'publishable' } })
    expect(sentHeaders().get(CLUB_HEADER)).toBe('club-davao')
    expect(sentHeaders().get('apikey')).toBe('publishable')
  })

  it('never sends the club header to sign-in requests', async () => {
    setActiveClubId('club-davao')
    await clubAwareFetch('https://example.supabase.co/auth/v1/token?grant_type=password', { headers: { apikey: 'publishable' } })
    expect(sentHeaders().has(CLUB_HEADER)).toBe(false)
  })

  it('keeps a club a page already named for its own request', async () => {
    setActiveClubId('club-davao')
    await clubAwareFetch('https://example.supabase.co/rest/v1/public_schedule', { headers: { [CLUB_HEADER]: 'club-tv' } })
    expect(sentHeaders().get(CLUB_HEADER)).toBe('club-tv')
  })

  it('sends no club header before a club is chosen', async () => {
    await clubAwareFetch('https://example.supabase.co/rest/v1/rpc/list_my_clubs', { method: 'POST' })
    expect(sentHeaders().has(CLUB_HEADER)).toBe(false)
  })

  it('recognises database paths and refuses club-scoped work without a club', () => {
    expect(isDatabaseRequest('https://example.supabase.co/rest/v1/clubs')).toBe(true)
    expect(isDatabaseRequest(new URL('https://example.supabase.co/auth/v1/user'))).toBe(false)
    expect(() => requireActiveClubId()).toThrow('No club is selected')
  })

  it('remembers the last club per person and tolerates blocked storage', () => {
    rememberClub('user-1', 'club-davao')
    expect(rememberedClub('user-1')).toBe('club-davao')
    expect(rememberedClub('user-2')).toBeNull()
    const blocked = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(rememberedClub('user-1')).toBeNull()
    blocked.mockRestore()
  })
})
