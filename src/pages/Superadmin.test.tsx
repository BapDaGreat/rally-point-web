import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { demoStore } from '../lib/demoStore'
import { setActiveClubId } from '../lib/clubContext'
import { SuperadminPage } from './Superadmin'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user_superadmin', email: 'superadmin@rallypoint.local', full_name: 'Morgan Superadmin', role: 'superadmin', created_at: '2026-01-01T00:00:00.000Z' },
    loading: false,
    demo: true,
    clubs: [],
    activeClub: null,
    switchClub: vi.fn(),
    signOut: vi.fn(),
  }),
}))

function renderSection(section: 'overview' | 'clubs' | 'ledger') {
  return render(
    <MemoryRouter>
      <SuperadminPage section={section} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  setActiveClubId(null)
  demoStore.reset()
  demoStore.login('superadmin@rallypoint.local', 'superadmin123')
})

describe('SuperadminPage', () => {
  it('shows platform totals and every club, labelled as recorded rather than collected money', async () => {
    renderSection('overview')
    expect(await screen.findByRole('heading', { name: 'Platform overview' })).toBeInTheDocument()
    const totals = screen.getByRole('region', { name: 'Platform totals' })
    expect(within(totals).getByText('Commission recorded')).toBeInTheDocument()
    expect(within(totals).getByText('Active clubs')).toBeInTheDocument()
    expect(within(totals).getByText('2')).toBeInTheDocument()
    expect(screen.getByText(/not collected money/)).toBeInTheDocument()
    const glance = screen.getByRole('region', { name: 'Clubs at a glance' })
    expect(within(glance).getByText('Rally Point Gensan')).toBeInTheDocument()
    expect(within(glance).getByText('Rally Point Davao')).toBeInTheDocument()
  })

  it('sets up a club in setup, refuses to activate it without an admin, then activates it once an admin is added', async () => {
    const user = userEvent.setup()
    renderSection('clubs')
    await user.click(await screen.findByRole('button', { name: /Set up a club/ }))
    const dialog = screen.getByRole('dialog', { name: 'Set up a club' })
    await user.type(within(dialog).getByLabelText('Club name'), 'Cebu Hub')
    expect(within(dialog).getByLabelText('Link name')).toHaveValue('cebu-hub')
    await user.click(within(dialog).getByRole('button', { name: 'Set up club' }))

    expect(await screen.findByText('Cebu Hub is set up. Assign an admin, then activate it.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const card = screen.getByRole('article', { name: 'Cebu Hub' })
    expect(within(card).getByText('In setup')).toBeInTheDocument()
    expect(within(card).getByText('#/join/cebu-hub')).toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: 'Activate' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Assign a club admin before activating this club')

    await user.type(within(card).getByLabelText('Add an admin by email'), 'member@rallypoint.local')
    await user.click(within(card).getByRole('button', { name: 'Add admin' }))
    expect(await screen.findByText('member@rallypoint.local is now an admin of Cebu Hub.')).toBeInTheDocument()

    await user.click(within(screen.getByRole('article', { name: 'Cebu Hub' })).getByRole('button', { name: 'Activate' }))
    expect(await screen.findByText('Cebu Hub is now active.')).toBeInTheDocument()
    await waitFor(() => expect(within(screen.getByRole('article', { name: 'Cebu Hub' })).getByText('Active')).toBeInTheDocument())
  })

  it('never offers to suspend the default sign-up club', async () => {
    renderSection('clubs')
    const gensan = await screen.findByRole('article', { name: 'Rally Point Gensan' })
    expect(within(gensan).getByText('Default sign-up club')).toBeInTheDocument()
    expect(within(gensan).queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument()
    const davao = screen.getByRole('article', { name: 'Rally Point Davao' })
    expect(within(davao).getByRole('button', { name: 'Suspend' })).toBeInTheDocument()
  })

  it('filters the commission ledger by club', async () => {
    const user = userEvent.setup()
    renderSection('ledger')
    expect(await screen.findByRole('heading', { name: 'Commission ledger' })).toBeInTheDocument()
    expect((await screen.findAllByText('Rally Point Davao')).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Recorded, not verified/).length).toBeGreaterThan(0)

    const davaoId = demoStore.platformClubs().find((club) => club.name === 'Rally Point Davao')!.club_id
    await user.selectOptions(screen.getByLabelText('Club'), davaoId)
    await waitFor(() => {
      const lines = screen.getAllByRole('listitem')
      expect(lines.length).toBeGreaterThan(0)
      lines.forEach((line) => expect(line).toHaveTextContent('Rally Point Davao'))
    })
  })

  it('opens a logged, read-only support view of a club and closes it again', async () => {
    const user = userEvent.setup()
    renderSection('clubs')
    const davao = await screen.findByRole('article', { name: 'Rally Point Davao' })
    await user.click(within(davao).getByRole('button', { name: /Open support view/ }))
    const dialog = screen.getByRole('dialog', { name: 'Support view of Rally Point Davao' })
    await user.type(within(dialog).getByLabelText('Reason'), 'Checking a court booking complaint')
    await user.click(within(dialog).getByRole('button', { name: 'Open support view' }))

    expect(await screen.findByText('Support view of Rally Point Davao is open for 30 minutes.')).toBeInTheDocument()
    const panel = within(screen.getByRole('region', { name: 'Rally Point Davao support view' }))
    expect(await panel.findByText(/Support view open until/)).toBeInTheDocument()
    expect(await panel.findByText(/^Members: \d+/)).toBeInTheDocument()
    // The button that opened the dialog is gone, so focus lands on the support area.
    await waitFor(() => expect(screen.getByRole('region', { name: 'Rally Point Davao support view' })).toHaveFocus())
    expect(demoStore.platformRecentActions(5).map((action) => action.action)).toEqual(expect.arrayContaining(['support.start', 'support.read']))

    await user.click(panel.getByRole('button', { name: 'End support view' }))
    expect(await screen.findByText('Support view of Rally Point Davao closed.')).toBeInTheDocument()
    expect(await within(screen.getByRole('article', { name: 'Rally Point Davao' })).findByRole('button', { name: /Open support view/ })).toBeInTheDocument()
  })

  it('refuses a support view without a real reason', async () => {
    const davaoId = demoStore.platformClubs().find((club) => club.name === 'Rally Point Davao')!.club_id
    expect(() => demoStore.startSupportSession(davaoId, 'short', 30)).toThrow('Give a reason of at least 10 characters')
    expect(() => demoStore.startSupportSession(davaoId, 'Checking a court complaint', 200)).toThrow('Choose between 5 and 120 minutes')
  })

  it('closes the set-up dialog with Escape', async () => {
    const user = userEvent.setup()
    renderSection('clubs')
    await user.click(await screen.findByRole('button', { name: /Set up a club/ }))
    expect(screen.getByRole('dialog', { name: 'Set up a club' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps Tab inside a dialog and returns focus to the button that opened it', async () => {
    const user = userEvent.setup()
    renderSection('clubs')
    const opener = await screen.findByRole('button', { name: /Set up a club/ })
    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Set up a club' })
    expect(within(dialog).getByLabelText('Club name')).toHaveFocus()

    await user.tab({ shift: true })
    expect(within(dialog).getByRole('button', { name: 'Set up club' })).toHaveFocus()
    await user.tab()
    expect(within(dialog).getByLabelText('Club name')).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('shows a failed set-up inside the dialog, where a phone screen can still see it', async () => {
    const user = userEvent.setup()
    renderSection('clubs')
    await user.click(await screen.findByRole('button', { name: /Set up a club/ }))
    const dialog = screen.getByRole('dialog', { name: 'Set up a club' })
    await user.type(within(dialog).getByLabelText('Club name'), 'Rally Point Davao')
    await user.click(within(dialog).getByRole('button', { name: 'Set up club' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('That link name is already used by another club')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Set up a club' })).toBeInTheDocument()
  })
})
