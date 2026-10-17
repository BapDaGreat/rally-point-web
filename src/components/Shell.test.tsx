import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyClub, Role } from '../types'
import { AppHeader, AppShell, BottomNav, ClubSwitcher } from './Shell'

const auth = vi.hoisted(() => ({
  clubs: [] as MyClub[],
  activeClub: null as MyClub | null,
  switchClub: vi.fn(),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      email: 'member@rallypoint.local',
      full_name: 'Demo Member',
    },
    signOut: vi.fn(),
    clubs: auth.clubs,
    activeClub: auth.activeClub,
    switchClub: auth.switchClub,
  }),
}))

const gensan: MyClub = { club_id: 'club-gensan', slug: 'rally-point-gensan', name: 'Rally Point Gensan', role: 'member' }
const davao: MyClub = { club_id: 'club-davao', slug: 'rally-point-davao', name: 'Rally Point Davao', role: 'admin' }

beforeEach(() => {
  auth.clubs = []
  auth.activeClub = null
  auth.switchClub.mockClear()
})

const roleLinks: Record<Role, Array<[label: string, href: string]>> = {
  member: [
    ['Home', '/member'],
    ['Book', '/member/book'],
    ['Play', '/member/open'],
    ['My QR', '/member/pass'],
    ['Account', '/member/profile'],
    ['Help', '/member/help'],
  ],
  staff: [
    ['Home', '/staff'],
    ['Check in', '/staff/checkin'],
    ['Schedule', '/staff/board'],
    ['Open play', '/staff/open'],
    ['Courts', '/staff/courts'],
    ['Help', '/staff/help'],
  ],
  admin: [
    ['Home', '/admin'],
    ['Floor', '/admin/ops'],
    ['Schedule', '/admin/board'],
    ['Open play', '/admin/open'],
    ['Bookings', '/admin/bookings'],
    ['Help', '/admin/help'],
  ],
  // The platform portal only; superadmins have no club screens.
  superadmin: [
    ['Overview', '/superadmin'],
    ['Clubs', '/superadmin/clubs'],
    ['Ledger', '/superadmin/ledger'],
  ],
}

function renderNav(role: Role, route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <BottomNav role={role} />
    </MemoryRouter>,
  )
}

describe('BottomNav', () => {
  it.each(Object.entries(roleLinks) as Array<[Role, Array<[string, string]>]>)(
    'keeps the %s role navigation labeled and touch friendly',
    (role, expectedLinks) => {
      renderNav(role, expectedLinks[0][1])

      const nav = screen.getByRole('navigation', { name: 'Main menu' })
      const links = within(nav).getAllByRole('link')

      expect(nav).toHaveClass('bottom-nav')
      expect(nav.firstElementChild).toHaveClass(`grid-cols-${expectedLinks.length}`)
      expect(links).toHaveLength(expectedLinks.length)
      expectedLinks.forEach(([label, href], index) => {
        expect(links[index]).toHaveAccessibleName(label)
        expect(links[index]).toHaveAttribute('href', href)
        expect(links[index]).toHaveClass('min-h-[56px]')
        expect(links[index]).toHaveClass('control-feedback')
      })
    },
  )

  it('preserves exact active-route styling for member routes', () => {
    renderNav('member', '/member/book')

    expect(screen.getByRole('link', { name: 'Book' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Book' })).toHaveClass(
      'bg-brand-50',
    )
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('uses the end match for the member home route', () => {
    renderNav('member', '/member')

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      screen
        .getAllByRole('link')
        .filter((link) => link.hasAttribute('aria-current')),
    ).toHaveLength(1)
  })
})

function Where() {
  return <p>At {useLocation().pathname}</p>
}

describe('ClubSwitcher', () => {
  it('stays hidden for someone in one club', () => {
    auth.clubs = [gensan]
    auth.activeClub = gensan
    render(<MemoryRouter><ClubSwitcher /></MemoryRouter>)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('switches clubs and goes to the home screen for the role in that club', async () => {
    auth.clubs = [davao, gensan]
    auth.activeClub = gensan
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/member/book']}>
        <ClubSwitcher />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    )
    const select = screen.getByRole('combobox', { name: 'Club' })
    expect(select).toHaveValue('club-gensan')
    expect(within(select).getByRole('option', { name: 'Rally Point Davao · Admin' })).toBeInTheDocument()

    await user.selectOptions(select, 'club-davao')
    expect(auth.switchClub).toHaveBeenCalledWith('club-davao')
    expect(screen.getByText('At /admin')).toBeInTheDocument()
  })
})

describe('AppShell', () => {
  it('shares a centered content rail while preserving both navigation variants', () => {
    const { container } = render(
      <MemoryRouter>
        <AppShell role="member">
          <AppHeader title="Member home" />
          <main className="safe-bottom">Member content</main>
        </AppShell>
      </MemoryRouter>,
    )

    expect(container.querySelector('.app-shell')).toBeInTheDocument()
    expect(container.querySelector('.app-shell-desktop')).toBeInTheDocument()
    expect(
      container.querySelector('header > .app-content-rail'),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('navigation', { name: 'Main menu' }),
    ).toHaveLength(2)
    expect(screen.getByText('Member content')).toHaveClass('safe-bottom')
  })

  it('shows a neutral badge instead of the Gensan logo for other clubs', () => {
    auth.clubs = [davao]
    auth.activeClub = davao
    const { container } = render(
      <MemoryRouter>
        <AppHeader title="Admin home" />
      </MemoryRouter>,
    )
    expect(screen.getByText('RD')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })

  it('names the active club in the header', () => {
    auth.clubs = [gensan]
    auth.activeClub = gensan
    render(
      <MemoryRouter>
        <AppHeader title="Member home" />
      </MemoryRouter>,
    )
    expect(screen.getByText('Rally Point Gensan')).toBeInTheDocument()
  })
})
