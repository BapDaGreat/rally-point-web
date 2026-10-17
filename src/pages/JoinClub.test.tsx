import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyClub, Profile, PublicClub } from '../types'
import { JoinClubPage } from './JoinClub'

const davao: PublicClub = { id: 'club-davao', slug: 'rally-point-davao', name: 'Rally Point Davao' }
const gensanMembership: MyClub = { club_id: 'club-gensan', slug: 'rally-point-gensan', name: 'Rally Point Gensan', role: 'member' }
const davaoMembership: MyClub = { club_id: 'club-davao', slug: 'rally-point-davao', name: 'Rally Point Davao', role: 'member' }
const player: Profile = { id: 'user-1', email: 'player@example.invalid', full_name: 'Pat Player', role: 'member', created_at: '2026-01-01T00:00:00.000Z' }

const state = vi.hoisted(() => ({
  user: null as Profile | null,
  clubs: [] as MyClub[],
  publicClub: null as PublicClub | null,
  joinClub: vi.fn(),
  switchClub: vi.fn(),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: state.user,
    loading: false,
    demo: true,
    clubs: state.clubs,
    activeClub: state.clubs[0] ?? null,
    joinClub: state.joinClub,
    switchClub: state.switchClub,
    signIn: vi.fn(),
    signUpMember: vi.fn(),
    resetPassword: vi.fn(),
    signOut: vi.fn(),
    refresh: vi.fn(),
  }),
}))

vi.mock('../lib/api', () => ({
  api: { publicClub: vi.fn(async () => state.publicClub) },
}))

function Where() {
  return <p>At {useLocation().pathname}</p>
}

function renderJoin() {
  return render(
    <MemoryRouter initialEntries={['/join/rally-point-davao']}>
      <Routes>
        <Route path="/join/:slug" element={<JoinClubPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.user = null
  state.clubs = []
  state.publicClub = davao
  state.joinClub.mockReset()
  state.switchClub.mockReset()
})

describe('JoinClubPage', () => {
  it('explains an invalid club link', async () => {
    state.publicClub = null
    renderJoin()
    expect(await screen.findByRole('heading', { name: 'This club link is not valid' })).toBeInTheDocument()
  })

  it('offers sign-up into the named club when nobody is signed in', async () => {
    renderJoin()
    expect(await screen.findByText('Joining Rally Point Davao')).toBeInTheDocument()
    expect(screen.getByText('Create member account')).toBeInTheDocument()
  })

  it('lets a signed-in player confirm joining and lands them in the club', async () => {
    state.user = player
    state.clubs = [gensanMembership]
    state.joinClub.mockResolvedValue(davaoMembership)
    const user = userEvent.setup()
    renderJoin()
    await user.click(await screen.findByRole('button', { name: 'Join Rally Point Davao' }))
    expect(state.joinClub).toHaveBeenCalledWith('rally-point-davao')
    expect(await screen.findByText('At /member')).toBeInTheDocument()
  })

  it('shows join errors without leaving the page', async () => {
    state.user = player
    state.clubs = [gensanMembership]
    state.joinClub.mockRejectedValue(new Error('This club link is not valid'))
    const user = userEvent.setup()
    renderJoin()
    await user.click(await screen.findByRole('button', { name: 'Join Rally Point Davao' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This club link is not valid')
  })

  it('switches to the club when the player already belongs to it', async () => {
    state.user = player
    state.clubs = [gensanMembership, davaoMembership]
    const user = userEvent.setup()
    renderJoin()
    await user.click(await screen.findByRole('button', { name: 'Go to Rally Point Davao' }))
    expect(state.switchClub).toHaveBeenCalledWith('club-davao')
    expect(await screen.findByText('At /member')).toBeInTheDocument()
  })

  it('tells platform accounts they cannot join clubs', async () => {
    state.user = { ...player, role: 'superadmin' }
    renderJoin()
    expect(await screen.findByText(/cannot join as members/)).toBeInTheDocument()
    expect(state.joinClub).not.toHaveBeenCalled()
  })
})
