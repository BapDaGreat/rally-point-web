import { render, screen } from '@testing-library/react'
import { MemoryRouter, type InitialEntry } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyClub, Profile } from '../types'
import { PrivacyNoticePage } from './PrivacyNoticePage'

const auth = vi.hoisted(() => ({
  user: null as Profile | null,
  activeClub: null as MyClub | null,
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: auth.user,
    activeClub: auth.activeClub,
    clubs: auth.activeClub ? [auth.activeClub] : [],
    switchClub: vi.fn(),
    signOut: vi.fn(),
  }),
}))

vi.mock('../lib/api', () => ({
  api: { publicClub: vi.fn() },
}))

import { api } from '../lib/api'

const davao: MyClub = { club_id: 'club-davao', slug: 'rally-point-davao', name: 'Rally Point Davao', role: 'member' }

const member = {
  id: 'member-1',
  email: 'member@example.com',
  full_name: 'Mia Member',
  role: 'member',
  created_at: '2026-09-01T00:00:00.000Z',
} satisfies Profile

function renderNotice(entry: InitialEntry = '/privacy') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <PrivacyNoticePage />
    </MemoryRouter>,
  )
}

describe('PrivacyNoticePage', () => {
  beforeEach(() => {
    auth.user = null
    auth.activeClub = null
    vi.mocked(api.publicClub).mockReset().mockResolvedValue({ id: 'club-davao', slug: 'rally-point-davao', name: 'Rally Point Davao' })
  })

  it('shows the requested privacy topics and provisional contact details', () => {
    renderNotice()

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Notice' })).toBeInTheDocument()
    expect(screen.getByText('For bRineLy booking portal users')).toBeInTheDocument()
    expect(screen.getByText('Stay in the brine. Play more.')).toBeInTheDocument()
    expect(screen.getByText('Last updated: November 22, 2026')).toBeInTheDocument()
    expect(screen.queryByText(/Rally Point Gensan/)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Who we are' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Personal information we collect' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Why we use information and lawful bases' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Who can see information' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Club pages and public information' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Retention and security' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your rights under RA 10173' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Privacy contact' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Details to confirm before this notice is official' })).toBeInTheDocument()
    expect(screen.getByText(/whether that invitation was claimed or cancelled/)).toBeInTheDocument()
    expect(screen.getByText(/embeds OpenStreetMap/)).toBeInTheDocument()
    expect(screen.getByText(/through Resend/)).toBeInTheDocument()
    expect(screen.getByText(/no-reply@brinely\.info/)).toBeInTheDocument()
    expect(screen.getByText(/live setting has not been verified/)).toBeInTheDocument()
    expect(screen.getByText(/payment instructions, including an account name or number and a QR image/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'admin@brinely.info' })).toHaveAttribute(
      'href',
      'mailto:admin@brinely.info',
    )
    expect(screen.getByText(/provisional contact pending confirmation/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to login' })).toHaveAttribute('href', '/login')
    expect(api.publicClub).not.toHaveBeenCalled()
  })

  it("names a join link's club, leaves out Gensan's email, and goes back to that join link", async () => {
    renderNotice('/privacy?club=rally-point-davao')

    expect(await screen.findByText('For Rally Point Davao players on the bRineLy booking portal')).toBeInTheDocument()
    expect(api.publicClub).toHaveBeenCalledWith('rally-point-davao')
    expect(screen.queryByText(/Gensan/)).not.toBeInTheDocument()
    expect(screen.getByText(/ask the staff at Rally Point Davao/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to sign-up' })).toHaveAttribute('href', '/join/rally-point-davao')
  })

  it('stays neutral when a join link names a club that cannot be found', async () => {
    vi.mocked(api.publicClub).mockResolvedValue(null)
    renderNotice('/privacy?club=missing-club')

    expect(await screen.findByText(/ask the staff at your club/)).toBeInTheDocument()
    expect(screen.getByText('For bRineLy booking portal users')).toBeInTheDocument()
    expect(screen.queryByText(/Gensan/)).not.toBeInTheDocument()
  })

  it('keeps the menu for a signed-in member and returns them to Help', () => {
    auth.user = member
    auth.activeClub = davao
    renderNotice({ pathname: '/privacy', state: { from: '/member/help' } })

    expect(screen.getByText('For Rally Point Davao players on the bRineLy booking portal')).toBeInTheDocument()
    expect(screen.getAllByRole('navigation', { name: 'Main menu' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Back to Help' })).toHaveAttribute('href', '/member/help')
    expect(screen.queryByRole('link', { name: 'Back to login' })).not.toBeInTheDocument()
    expect(api.publicClub).not.toHaveBeenCalled()
  })

  it('ignores a return path that points outside the app', () => {
    renderNotice({ pathname: '/privacy', state: { from: '//example.com/phish' } })

    expect(screen.getByRole('link', { name: 'Back to login' })).toHaveAttribute('href', '/login')
  })
})
