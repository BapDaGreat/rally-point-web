import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ownerCallDateRange } from '../lib/ownerRequests'
import { OWNERS_PHOTO } from '../lib/stockPhotos'
import { OwnersPage } from './Owners'

const requestOwnerCall = vi.hoisted(() => vi.fn())

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false, activeClub: null, clubs: [], switchClub: vi.fn(), signOut: vi.fn() }),
}))

vi.mock('../lib/api', () => ({ api: { requestOwnerCall } }))

function renderPage() {
  return render(
    <MemoryRouter>
      <OwnersPage />
    </MemoryRouter>,
  )
}

async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Your name'), 'Ana Reyes')
  await user.type(screen.getByLabelText('Club or venue name'), 'Lagao Smash Courts')
  await user.type(screen.getByLabelText('City'), 'General Santos City')
  await user.clear(screen.getByLabelText('Number of courts'))
  await user.type(screen.getByLabelText('Number of courts'), '4')
  await user.type(screen.getByLabelText('Mobile number (optional)'), '0917 555 0101')
  await user.click(screen.getByRole('radio', { name: /Afternoon/ }))
}

beforeEach(() => {
  requestOwnerCall.mockReset()
  requestOwnerCall.mockResolvedValue('request-1')
})

describe('OwnersPage', () => {
  it('explains how listing works and offers a call and an owner account', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'List your club' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Put your courts on bRineLy' })).toBeInTheDocument()
    const steps = screen.getByRole('heading', { name: 'Put your courts on bRineLy' }).closest('section')!
    expect(within(steps).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByRole('link', { name: 'Create my owner account' })).toHaveAttribute('href', '/login')
    expect(screen.getByLabelText('Day for the call')).toHaveAttribute('min', ownerCallDateRange().min)
  })

  it('shows what owners get beside a general owners photo', () => {
    renderPage()
    const main = screen.getByRole('main')
    const benefits = within(main).getByRole('heading', { name: 'What you get' }).closest('section')!
    const items = within(benefits).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'Your own club page with photos, hours and a map',
      'Players book by the hour and pay your GCash directly',
      'Staff confirm payments from their phone',
      'A TV board for your courts',
    ])
    expect(within(main).getByText('Put your club online. Players find you, book a time and pay your GCash directly.')).toBeInTheDocument()
    const photo = within(main).getByRole('img', { name: OWNERS_PHOTO.alt })
    expect(photo.getAttribute('srcset')).toContain('800w')
    expect(within(main).queryByText('Sample photo')).not.toBeInTheDocument()
  })

  it('shows the first problem in plain words before sending anything', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Ask for a call' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your name (2 to 80 characters)')

    await fillIn(user)
    await user.click(screen.getByRole('button', { name: 'Ask for a call' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Tick the box so we may contact you and confirm you have read the Privacy Notice.',
    )
    expect(screen.getByRole('checkbox', { name: /bRineLy may contact me/ })).toHaveFocus()
    expect(screen.getByText('Quick summary (5 key points)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Privacy Notice' })).toHaveAttribute('target', '_blank')
    expect(requestOwnerCall).not.toHaveBeenCalled()
  })

  it('sends the request and confirms when we will call', async () => {
    const user = userEvent.setup()
    renderPage()
    await fillIn(user)
    await user.click(screen.getByRole('checkbox', { name: /bRineLy may contact me/ }))
    await user.click(screen.getByRole('button', { name: 'Ask for a call' }))

    expect(requestOwnerCall).toHaveBeenCalledWith({
      full_name: 'Ana Reyes',
      club_name: 'Lagao Smash Courts',
      city: 'General Santos City',
      court_count: 4,
      phone: '0917 555 0101',
      email: '',
      preferred_date: ownerCallDateRange().min,
      preferred_time: 'afternoon',
      message: '',
    })
    const thanks = await screen.findByRole('status')
    expect(thanks).toHaveTextContent('Thank you, Ana')
    expect(thanks).toHaveTextContent('afternoon (12 noon to 5 pm)')
    expect(thanks).toHaveTextContent('Lagao Smash Courts')
    expect(thanks).toHaveTextContent('We will use 0917 555 0101')
    expect(screen.queryByRole('button', { name: 'Ask for a call' })).not.toBeInTheDocument()
  })

  it('shows the database message when a request is refused', async () => {
    requestOwnerCall.mockRejectedValue(new Error('You already asked us to call. We will contact you soon.'))
    const user = userEvent.setup()
    renderPage()
    await fillIn(user)
    await user.click(screen.getByRole('checkbox', { name: /bRineLy may contact me/ }))
    await user.click(screen.getByRole('button', { name: 'Ask for a call' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You already asked us to call. We will contact you soon.')
    expect(screen.getByRole('button', { name: 'Ask for a call' })).toBeEnabled()
  })

  it('quietly drops a request when the hidden field was filled in by a bot', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await fillIn(user)
    await user.click(screen.getByRole('checkbox', { name: /bRineLy may contact me/ }))
    await user.type(container.querySelector('input[name="website"]')!, 'http://spam.example')
    await user.click(screen.getByRole('button', { name: 'Ask for a call' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Thank you, Ana')
    expect(requestOwnerCall).not.toHaveBeenCalled()
  })
})
