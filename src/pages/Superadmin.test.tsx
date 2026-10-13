import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SuperadminPage } from './Superadmin'
import { demoStore } from '../lib/demoStore'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      email: 'superadmin@rallypoint.local',
      full_name: 'Platform Superadmin',
      role: 'superadmin',
    },
    signOut: vi.fn(),
  }),
}))

describe('SuperadminPage', () => {
  beforeEach(() => {
    localStorage.clear()
    demoStore.reset()
    demoStore.login('superadmin@rallypoint.local', 'superadmin123')
  })

  it('renders the Superadmin portal with tabs and global KPIs', async () => {
    render(
      <MemoryRouter>
        <SuperadminPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Platform Superadmin' })).toBeInTheDocument()
    expect(screen.getByText('Overview & KPIs')).toBeInTheDocument()
    expect(screen.getByText(/Branches \(/i)).toBeInTheDocument()
    expect(screen.getByText(/Commissions \(/i)).toBeInTheDocument()

    // Verify presence of seeded branches
    expect(screen.getByText('Rally Point Gensan')).toBeInTheDocument()
    expect(screen.getByText('Rally Point Davao')).toBeInTheDocument()
  })

  it('navigates to Branches tab and opens the Provision Branch modal', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <SuperadminPage />
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Platform Superadmin' })

    const branchesTab = screen.getByText(/Branches \(/i)
    await user.click(branchesTab)

    expect(screen.getByText('Branch Directory')).toBeInTheDocument()

    const provisionBtn = screen.getByRole('button', { name: /Add new branch/i })
    await user.click(provisionBtn)

    expect(screen.getByText('Provision New Branch')).toBeInTheDocument()
    expect(screen.getByLabelText(/Branch \/ Club Name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/URL Slug/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/City/i)).toBeInTheDocument()
  })

  it('switches to the Commissions tab and shows the commission ledger', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <SuperadminPage />
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Platform Superadmin' })

    const commsTab = screen.getByText(/Commissions \(/i)
    await user.click(commsTab)

    expect(screen.getByText('Platform Commission Ledger')).toBeInTheDocument()
    expect(screen.getByText(/Live log of platform cuts automatically collected/i)).toBeInTheDocument()
  })
})
