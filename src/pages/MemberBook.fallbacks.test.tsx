import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Booking, CheckoutPaymentMethod, Court, Member, MyClub, Profile, PublicClubDetail, TimeSlot } from '../types'
import { MemberBook } from './MemberBook'

const authState = vi.hoisted(() => ({
  user: null as Profile | null,
  activeClub: null as MyClub | null,
  joinClub: vi.fn(),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: authState.user,
    loading: false,
    demo: true,
    activeClub: authState.activeClub,
    joinClub: authState.joinClub,
    signIn: vi.fn(),
    signUpMember: vi.fn(),
    verifySignupCode: vi.fn(),
    resendSignupCode: vi.fn(),
    resetPassword: vi.fn(),
    signOut: vi.fn(),
    refresh: vi.fn(),
  }),
}))

const apiMock = vi.hoisted(() => ({
  memberForUser: vi.fn(),
  listVenues: vi.fn(),
  availability: vi.fn(),
  myBookings: vi.fn(),
  createBooking: vi.fn(),
  releaseBookingHold: vi.fn(),
  checkoutPaymentMethods: vi.fn(),
  submitBookingPayment: vi.fn(),
  myBooking: vi.fn(),
  sendBookingConfirmationEmail: vi.fn(),
  publicClubDetail: vi.fn(),
  publicClubAvailability: vi.fn(),
  publicClubProfile: vi.fn(),
}))

vi.mock('../lib/api', () => ({ api: apiMock }))

const memberUser: Profile = {
  id: 'user_member',
  email: 'member@brinely.info',
  full_name: 'Mia Member',
  role: 'member',
  phone: null,
  created_at: '2026-01-01T00:00:00.000Z',
}
const staffUser: Profile = { ...memberUser, id: 'user_staff', email: 'staff@brinely.info', full_name: 'Sam Staff', role: 'staff' }

const member: Member = {
  id: 'mem_001',
  user_id: memberUser.id,
  member_code: 'RP-1001',
  full_name: 'Mia Member',
  email: memberUser.email,
  phone: null,
  membership_type: 'premium',
  status: 'active',
  join_date: '2026-01-01',
  expiry_date: '2099-12-31',
  notes: null,
  qr_token: 'QR_MIA',
  created_at: '2026-01-01T00:00:00.000Z',
}
const gensanClub: MyClub = { club_id: 'club-gensan', slug: 'rally-point-gensan', name: 'Rally Point Gensan', role: 'member' }
const court: Court = { id: 'court_2', name: 'Court B', status: 'available', hourly_rate: 500 }
const venue = {
  id: 'venue-main', club_id: 'club-gensan', slug: 'gensan-main', name: 'Gensan Main',
  timezone: 'Asia/Manila', open_hour: 6, close_hour: 22, is_active: true,
}
const gcash: CheckoutPaymentMethod = {
  id: 'pay-gcash',
  label: 'GCash',
  account_name: 'Rally Point Gensan',
  account_number: '0917 123 4567',
  qr_url: 'https://example.test/gcash-qr.png',
}
const REFERENCE = '1234567890123'
const held: Booking = {
  id: 'booking-1', court_id: court.id, member_id: member.id, start_at: '2099-09-21T04:00:00.000Z', end_at: '2099-09-21T05:00:00.000Z',
  hours: 1, amount: 500, status: 'pending_payment', payment_method: null, payment_ref: null, created_at: '2099-09-20T00:00:00.000Z', court,
  hold_expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
}
function sent(): Booking {
  return {
    ...held,
    payment_reference: REFERENCE,
    payment_submitted_at: new Date().toISOString(),
    confirm_by: new Date(Date.now() + 15 * 60000).toISOString(),
  }
}
const davaoDetail: PublicClubDetail = {
  slug: 'rally-point-davao',
  name: 'Rally Point Davao',
  city: 'Davao City',
  address: 'Lanang',
  venues: [{
    id: venue.id, name: 'Davao Main', open_hour: 6, close_hour: 22, address: null, city: 'Davao City', latitude: null, longitude: null,
    courts: [{ id: court.id, name: court.name, hourly_rate: 500, member_rate: null, in_service: true }],
  }],
}

function slots(available = true): TimeSlot[] {
  return Array.from({ length: 16 }, (_, index) => ({
    startHour: index + 6,
    label: `${index + 6}:00`,
    available,
    ...(available ? {} : { blocked: 'booked' as const }),
  }))
}

function renderClub(slug = 'rally-point-davao') {
  return render(
    <MemoryRouter initialEntries={[`/clubs/${slug}/book`]}>
      <Routes>
        <Route path="/clubs/:slug/book" element={<MemberBook />} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderOwnClub() {
  return render(<MemoryRouter><MemberBook /></MemoryRouter>)
}

/** Picks 12:00 PM, holds it, and opens the pay step. */
async function openCheckout(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^12:00 PM/ }))
  await user.click(screen.getByRole('button', { name: /Continue/ }))
  await screen.findByText('Checkout')
}

