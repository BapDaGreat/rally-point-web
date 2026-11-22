import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, MemoryRouter, useLocation } from 'react-router-dom'
import { MemberBook } from './MemberBook'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile, PublicClubDetail, PublicClubListing } from '../types'
import { ClubDetailPage, ClubDirectory } from './Clubs'

const auth = vi.hoisted(() => ({
  user: null as Profile | null,
  listeners: new Set<() => void>(),
  joinClub: vi.fn(),
  signIn: vi.fn(),
  signUpMember: vi.fn(),
}))

vi.mock('../context/AuthContext', async () => {
  const { useSyncExternalStore } = await import('react')
  return {
    useAuth: () => ({
      user: useSyncExternalStore(
        (listener) => {
          auth.listeners.add(listener)
          return () => auth.listeners.delete(listener)
        },
        () => auth.user,
        () => auth.user,
      ),
      joinClub: auth.joinClub,
      signIn: auth.signIn,
      signUpMember: auth.signUpMember,
      verifySignupCode: vi.fn(),
      resendSignupCode: vi.fn(),
      resetPassword: vi.fn(),
      demo: false,
      activeClub: null,
      clubs: [],
      switchClub: vi.fn(),
      signOut: vi.fn(),
    }),
  }
})

vi.mock('../lib/api', () => ({
  api: {
    listPublicClubs: vi.fn(),
    publicClubDetail: vi.fn(),
    publicClubAvailability: vi.fn(),
    memberForUser: vi.fn(),
    listVenues: vi.fn(),
    availability: vi.fn(),
    myBookings: vi.fn(),
    createBooking: vi.fn(),
    checkoutPaymentMethods: vi.fn(),
    releaseBookingHold: vi.fn(),
    submitBookingPayment: vi.fn(),
    myBooking: vi.fn(),
    sendBookingConfirmationEmail: vi.fn(),
  },
}))

import { api } from '../lib/api'

const clubs: PublicClubListing[] = [
  { slug: 'rally-point-davao', name: 'Rally Point Davao', city: 'Davao City', address: 'Lanang', cities: ['Davao City'], venue_count: 1, court_count: 2, min_rate: 450, min_member_rate: 400 },
  { slug: 'rally-point-gensan', name: 'Rally Point Gensan', city: 'General Santos City', address: null, cities: ['General Santos City', 'Koronadal City'], venue_count: 2, court_count: 4, min_rate: 500, min_member_rate: 500 },
]

const gensan: PublicClubDetail = {
  slug: 'rally-point-gensan', name: 'Rally Point Gensan', city: 'General Santos City', address: 'General Santos City',
  venues: [{
    id: 'venue-gensan', name: 'Gensan Main', open_hour: 6, close_hour: 22,
    address: 'Main Road, General Santos City', city: 'General Santos City', latitude: null, longitude: null,
    courts: [
      { id: 'cg1', name: 'Court A', hourly_rate: 500, member_rate: 450, in_service: true },
    ],
  }],
}

const davao: PublicClubDetail = {
  slug: 'rally-point-davao', name: 'Rally Point Davao', city: 'Davao City', address: 'Lanang',
  venues: [{
    id: 'venue-davao', name: 'Davao Main', open_hour: 6, close_hour: 22,
    address: '1 Sample Road, Lanang', city: 'Davao City', latitude: 7.103, longitude: 125.631,
    courts: [
      { id: 'c1', name: 'Davao Court 1', hourly_rate: 450, member_rate: 400, in_service: true },
      { id: 'c2', name: 'Davao Court 2', hourly_rate: 450, member_rate: null, in_service: false },
    ],
  }],
}

const player: Profile = {
  id: 'player-1', email: 'player@example.com', full_name: 'Pia Player', role: 'member', created_at: '2026-09-01T00:00:00.000Z',
}

function Where() {
  const location = useLocation()
  return <p>At {location.pathname}{location.search} {JSON.stringify(location.state)}</p>
}

