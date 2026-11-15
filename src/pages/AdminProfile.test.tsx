import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminClubProfile, ClubAddon } from '../types'
import { emptyClubProfile } from '../lib/clubProfile'
import { AdminProfile } from './AdminProfile'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', email: 'admin@example.com', full_name: 'Ada Admin', role: 'admin', created_at: '2026-09-01T00:00:00.000Z' },
    activeClub: { club_id: 'club-1', slug: 'club-one', name: 'Club One', role: 'admin' },
    clubs: [],
    switchClub: vi.fn(),
    signOut: vi.fn(),
  }),
}))

vi.mock('../lib/api', () => ({
  api: {
    adminClubProfile: vi.fn(),
    updateClubProfile: vi.fn(),
    upsertClubAddon: vi.fn(),
    removeClubAddon: vi.fn(),
    upsertClubCoach: vi.fn(),
    setClubCoachPhoto: vi.fn(),
    removeClubCoach: vi.fn(),
    upsertClubPaymentMethod: vi.fn(),
    setClubPaymentQr: vi.fn(),
    removeClubPaymentMethod: vi.fn(),
    addClubPhoto: vi.fn(),
    removeClubPhoto: vi.fn(),
  },
}))

import { api } from '../lib/api'

const paddles: ClubAddon = {
  id: 'addon-1', club_id: 'club-1', name: 'Paddle rental', description: null, price: 100,
  unit: 'per_hour', is_active: true, position: 0, created_at: '2026-11-15T00:00:00.000Z',
}

const loaded: AdminClubProfile = {
  profile: { ...emptyClubProfile(), about: 'Six indoor courts.', amenities: ['parking'] },
  addons: [paddles, { ...paddles, id: 'addon-2', name: 'Ball rental', price: 50, unit: 'per_item', is_active: false, position: 1 }],
  coaches: [],
  payment_methods: [],
  gallery: [],
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminProfile />
    </MemoryRouter>,
  )
}