/** From the pay step, sends a reference number. */
async function sendReference(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('GCash reference number'), REFERENCE)
  await user.click(screen.getByRole('button', { name: /I.ve paid/ }))
}

beforeEach(() => {
  authState.user = null
  authState.activeClub = null
  authState.joinClub.mockReset().mockResolvedValue(gensanClub)
  sessionStorage.clear()
  Object.values(apiMock).forEach((mock) => mock.mockReset())
  apiMock.memberForUser.mockResolvedValue(member)
  apiMock.listVenues.mockResolvedValue([venue])
  apiMock.availability.mockResolvedValue([{ court, slots: slots() }])
  apiMock.myBookings.mockResolvedValue([])
  apiMock.createBooking.mockResolvedValue(held)
  apiMock.releaseBookingHold.mockResolvedValue(undefined)
  apiMock.checkoutPaymentMethods.mockResolvedValue([gcash])
  apiMock.submitBookingPayment.mockImplementation(async () => sent())
  apiMock.myBooking.mockImplementation(async () => sent())
  apiMock.sendBookingConfirmationEmail.mockResolvedValue({ sent: false })
  apiMock.publicClubDetail.mockResolvedValue(davaoDetail)
  apiMock.publicClubAvailability.mockResolvedValue([{ court, slots: slots() }])
  apiMock.publicClubProfile.mockResolvedValue(null)
})

