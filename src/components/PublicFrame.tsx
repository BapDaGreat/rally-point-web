import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { BrinelyLogo } from './BrinelyLogo'
import { AppHeader, AppShell, SignOutButton } from './Shell'
import { SiteFooter } from './SiteFooter'

const mainLinks = [
  { to: '/clubs', label: 'Find a court' },
  { to: '/owners', label: 'For court owners' },
]

/**
 * The frame for pages open to visitors (the landing page, Find a court, club pages, the
 * court-owner page). Signed-in people get the usual app header and menu.
 *
 * Visitors get a plain site header (logo home, Find a court, For court owners, and Log in /
 * Sign up unless the page asks otherwise), the page heading at the top of the content, and the
 * site footer. `heading="none"` lets a page set its own h1, for example inside a photo hero.
 * `back` is an optional link back up (such as "All clubs"), shown above the page heading.
 */
export function PublicFrame({
  title,
  subtitle,
  accountLinks = 'both',
  heading = 'page',
  width = 'wide',
  back,
  children,
}: {
  title: string
  subtitle?: string
  accountLinks?: 'both' | 'login' | 'none'
  heading?: 'page' | 'none'
  width?: 'wide' | 'narrow'
  back?: ReactNode
  children: ReactNode
}) {
  const { user } = useAuth()
  // AppHeader names the tab too when someone is signed in; both use the same page title.
  useDocumentTitle(title)

  if (user) {
    return (
      <AppShell role={user.role}>
        <AppHeader title={title} subtitle={subtitle} right={<SignOutButton />} />
        <main className="safe-bottom px-4 pt-4 space-y-4">
          {/* The app header holds the title, so the way back leads the content. */}
          {back ? <div>{back}</div> : null}
          {children}
        </main>
      </AppShell>
    )
  }

  return (
    <div className="app-shell app-shell-desktop app-shell-public flex flex-col">
      <header className="site-header md:sticky md:top-0 z-30">
        <div className="app-content-rail flex flex-wrap items-center justify-between gap-x-4 py-2">
          <Link
            to="/"
            aria-label="bRineLy home"
            className="control-feedback -ml-1 inline-flex min-h-12 items-center gap-2 rounded-[10px] px-1 text-title font-semibold text-ink"
          >
            <BrinelyLogo variant="mark" className="h-8 w-8 object-contain" title="" />
            {/* The drawn wordmark, not retyped text: the italic lettering is the most recognisable part of the brand. */}
            <BrinelyLogo variant="wordmark" className="h-6 w-auto object-contain" title="" />
          </Link>
          <nav
            aria-label="Main"
            className="order-last -mx-3 flex w-[calc(100%+1.5rem)] items-center overflow-x-auto border-t border-line md:order-none md:mx-0 md:mr-auto md:w-auto md:border-0"
          >
            {mainLinks.map((link) => (
              <NavLink key={link.to} to={link.to} className="site-nav-link shrink-0">
                {link.label}
              </NavLink>
            ))}
          </nav>
          {accountLinks === 'none' ? null : (
            <nav aria-label="Account" className="flex items-center gap-1">
              <Link to="/login" className="site-nav-link">
                Log in
              </Link>
              {accountLinks === 'both' ? (
                <Link
                  to="/login"
                  state={{ mode: 'join' }}
                  // Outlined, so the page's own main button stays the one filled button in view.
                  className="control-feedback inline-flex min-h-12 items-center rounded-[10px] border-[1.5px] border-field bg-white px-4 font-semibold text-ink"
                >
                  Sign up
                </Link>
              ) : null}
            </nav>
          )}
        </div>
      </header>
      <main className="app-content-rail flex-1 pt-6 pb-16">
        <div className={`space-y-4 ${width === 'narrow' ? 'max-w-[44rem]' : ''}`}>
          {heading === 'page' ? (
            <div className="pb-2">
              {back ? <div className="-mt-2 mb-1">{back}</div> : null}
              <h1 className="text-heading-1 font-semibold text-ink">{title}</h1>
              {subtitle ? <p className="mt-1 text-subtitle text-muted">{subtitle}</p> : null}
            </div>
          ) : back ? (
            <div>{back}</div>
          ) : null}
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