describe('AdminProfile', () => {
  beforeEach(() => {
    vi.mocked(api.adminClubProfile).mockReset().mockResolvedValue(loaded)
    vi.mocked(api.updateClubProfile).mockReset().mockResolvedValue(undefined)
    vi.mocked(api.upsertClubAddon).mockReset()
    vi.mocked(api.addClubPhoto).mockReset()
  })

  it('loads the saved profile and lists add-ons, marking hidden ones', async () => {
    renderPage()
    expect(await screen.findByLabelText('About your club')).toHaveValue('Six indoor courts.')
    expect(screen.getByRole('checkbox', { name: 'Parking' })).toBeChecked()
    expect(screen.getByRole('link', { name: /See your club page/ })).toHaveAttribute('href', '/clubs/club-one')

    const addons = within(screen.getByRole('region', { name: 'Add-ons' }))
    expect(addons.getByText('Paddle rental')).toBeInTheDocument()
    expect(addons.getByText('Php 100.00 per hour')).toBeInTheDocument()
    expect(addons.getAllByText('Hidden')).toHaveLength(1)
  })

  it('saves business details, and refuses a Facebook link to another site before sending it', async () => {
    const user = userEvent.setup()
    renderPage()
    const facebook = await screen.findByLabelText('Facebook page link (optional)')

    await user.type(facebook, 'https://facebook.com.evil.example/page')
    await user.click(screen.getByRole('button', { name: 'Save business details' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The Facebook link must start with https://facebook.com/ or https://fb.com/')
    expect(api.updateClubProfile).not.toHaveBeenCalled()

    await user.clear(facebook)
    await user.type(facebook, 'https://facebook.com/clubone   ')
    await user.click(screen.getByRole('checkbox', { name: 'Lights for night play' }))
    await user.click(screen.getByRole('button', { name: 'Save business details' }))
    // The tidied text is what gets sent.
    await waitFor(() => expect(api.updateClubProfile).toHaveBeenCalledWith(expect.objectContaining({
      about: 'Six indoor courts.',
      facebook_url: 'https://facebook.com/clubone',
      amenities: ['night_lights', 'parking'],
    })))
    expect(await screen.findByRole('status')).toHaveTextContent('Saved. Players see it on your club page now.')
  })

  it('keeps the form when a save works but the lists cannot be refreshed', async () => {
    const user = userEvent.setup()
    vi.mocked(api.adminClubProfile).mockReset()
      .mockResolvedValueOnce(loaded)
      .mockRejectedValueOnce(new Error('Network error'))
    renderPage()
    const about = await screen.findByLabelText('About your club')
    await user.click(screen.getByRole('button', { name: 'Save business details' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Saved. Players see it on your club page now. The lists could not be refreshed, so reload the page to see the latest.',
    )
    expect(about).toHaveValue('Six indoor courts.')
    expect(screen.queryByText(/could not be loaded/)).not.toBeInTheDocument()
  })

  it('makes the other save buttons wait while one save is running', async () => {
    const user = userEvent.setup()
    let finish = () => {}
    vi.mocked(api.updateClubProfile).mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Save business details' }))

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save rules and terms' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save payment note' })).toBeDisabled()

    finish()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save rules and terms' })).toBeEnabled())
  })

  it('refreshes the gallery when one of several photos fails, and keeps the caption', async () => {
    const user = userEvent.setup()
    const stored = {
      id: 'g-1', club_id: 'club-1', path: 'club-1/gallery/a.webp', url: 'https://example.test/a.webp',
      caption: 'Opening night', position: 0, created_at: '2026-11-15T00:00:00.000Z',
    }
    vi.mocked(api.adminClubProfile).mockReset()
      .mockResolvedValueOnce(loaded)
      .mockResolvedValue({ ...loaded, gallery: [stored] })
    vi.mocked(api.addClubPhoto).mockReset()
      .mockResolvedValueOnce(stored)
      .mockRejectedValueOnce(new Error('The upload failed'))
    renderPage()

    const gallery = within(await screen.findByRole('region', { name: 'Photo gallery' }))
    await user.type(gallery.getByLabelText(/Caption/), 'Opening night')
    const files = ['a', 'b', 'c'].map((name) => new File(['x'], `${name}.jpg`, { type: 'image/jpeg' }))
    await user.upload(gallery.getByLabelText('Add photos'), files)

    expect(await screen.findByRole('alert')).toHaveTextContent('1 added, then: The upload failed')
    expect(api.addClubPhoto).toHaveBeenCalledTimes(2)
    // The list was refreshed after the failure, so the photo that did save shows.
    expect(await gallery.findByText('1 of 12 photos.', { exact: false })).toBeInTheDocument()
    expect(gallery.getByLabelText(/Caption/)).toHaveValue('Opening night')
  })

  it('adds an add-on with its price and unit', async () => {
    const user = userEvent.setup()
    vi.mocked(api.upsertClubAddon).mockResolvedValue({ ...paddles, id: 'addon-3', name: 'Towels' })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Add an add-on' }))

    const form = within(screen.getByRole('form', { name: 'Add an add-on' }))
    await user.type(form.getByLabelText('Name'), 'Towels')
    await user.type(form.getByLabelText('Price (Php)'), '20')
    await user.selectOptions(form.getByLabelText('Charged'), 'per_item')
    await user.click(form.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(api.upsertClubAddon).toHaveBeenCalledWith({
      id: undefined, name: 'Towels', description: null, price: 20, unit: 'per_item', is_active: true,
    }))
  })

  it('says so when the profile cannot be loaded, and can try again', async () => {
    vi.mocked(api.adminClubProfile).mockRejectedValueOnce(new Error('admin access required'))
    renderPage()
    expect(await screen.findByText(/The business profile could not be loaded/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByLabelText('About your club')).toHaveValue('Six indoor courts.')
  })
})