describe('booking steps on the booking screen', () => {
  it('shows a visitor the log-in step and a player only choose, pay and confirmed', async () => {
    const first = renderClub()
    const visitorSteps = await screen.findByRole('list', { name: 'Booking steps' })
    expect(within(visitorSteps).getByText('Log in')).toBeInTheDocument()
    expect(within(visitorSteps).getByText('Choose a time').closest('li')).toHaveAttribute('aria-current', 'step')
    expect(screen.queryByText('1. Venue · 2. Date · 3. Court · 4. Pay')).not.toBeInTheDocument()
    first.unmount()

    authState.user = memberUser
    const user = userEvent.setup()
    renderOwnClub()
    const steps = await screen.findByRole('list', { name: 'Booking steps' })
    expect(within(steps).queryByText('Log in')).not.toBeInTheDocument()
    await openCheckout(user)
    expect(within(screen.getByRole('list', { name: 'Booking steps' })).getByText('Pay').closest('li'))
      .toHaveAttribute('aria-current', 'step')
  })

  it('sums up the pick in a Your booking card with one Continue button', async () => {
    authState.user = memberUser
    authState.activeClub = gensanClub
    const user = userEvent.setup()
    renderOwnClub()
    const summary = within(await screen.findByRole('complementary', { name: 'Your booking' }))
    expect(summary.getByText('Rally Point Gensan')).toBeInTheDocument()
    expect(summary.getByText('Court B')).toBeInTheDocument()
    expect(summary.getByText('Tap a start time')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^12:00 PM/ }))
    expect(summary.getByText('12:00 PM – 1:00 PM · 1 hour')).toBeInTheDocument()
    expect(summary.getByText('Php 500.00')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Continue/ })).toHaveLength(1)
    expect(summary.getByRole('button', { name: /^Continue/ })).toBeEnabled()
    // Dates and lengths are choice chips that say which one is picked.
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '1h' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Court B/ })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('booking screen dead ends', () => {
  it('a: an unknown club shows only the message and a link to all clubs', async () => {
    apiMock.publicClubDetail.mockResolvedValue(null)
    renderClub('nowhere')
    expect(await screen.findByText('This club is not taking bookings.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See all clubs' })).toHaveAttribute('href', '/clubs')
    expect(screen.queryByText('Date')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Continue/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Booking steps' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Back to/ })).not.toBeInTheDocument()
  })

  it('b: a club with no courts says so and links to its page and all clubs', async () => {
    apiMock.publicClubDetail.mockResolvedValue({ ...davaoDetail, venues: [] })
    apiMock.publicClubAvailability.mockResolvedValue([])
    renderClub()
    expect(await screen.findByText('This club has not listed courts yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the club page' })).toHaveAttribute('href', '/clubs/rally-point-davao')
    expect(screen.getByRole('link', { name: 'See all clubs' })).toHaveAttribute('href', '/clubs')
    expect(screen.queryByText(/Available times/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Continue/ })).not.toBeInTheDocument()
  })

  it('c: every court out of service says none are open and links to the club page', async () => {
    apiMock.publicClubAvailability.mockResolvedValue([
      { court: { ...court, status: 'maintenance' }, slots: slots(false) },
      { court: { ...court, id: 'court_3', name: 'Court C', status: 'maintenance' }, slots: slots(false) },
    ])
    renderClub()
    expect(await screen.findByText('No courts are open for booking right now.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the club page' })).toHaveAttribute('href', '/clubs/rally-point-davao')
    expect(screen.queryByRole('button', { name: /Continue/ })).not.toBeInTheDocument()
  })

  it('d: a day with no free hours says to try another day', async () => {
    authState.user = memberUser
    apiMock.availability.mockResolvedValue([{ court, slots: slots(false) }])
    renderOwnClub()
    expect(await screen.findByText(/^No free hours on .+\. Try another day\.$/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continue/ })).toBeDisabled()
  })

  it("folds today's hours that are over into one line, so the grid starts at the first open hour", async () => {
    authState.user = memberUser
    const day = slots()
    // 6 AM to 9 AM are over; 10 AM onward can still be booked.
    for (let index = 0; index < 4; index += 1) day[index] = { ...day[index], available: false, blocked: 'passed' }
    apiMock.availability.mockResolvedValue([{ court, slots: day }])
    renderOwnClub()
    expect(await screen.findByText('Hours before 10:00 AM have passed.')).toBeInTheDocument()
    expect(screen.queryByText('Passed')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^10:00 AM/ })).toBeEnabled()
  })

  it('says when every hour of the day is over', async () => {
    authState.user = memberUser
    apiMock.availability.mockResolvedValue([
      { court, slots: slots().map((slot) => ({ ...slot, available: false, blocked: 'passed' as const })) },
    ])
    renderOwnClub()
    expect(await screen.findByText(/^Every hour on .+ has passed\. Try another day\.$/)).toBeInTheDocument()
  })

  it('e: signed-in staff are told at once that only member accounts book, with no Continue', async () => {
    authState.user = staffUser
    renderClub()
    expect(await screen.findByText('Only member accounts can book courts online. Please sign in with a member account.')).toBeInTheDocument()
    expect(await screen.findByText(/Available times/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Continue/ })).not.toBeInTheDocument()
    expect(apiMock.checkoutPaymentMethods).not.toHaveBeenCalled()
    expect(apiMock.createBooking).not.toHaveBeenCalled()
  })

  it('f: a QR code that does not load says to send the amount to the number', async () => {
    authState.user = memberUser
    const user = userEvent.setup()
    renderOwnClub()
    await openCheckout(user)
    const qr = screen.getByRole('img', { name: 'GCash QR code to pay Rally Point Gensan' })
    expect(qr).toHaveAttribute('src', gcash.qr_url)
    fireEvent.error(qr)
    expect(screen.getByText('The QR code did not load. Send Php 500.00 to the number below.')).toBeInTheDocument()
    expect(screen.getByText('0917 123 4567')).toBeInTheDocument()
  })

  it('f: a QR code that does not load, with no number, says to ask the desk', async () => {
    authState.user = memberUser
    apiMock.checkoutPaymentMethods.mockResolvedValue([{ ...gcash, account_number: null }])
    const user = userEvent.setup()
    renderOwnClub()
    await openCheckout(user)
    fireEvent.error(screen.getByRole('img', { name: 'GCash QR code to pay Rally Point Gensan' }))
    expect(screen.getByText(/Ask the desk for the club's GCash number\./)).toBeInTheDocument()
  })

  it('g: the waiting screen links home and to notifications', async () => {
    authState.user = memberUser
    const user = userEvent.setup()
    renderOwnClub()
    await openCheckout(user)
    await sendReference(user)
    expect(await screen.findByRole('heading', { name: 'Waiting for the club to confirm' })).toBeInTheDocument()
    expect(screen.getByText(/You can leave this screen/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to my home' })).toHaveAttribute('href', '/member')
    expect(screen.getByRole('link', { name: 'Open notifications' })).toHaveAttribute('href', '/member/notifications')
  })

  it('h: a confirmed booking offers Book another and a link home', async () => {
    authState.user = memberUser
    apiMock.myBooking.mockImplementation(async () => ({ ...sent(), status: 'confirmed' }))
    const user = userEvent.setup()
    renderOwnClub()
    await openCheckout(user)
    await sendReference(user)
    expect(await screen.findByText('Booking confirmed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Book another' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to my home' })).toHaveAttribute('href', '/member')
  })

  it('i: a turned-down payment offers to call the club when it lists a phone', async () => {
    authState.user = memberUser
    authState.activeClub = gensanClub
    apiMock.publicClubProfile.mockResolvedValue({ phone: '0917 555 0000' })
    apiMock.myBooking.mockImplementation(async () => ({ ...sent(), status: 'cancelled' }))
    const user = userEvent.setup()
    renderOwnClub()
    await openCheckout(user)
    await sendReference(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('The club did not confirm your payment')
    const call = await screen.findByRole('link', { name: 'Call the club: 0917 555 0000' })
    expect(call).toHaveAttribute('href', 'tel:09175550000')
    expect(apiMock.publicClubProfile).toHaveBeenCalledWith('rally-point-gensan')
  })

  it('i: a turned-down payment without a club phone shows no call link', async () => {
    authState.user = memberUser
    authState.activeClub = gensanClub
    apiMock.myBooking.mockImplementation(async () => ({ ...sent(), status: 'cancelled' }))
    const user = userEvent.setup()
    renderOwnClub()
    await openCheckout(user)
    await sendReference(user)
    expect(await screen.findByRole('link', { name: 'Open your notifications' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Call the club/ })).not.toBeInTheDocument()
  })
})
