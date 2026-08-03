import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { Role } from '../types'
import { BottomNav } from './Shell'

const roleLinks: Record<Role, Array<[label: string, href: string]>> = {
  member: [
    ['Home', '/member'],
    ['Book', '/member/book'],
    ['Play', '/member/open'],
    ['My QR', '/member/pass'],
    ['Account', '/member/profile'],
  ],
  staff: [
    ['Home', '/staff'],
    ['Check in', '/staff/checkin'],
    ['Schedule', '/staff/board'],
    ['Open play', '/staff/open'],
    ['Courts', '/staff/courts'],
  ],
  admin: [
    ['Home', '/admin'],
    ['Floor', '/admin/ops'],
    ['Schedule', '/admin/board'],
    ['Open play', '/admin/open'],
    ['Bookings', '/admin/bookings'],
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
      expect(links).toHaveLength(expectedLinks.length)
      expectedLinks.forEach(([label, href], index) => {
        expect(links[index]).toHaveAccessibleName(label)
        expect(links[index]).toHaveAttribute('href', href)
        expect(links[index]).toHaveClass('min-h-[56px]')
        expect(links[index].className).toContain('focus-visible:outline')
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
