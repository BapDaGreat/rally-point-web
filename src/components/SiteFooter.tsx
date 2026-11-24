import { Link } from 'react-router-dom'
import { BrinelyLogo } from './BrinelyLogo'

type FooterLink = { label: string; to: string }

/*
 * Link names here stay different from the header's ("Log in", "Sign up") and from the
 * landing page's "I own a court", so each of those stays a single, unambiguous link.
 */
const groups: { title: string; links: FooterLink[] }[] = [
  { title: 'Players', links: [{ label: 'Find a court', to: '/clubs' }] },
  {
    title: 'Clubs',
    links: [
      { label: 'List your club', to: '/owners' },
      { label: 'Club staff sign-in', to: '/login' },
    ],
  },
  {
    title: 'About',
    links: [
      { label: 'Privacy', to: '/privacy' },
      { label: 'Photo credits', to: '/privacy#photo-credits' },
    ],
  },
]

/** The visitor footer: where to go next, who runs the site, and the photo credits. */
export function SiteFooter() {
  return (
    <footer className="site-footer mt-auto">
      <div className="app-content-rail grid grid-cols-2 gap-x-6 gap-y-8 py-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div className="col-span-2 md:col-span-1">
          <p className="flex items-center gap-2 text-title font-semibold text-ink">
            <BrinelyLogo variant="mark" className="h-7 w-7 object-contain" title="" />
            bRineLy
          </p>
          <p className="mt-2 max-w-xs text-subtitle">Court booking for pickleball clubs in the Philippines.</p>
        </div>
        {groups.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h2 className="text-body font-semibold text-ink">{group.title}</h2>
            <ul className="mt-1">
              {group.links.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-link inline-flex min-h-12 items-center font-normal">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="app-content-rail border-t border-line py-5 text-body">© 2026 bRineLy · brinely.info</div>
    </footer>
  )
}