function renderAt(path: string, withBookingScreen = false) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/clubs" element={<ClubDirectory />} />
        <Route path="/clubs/:slug" element={<ClubDetailPage />} />
        {withBookingScreen ? <Route path="/clubs/:slug/book" element={<MemberBook />} /> : null}
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Find a court', () => {
  beforeEach(() => {
    auth.user = null
    auth.listeners.clear()
    auth.joinClub.mockReset()
    auth.signIn.mockReset()
    auth.signUpMember.mockReset()
    vi.mocked(api.listPublicClubs).mockReset().mockResolvedValue(clubs)
    vi.mocked(api.publicClubDetail).mockReset().mockResolvedValue(davao)
  })

  it('lists clubs with location, size and rates, and filters by city and search', async () => {
    const user = userEvent.setup()
    renderAt('/clubs')

    const davaoLink = await screen.findByRole('link', { name: /Rally Point Davao/ })
    expect(davaoLink).toHaveAttribute('href', '/clubs/rally-point-davao')
    expect(davaoLink).toHaveTextContent('Davao City')
    expect(davaoLink).toHaveTextContent('1 location')
    expect(davaoLink).toHaveTextContent('2 courts')
    expect(davaoLink).toHaveTextContent('From Php 450.00 per hour · Members from Php 400.00')
    // Clubs have no photos yet, so each card shows a drawn court marked as a sample.
    expect(within(davaoLink).getByText('Sample')).toBeInTheDocument()
    const gensanLink = screen.getByRole('link', { name: /Rally Point Gensan/ })
    expect(gensanLink).toHaveTextContent('From Php 500.00 per hour')
    expect(gensanLink).not.toHaveTextContent('Members from')
    expect(screen.getByText('2 clubs')).toBeInTheDocument()

    // A club appears under each of its locations' cities.
    await user.selectOptions(screen.getByLabelText('City'), 'Koronadal City')
    expect(screen.getByRole('link', { name: /Rally Point Gensan/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Rally Point Davao/ })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('City'), '')
    await user.type(screen.getByLabelText('Search'), 'lanang')
    expect(screen.getByRole('link', { name: /Rally Point Davao/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Rally Point Gensan/ })).not.toBeInTheDocument()
    await user.clear(screen.getByLabelText('Search'))
    await user.type(screen.getByLabelText('Search'), 'cebu')
    expect(screen.getByText('No clubs match. Try another name or city.')).toBeInTheDocument()
  })

  it("shows a club's venues and courts with member rates and out-of-service courts", async () => {
    renderAt('/clubs/rally-point-davao')

    const venue = within((await screen.findByRole('heading', { name: 'Davao Main' })).closest('section')!)
    expect(venue.getByText('Open 6:00 AM to 10:00 PM')).toBeInTheDocument()
    expect(venue.getByText('1 Sample Road, Lanang, Davao City')).toBeInTheDocument()
    expect(venue.getByRole('link', { name: 'Get directions' }))
      .toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=7.103,125.631')
    expect(venue.getByTitle('Map of Davao Main').getAttribute('src')).toContain('openstreetmap.org/export/embed.html')
    const court1 = within(venue.getByText('Davao Court 1').closest('li')!)
    expect(court1.getByText('Php 450.00 per hour')).toBeInTheDocument()
    expect(court1.getByText('Members Php 400.00')).toBeInTheDocument()
    expect(court1.getByText('Available')).toBeInTheDocument()
    expect(court1.getByText('Sample')).toBeInTheDocument()
    expect(court1.getByRole('link', { name: /Book Davao Court 1/ })).toHaveAttribute(
      'href',
      '/clubs/rally-point-davao/book?venue=venue-davao&court=c1',
    )
    const court2 = within(venue.getByText('Davao Court 2').closest('li')!)
    expect(court2.getByText('Out of service')).toBeInTheDocument()
    expect(court2.queryByText(/per hour/)).not.toBeInTheDocument()
    expect(court2.queryByRole('link')).not.toBeInTheDocument()
    expect(api.publicClubDetail).toHaveBeenCalledWith('rally-point-davao')
  })

  it('prioritizes Rally Point Gensan and shows featured courts with retry recovery on failure', async () => {
    const user = userEvent.setup()
    vi.mocked(api.listPublicClubs).mockRejectedValueOnce(new Error('Could not load clubs'))
    vi.mocked(api.publicClubDetail).mockResolvedValueOnce(null)
    renderAt('/clubs')

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load clubs')
    vi.mocked(api.listPublicClubs).mockResolvedValueOnce(clubs)
    vi.mocked(api.publicClubDetail).mockResolvedValueOnce(gensan)

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Rally Point Gensan' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Book Court A/ })).toHaveAttribute(
      'href',
      '/clubs/rally-point-gensan/book?venue=venue-gensan&court=cg1',
    )

    const clubLinks = screen.getAllByRole('link', { name: /Rally Point (Gensan|Davao)/ })
    expect(clubLinks[0]).toHaveTextContent('Rally Point Gensan')
  })

  it('lets a visitor browse courts, open the court booking screen, pick date/time, sign in at payment, and checkout', async () => {
    const user = userEvent.setup()
    const slots = Array.from({ length: 16 }, (_, index) => ({ startHour: index + 6, label: `${index + 6}:00`, available: true }))
    const bookingCourt = { id: 'c1', club_id: 'club-davao', venue_id: 'venue-davao', name: 'Davao Court 1', status: 'available' as const, hourly_rate: 450, member_rate: 400 }
    vi.mocked(api.publicClubAvailability).mockResolvedValue([{ court: bookingCourt, slots }])
    vi.mocked(api.availability).mockResolvedValue([{ court: bookingCourt, slots }])
    vi.mocked(api.memberForUser).mockResolvedValue({
      id: 'mem-p', user_id: player.id, member_code: 'RP-900', full_name: player.full_name,
      email: player.email, membership_type: null, status: 'active', join_date: '2026-10-01', expiry_date: null, created_at: '2026-10-01',
    })
    vi.mocked(api.listVenues).mockResolvedValue([{
      id: 'venue-davao', club_id: 'club-davao', slug: 'davao-main', name: 'Davao Main',
      timezone: 'Asia/Manila', open_hour: 6, close_hour: 22, is_active: true,
    }])
    vi.mocked(api.myBookings).mockResolvedValue([])
    vi.mocked(api.checkoutPaymentMethods).mockResolvedValue([
      { id: 'pay-davao', label: 'GCash', account_name: 'Rally Point Davao', account_number: '0917 000 0000', qr_url: null },
    ])
    vi.mocked(api.createBooking).mockResolvedValue({
      id: 'bk-new', club_id: 'club-davao', venue_id: 'venue-davao', court_id: 'c1', member_id: 'mem-p',
      start_at: '2099-09-20T04:00:00.000Z', end_at: '2099-09-20T05:00:00.000Z',
      hours: 1, amount: 450, status: 'pending_payment', payment_method: null, payment_ref: null, created_at: '2099-09-19T00:00:00.000Z', court: bookingCourt,
    })

    auth.joinClub.mockResolvedValue({ club_id: 'club-davao', slug: 'rally-point-davao', name: 'Rally Point Davao', role: 'member' })
    auth.signIn.mockImplementation(async () => {
      auth.user = player
      auth.listeners.forEach((listener) => listener())
      return player
    })

    renderAt('/clubs/rally-point-davao', true)
    await user.click(await screen.findByRole('link', { name: /Book Davao Court 1/ }))

    expect(await screen.findByText(/Available times/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tomorrow' }))
    await user.click(screen.getByRole('button', { name: /12:00 PM/ }))
    await user.click(screen.getByRole('button', { name: /Continue/ }))

    const dialog = await screen.findByRole('dialog', { name: 'Log in' })
    expect(within(dialog).getByText('Login to continue')).toBeInTheDocument()
    expect(within(dialog).getByText('By continuing, you confirm you are booking under your account.')).toBeInTheDocument()
    expect(auth.joinClub).not.toHaveBeenCalled()
    // The 15-minute hold starts only once the visitor has signed in.
    expect(api.createBooking).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText('Email'), player.email)
    await user.type(within(dialog).getByLabelText('Password'), 'secret123')
    const submit = within(dialog).getAllByRole('button', { name: 'Log in' })
      .find((button) => button.getAttribute('type') === 'submit')
    if (!submit) throw new Error('Could not find login submit button')
    await user.click(submit)

    await waitFor(() => expect(auth.joinClub).toHaveBeenCalledWith('rally-point-davao', { asPlayer: true }))
    expect(await screen.findByText('Checkout')).toBeInTheDocument()
    expect(api.createBooking).toHaveBeenCalledWith(expect.objectContaining({ court_id: 'c1', startHour: 12, hours: 1, member_id: 'mem-p', user_id: player.id }))
    expect(screen.getByText('Time left to pay')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /I.ve paid/ })).toBeInTheDocument()
  })

  it('opens the booking environment when clicking the venue CTA', async () => {
    const user = userEvent.setup()
    vi.mocked(api.publicClubAvailability).mockResolvedValue([])
    renderAt('/clubs/rally-point-davao', true)

    await user.click(await screen.findByRole('button', { name: 'Book a court at Davao Main' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Book at Rally Point Davao' })).toBeInTheDocument()
  })

  it('gives visitors log in and sign up, with sign up opening the sign-up tab', async () => {
    renderAt('/clubs')
    await screen.findByRole('link', { name: /Rally Point Davao/ })
    const account = within(screen.getByRole('navigation', { name: 'Account' }))
    expect(account.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
    await userEvent.setup().click(account.getByRole('link', { name: 'Sign up' }))
    expect(await screen.findByText('At /login {"mode":"join"}')).toBeInTheDocument()
  })

  it('shows real photos instead of the sample drawing once a club adds them', async () => {
    vi.mocked(api.listPublicClubs).mockResolvedValue([{ ...clubs[0], cover_photo: 'https://example.test/cover.webp' }])
    vi.mocked(api.publicClubDetail).mockResolvedValue({
      ...davao,
      venues: [{
        ...davao.venues[0],
        cover_photo: 'https://example.test/cover.webp',
        courts: [
          { ...davao.venues[0].courts[0], photos: ['https://example.test/c1-a.webp', 'https://example.test/c1-b.webp'] },
          davao.venues[0].courts[1],
        ],
      }],
    })
    const { unmount } = renderAt('/clubs')
    const card = await screen.findByRole('link', { name: /Rally Point Davao/ })
    expect(within(card).getByRole('img', { name: 'Photo of Rally Point Davao' })).toHaveAttribute('src', 'https://example.test/cover.webp')
    expect(within(card).queryByText('Sample')).not.toBeInTheDocument()
    unmount()

    renderAt('/clubs/rally-point-davao')
    const venue = within((await screen.findByRole('heading', { name: 'Davao Main' })).closest('section')!)
    expect(venue.getByRole('img', { name: 'Cover photo of Davao Main' })).toBeInTheDocument()
    const court1 = within(venue.getByText('Davao Court 1').closest('li')!)
    expect(court1.getByRole('region', { name: /Photos of Davao Court 1/ })).toHaveAttribute('tabindex', '0')
    expect(court1.getByRole('img', { name: 'Davao Court 1, photo 2 of 2' })).toHaveAttribute('src', 'https://example.test/c1-b.webp')
    expect(court1.getByText('2 photos')).toBeInTheDocument()
    expect(court1.queryByText('Sample')).not.toBeInTheDocument()
    // A court without photos keeps the labelled sample drawing.
    expect(within(venue.getByText('Davao Court 2').closest('li')!).getByText('Sample')).toBeInTheDocument()
    // The club picture at the top uses the cover photo, not the drawing.
    expect(screen.getByRole('img', { name: 'Photo of Rally Point Davao' })).toHaveAttribute('src', 'https://example.test/cover.webp')
  })

  it('holds the club grid with card-shaped placeholders while clubs load', async () => {
    let finish: (rows: PublicClubListing[]) => void = () => {}
    vi.mocked(api.listPublicClubs).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    renderAt('/clubs')

    const status = screen.getByText('Loading clubs…')
    expect(status).toHaveAttribute('role', 'status')

    finish(clubs)
    expect(await screen.findByRole('link', { name: /Rally Point Davao/ })).toBeInTheDocument()
    expect(screen.queryByText('Loading clubs…')).not.toBeInTheDocument()
  })

  it('holds the club page with page-shaped placeholders while it loads', async () => {
    let finish: (detail: PublicClubDetail) => void = () => {}
    vi.mocked(api.publicClubDetail).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    renderAt('/clubs/rally-point-davao')

    expect(screen.getByRole('link', { name: 'All clubs' })).toHaveAttribute('href', '/clubs')
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Loading club…')

    finish(davao)
    expect(await screen.findByRole('heading', { name: 'Davao Main' })).toBeInTheDocument()
    expect(screen.queryByText('Loading club…')).not.toBeInTheDocument()
  })

  it('fades a photo in once it loads, and keeps a labelled placeholder if it fails', async () => {
    vi.mocked(api.listPublicClubs).mockResolvedValue([
      { ...clubs[0], cover_photo: 'https://example.test/cover.webp' },
      { ...clubs[1], cover_photo: 'https://example.test/broken.webp' },
    ])
    renderAt('/clubs')

    const davaoPhoto = within(await screen.findByRole('link', { name: /Rally Point Davao/ }))
      .getByRole('img', { name: 'Photo of Rally Point Davao' })
    expect(davaoPhoto.parentElement).toHaveAttribute('data-state', 'loading')
    fireEvent.load(davaoPhoto)
    expect(davaoPhoto.parentElement).toHaveAttribute('data-state', 'loaded')

    const gensanCard = within(screen.getByRole('link', { name: /Rally Point Gensan/ }))
    const gensanPhoto = gensanCard.getByRole('img', { name: 'Photo of Rally Point Gensan' })
    expect(gensanPhoto.tagName).toBe('IMG')
    fireEvent.error(gensanPhoto)
    const placeholder = gensanCard.getByRole('img', { name: 'Photo of Rally Point Gensan' })
    expect(placeholder.tagName).not.toBe('IMG')
    expect(placeholder).toHaveAttribute('data-state', 'error')
    expect(document.querySelector('img[src="https://example.test/broken.webp"]')).toBeNull()
  })

  it('explains an unknown club', async () => {
    vi.mocked(api.publicClubDetail).mockResolvedValue(null)
    renderAt('/clubs/nowhere')
    expect(await screen.findByRole('heading', { name: 'This club is not taking bookings' })).toBeInTheDocument()
  })
})
