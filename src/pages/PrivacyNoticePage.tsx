import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { PhotoCredits } from '../components/PhotoCredits'
import { PublicFrame } from '../components/PublicFrame'
import { AppShell } from '../components/Shell'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import type { PrivacyNoticeState } from '../lib/privacyNotice'
import { homeFor } from '../lib/roleHome'
import { DEFAULT_CLUB_SLUG } from '../lib/tenant'

// Provisional contact pending confirmation of its role by the bRineLy team.
const brinelyPrivacyEmail = 'admin@brinely.info'

type NoticeClub = { isGensan: boolean; name: string | null }

function sections(club: NoticeClub): { title: string; content: ReactNode }[] {
  const clubLabel = club.name ?? 'your club'
  const portalContactLink = (
    <a
      className="inline-flex min-h-12 items-center font-semibold text-brand-800 underline"
      href={`mailto:${brinelyPrivacyEmail}`}
    >
      {brinelyPrivacyEmail}
    </a>
  )

  return [
    {
      title: 'At a glance',
      content: (
        <>
          <p>Key points about how bRineLy handles your information:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>What we collect:</strong> Account details, club memberships, court holds and
              bookings, open-play sign-ups, QR check-ins, coaching lesson requests and messages,
              support inquiries, and court-owner listing requests.
            </li>
            <li>
              <strong>Direct-to-club payments:</strong> Court payments go directly to the club
              (such as through the club's GCash QR). bRineLy records the payment reference number
              you submit so the club can confirm it, and does not collect or hold player funds.
            </li>
            <li>
              <strong>Built-in player privacy:</strong> Other players in the same club cannot view
              your bookings, check-ins, contact details, or charges, and public TV court boards
              never display player names.
            </li>
            <li>
              <strong>Essential browser storage only:</strong> The app uses browser storage for
              sign-in sessions, active club memory, and temporary court selection during sign-in,
              with no advertising cookies or cross-site trackers.
            </li>
            <li>
              <strong>Your rights under RA 10173:</strong> You may ask to access, correct, object
              to, erase, block, or port your personal information, or contact the National Privacy
              Commission.
            </li>
          </ul>
        </>
      ),
    },
    {
      title: 'Who we are and club responsibilities',
      content: (
        <>
          <p>
            {club.isGensan
              ? 'bRineLy operates this booking portal for pickleball clubs and players in the Philippines.'
              : `${club.name ?? 'Your club'} is the club named in this notice, and bRineLy operates the booking portal it uses.`}{' '}
            bRineLy is used by multiple independent clubs:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>bRineLy</strong> operates the portal software and manages user accounts,
              sign-in security, court-owner call requests and invitations, audited read-only club
              support views, and platform commission records.
            </li>
            <li>
              <strong>Each participating club</strong> manages its own player memberships, court
              schedules, direct-to-club payment confirmations, front-desk walk-ins and check-ins,
              linked coaches, support inquiries, and public club page content.
            </li>
          </ul>
          <p className="mt-2">
            Formal registered entity names and final Personal Information Controller (PIC) and
            Personal Information Processor (PIP) designations between bRineLy and participating
            clubs remain pending confirmation before official legal sign-off.
          </p>
        </>
      ),
    },
    {
      title: 'Personal information we collect',
      content: (
        <>
          <p>Depending on how you use the app, we may collect:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Account and sign-in details:</strong> Your full name, email address, optional
              phone number, 6-digit email verification status, and—for an owner account—the email
              address used for an owner invitation and whether that invitation was claimed or
              cancelled. Sign-in and sign-up rate limits store only short-lived SHA-256 hashes,
              never raw email addresses or passwords.
            </li>
            <li>
              <strong>Club memberships, bookings, and desk records:</strong> Member ID code
              (starting with <code>BR-</code> or <code>RP-</code>), membership plan and expiry or
              player-only status, court holds and bookings, open-play sign-ups, QR identifiers and
              check-in times, walk-in guest names and phone numbers entered at the front desk, staff
              or admin operational notes, and support inquiry subjects, messages, and replies.
            </li>
            <li>
              <strong>Payment references and recorded charges:</strong> Transaction amounts, payment
              method, and—when paying a club's GCash QR for a court booking—the 6-to-30-character
              GCash reference number you submit, submission time, and the club's confirmation or
              rejection reason, along with the recorded club charge and platform commission entry.
              Membership renewal checkout in the app is currently simulated and does not connect to
              a live online payment processor.
            </li>
            <li>
              <strong>Coaching lesson requests and messages:</strong> Selected coach time slot,
              number of players, quoted lesson amount, request status, optional booking note, and
              private messages exchanged between the player and linked coach in that request
              thread.
            </li>
            <li>
              <strong>Court-owner call requests:</strong> Your name, club or venue name, city, court
              count, mobile number or email, preferred call date and time window, and any optional
              message submitted on the club-listing page.
            </li>
            <li>
              <strong>Club and coach listing details entered by club admins:</strong> Venue
              addresses, map pins, opening hours, court rates and photos, add-ons, business contact
              details, direct payment instructions (including an account name or number and QR
              images), and coach names, headlines, biographies, booking policies, contact details,
              and uploaded photos. Some of this information may identify a person.
            </li>
          </ul>
          <p className="mt-2">
            You provide account, booking, coaching request, and owner-request details directly. Club
            staff and admins may enter member, walk-in, invitation, coach, and business-listing
            details, and club admins choose which club details to publish publicly.
          </p>
          <p className="mt-2">
            Do not send sensitive personal information (such as government IDs or health records)
            unless it is specifically requested for a stated lawful purpose.
          </p>
        </>
      ),
    },
    {
      title: 'Why we use information and lawful bases',
      content: (
        <>
          <p>
            Under the Philippine Data Privacy Act of 2012 (RA 10173, Section 12), we process personal
            information only on a permitted legal basis:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Providing requested services (contract or pre-contractual steps):</strong>{' '}
              Creating and managing accounts, joining clubs, holding and booking courts, submitting
              payment references for club confirmation, managing open-play sign-ups and QR
              check-ins, handling coaching lesson requests and messages, and answering support
              inquiries.
            </li>
            <li>
              <strong>Accounting, commissions, and legal compliance (contract and legal obligation):</strong>{' '}
              Recording confirmed club charges, tracking platform commissions on court bookings, and
              meeting applicable Philippine tax, accounting, or regulatory obligations.
            </li>
            <li>
              <strong>Court-owner onboarding (consent and pre-contractual request):</strong>{' '}
              Contacting court owners who opt in on the "List your club" form and managing club
              owner invitations.
            </li>
            <li>
              <strong>Security, abuse prevention, and support (legitimate interest):</strong>{' '}
              Enforcing hashed sign-in rate limits and form flood limits, preventing duplicate
              active payment references within a club, keeping platform audit logs, and providing
              time-limited, read-only club support views in ways that do not override your
              fundamental rights and freedoms.
            </li>
          </ul>
          <p className="mt-2">
            If sensitive personal information ever needs to be processed, an applicable legal basis
            under Section 13 of RA 10173 must be confirmed first.
          </p>
        </>
      ),
    },
    {
      title: 'Who can see information and service providers',
      content: (
        <>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Other players and public TV boards:</strong> Ordinary members in the same club
              cannot view each other's bookings, open-play sign-ups, check-ins, contact details, or
              charges. Public TV schedule boards display only court status labels (<code>In use</code>,{' '}
              <code>Reserved</code>, <code>Open play</code>) and open-play seat counts, never player
              names.
            </li>
            <li>
              <strong>Club staff and admins:</strong> Authorized staff (scoped to assigned venues)
              and club admins can access member, booking, payment-reference, walk-in, check-in, and
              support records needed to run that club.
            </li>
            <li>
              <strong>Linked club coaches:</strong> When you request a coaching lesson slot, the
              linked coach account receives your full name, email address, lesson request details,
              and messages in that request thread to coordinate your lesson.
            </li>
            <li>
              <strong>Platform superadmins:</strong> Authorized platform superadmins can view
              court-owner call requests, owner invitations, and platform commission records. A
              superadmin may also open a reason-recorded, time-limited (5 to 120 minutes), read-only
              support view of one club showing club settings, counts, venues, today's schedule, and
              open inquiry subjects and status—never member names, contact details, or individual
              payment records. Opening, reading, and closing that view are recorded in an audit log.
            </li>
            <li>
              <strong>Infrastructure and email providers:</strong> We use <strong>Supabase</strong>{' '}
              for authentication, database, server-side functions, and photo storage, and{' '}
              <strong>Resend</strong> (when enabled in deployment configuration) for 6-digit sign-up
              verification codes and booking confirmation emails. When enabled, Resend receives the
              recipient's email address and booking details (such as club, location, court,
              schedule, amount, and payment reference) using a configured <code>@brinely.info</code>{' '}
              sender address such as <code>noreply@brinely.info</code> or{' '}
              <code>bookings@brinely.info</code>. If email sending is not configured, the app does
              not send external messages.
            </li>
            <li>
              <strong>Web hosting and maps:</strong> The app runs on static web and CDN hosting
              (including GitHub Pages for staging and configured <code>brinely.info</code> hosting).
              Where a club page has a map, it embeds <strong>OpenStreetMap</strong>, and choosing
              "Get directions" opens <strong>Google Maps</strong> with the public venue address or
              map pin. Those services receive standard browser and network request information when
              loaded or opened.
            </li>
          </ul>
          <p className="mt-2">
            Under Section 21(a) of RA 10173, cloud hosting and email providers may process or store
            data on servers outside the Philippines subject to security and contractual safeguards.
            Confirmed provider regions and the complete subprocessor list remain subject to final
            confirmation. We may also disclose information when required by law or valid legal
            order.
          </p>
        </>
      ),
    },
    {
      title: 'Club pages and public information',
      content: (
        <p>
          Club admins choose what to publish on public club pages. This can include club contact
          details, venue locations, court rates, amenities, coaches' names, headlines, biographies,
          contact details and photos, and club, venue, or court photos. A club may also publish
          payment instructions, including an account name or number and a QR image, so players can
          pay the club directly. These details and images may be visible to anyone on the internet.
          bRineLy does not take, hold, or verify direct-to-club payments. Clubs should publish only
          information and images they are authorized to share.
        </p>
      ),
    },
    {
      title: 'Browser storage and cookies',
      content: (
        <>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Live mode:</strong> Uses essential browser storage (<code>localStorage</code>)
              to maintain your sign-in session and remember your last selected club, and{' '}
              <code>sessionStorage</code> to hold a chosen court slot while you sign in or create an
              account.
            </li>
            <li>
              <strong>Demo mode:</strong> When database settings are absent, demo data is stored
              locally in your browser (<code>localStorage</code>), never stores passwords, and
              remains separate from live club servers.
            </li>
            <li>
              <strong>No ad tracking:</strong> bRineLy does not use advertising cookies or
              cross-site behavioral trackers.
            </li>
          </ul>
        </>
      ),
    },
    {
      title: 'Minors and youth players',
      content: (
        <p>
          Portal accounts are intended for individuals aged 18 and older (the age of majority in
          the Philippines). Where a participating club allows junior or youth players under 18 in
          court bookings, open play, or coaching lessons, registration and bookings should be
          completed by or with the verifiable consent and supervision of a parent or legal
          guardian. Specific club age-verification and guardian rules remain subject to final
          confirmation with participating clubs.
        </p>
      ),
    },
    {
      title: 'Retention and security',
      content: (
        <>
          <p>We keep personal information only as long as needed for its stated purpose:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Hashed authentication rate-limit records automatically purge after 5 minutes.
            </li>
            <li>
              Active account and club membership records are kept while your account or membership
              remains active, or as needed to manage your club relationship.
            </li>
            <li>
              Confirmed booking, payment-reference, transaction, and platform commission records are
              retained for club accounting and Philippine tax recordkeeping.
            </li>
            <li>
              Support inquiries, coaching threads, closed court-owner requests, platform audit logs,
              and backups are kept for operational accountability and disaster recovery. Specific
              numerical retention schedules and automated purge periods remain pending final
              confirmation.
            </li>
          </ul>
          <p className="mt-2">
            We apply organizational, physical, and technical safeguards including database row-level
            security, club and venue access boundaries, hashed authentication rate limits, HTTPS
            encryption in transit, and audited read-only support views. No method of storage or
            transmission can be guaranteed completely secure.
          </p>
        </>
      ),
    },
    {
      title: 'Your rights under RA 10173',
      content: (
        <>
          <p>Subject to legal conditions and exceptions, you have the right to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Be informed about how your personal information is processed and access it.</li>
            <li>Object to processing, or request correction, erasure, or blocking.</li>
            <li>Request data portability where applicable.</li>
            <li>
              Withdraw consent where processing is based on consent, without affecting prior lawful
              processing.
            </li>
            <li>
              File a complaint with the National Privacy Commission and seek indemnification or
              remedies provided by law.
            </li>
          </ul>
          <p className="mt-2">
            Because self-service profile editing and account deletion are not yet built into the
            app, ask your club's staff or admin to update club membership, walk-in, or booking
            records, or contact the platform privacy contact below for portal account access,
            correction, or deletion requests. We may verify your identity before acting on a request
            to protect your account.
          </p>
        </>
      ),
    },
    {
      title: 'Privacy contact and notice updates',
      content: (
        <>
          {club.isGensan ? (
            <p>
              For a privacy question or data rights request, email {portalContactLink}. This is a
              provisional contact pending confirmation of dedicated Data Protection Officer (DPO)
              or Compliance Officer for Privacy (COP) details, physical contact details, and
              confirmed response timelines.
            </p>
          ) : (
            <p>
              For questions or requests about club memberships, court bookings, coaching records, or
              direct payments, ask the staff at {clubLabel}. For bRineLy portal account privacy
              requests, email {portalContactLink}. A dedicated Data Protection Officer contact and
              confirmed response timelines have not been finalized yet.
            </p>
          )}
          <p className="mt-2">
            <strong>Changes to this notice:</strong> We may update this Privacy Notice when
            features, service providers, or legal requirements change, and will post updates here
            with a revised "Last updated" date. Final entity names, DPO details, and numerical
            retention schedules will be confirmed with a qualified Philippine privacy professional
            before official production sign-off.
          </p>
        </>
      ),
    },
    { title: 'Photo credits', content: <PhotoCredits /> },
  ]
}

/** "Who we are" becomes "who-we-are"; the site footer links to `/privacy#photo-credits`. */
function sectionId(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** The club this notice is for: the join link's club, the signed-in club, or the default club. */
function useNoticeClub(slug: string): NoticeClub {
  const { activeClub } = useAuth()
  const knownName = slug === activeClub?.slug ? activeClub.name : null
  const [lookedUp, setLookedUp] = useState<{ slug: string; name: string | null } | null>(null)

  useEffect(() => {
    if (slug === DEFAULT_CLUB_SLUG || knownName) return
    let cancelled = false
    api
      .publicClub(slug)
      .then((club) => {
        if (!cancelled) setLookedUp({ slug, name: club?.name ?? null })
      })
      .catch(() => {
        if (!cancelled) setLookedUp({ slug, name: null })
      })
    return () => {
      cancelled = true
    }
  }, [knownName, slug])

  return {
    isGensan: slug === DEFAULT_CLUB_SLUG,
    name: knownName ?? (lookedUp?.slug === slug ? lookedUp.name : null),
  }
}

/** Only same-app paths are followed, never another site. */
function safeReturnPath(value: unknown) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : null
}

function backLabel(path: string) {
  if (path === '/login') return 'Back to login'
  if (path.startsWith('/join/')) return 'Back to sign-up'
  if (path.endsWith('/help')) return 'Back to Help'
  return 'Back'
}

export function PrivacyNoticePage() {
  const { user, activeClub } = useAuth()
  const location = useLocation()
  const [params] = useSearchParams()
  const clubParam = params.get('club')
  const slug = clubParam ?? activeClub?.slug ?? DEFAULT_CLUB_SLUG
  const club = useNoticeClub(slug)

  const backTo =
    safeReturnPath((location.state as PrivacyNoticeState | null)?.from) ??
    (user ? homeFor(user.role) : clubParam ? `/join/${encodeURIComponent(clubParam)}` : '/login')

  const subtitle = club.isGensan
    ? 'For bRineLy booking portal users'
    : club.name
      ? `For ${club.name} players on the bRineLy booking portal`
      : 'For bRineLy booking portal users'

  const noticeSections = sections(club)
  // Set by a contents link, so the jump also moves keyboard focus to that section.
  const jumpedByLink = useRef(false)

  // HashRouter keeps the section in the router's location (`/privacy#photo-credits`), so the
  // browser cannot jump there itself. Scroll on arrival and after each contents link.
  useEffect(() => {
    let id = location.hash.replace(/^#/, '')
    try {
      id = decodeURIComponent(id)
    } catch {
      // A malformed address keeps its raw text, which matches no section.
    }
    // "Back to top" scrolls the whole page and puts focus back at the start of the notice.
    const toTop = id === 'top'
    const target = toTop ? document.documentElement : id ? document.getElementById(id) : null
    if (!target) return
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    if (jumpedByLink.current) {
      jumpedByLink.current = false
      const focusTarget = toTop ? document.getElementById('privacy-notice') : target.querySelector<HTMLElement>('h2')
      focusTarget?.focus({ preventScroll: true })
    }
  }, [location.hash, location.key])

  const backLink = (
    <Link className="text-link inline-flex min-h-12 items-center" to={backTo}>
      {backLabel(backTo)}
    </Link>
  )

  // A legal page: no marketing line here (the site footer carries it).
  const tagline = <p className="text-body text-muted">Last updated: November 25, 2026</p>

  const backToTop = (
    <p className="mt-2 border-t border-line pt-4">
      <Link
        to={{ pathname: location.pathname, search: location.search, hash: '#top' }}
        state={location.state}
        replace
        onClick={() => {
          jumpedByLink.current = true
        }}
        className="text-link inline-flex min-h-12 items-center"
      >
        Back to top
      </Link>
    </p>
  )

  const body = (
    <>
      <nav aria-labelledby="privacy-contents" className="mt-4 border-y border-line py-4">
        <p id="privacy-contents" className="text-subtitle font-semibold text-ink">
          On this page
        </p>
        <ul className="mt-1 grid sm:grid-cols-2 sm:gap-x-6">
          {noticeSections.map(({ title }) => (
            <li key={title}>
              <Link
                to={{ pathname: location.pathname, search: location.search, hash: `#${sectionId(title)}` }}
                state={location.state}
                replace
                onClick={() => {
                  jumpedByLink.current = true
                }}
                className="text-link inline-flex min-h-12 items-center font-normal"
              >
                {title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="divide-y divide-line">
        {noticeSections.map(({ title, content: sectionBody }) => {
          const id = sectionId(title)
          return (
            <section key={title} id={id} aria-labelledby={`privacy-${id}`} className="scroll-mt-24 py-6">
              <h2 id={`privacy-${id}`} tabIndex={-1} className="text-heading-3 font-semibold text-ink focus:outline-none">
                {title}
              </h2>
              <div className="mt-2 text-subtitle leading-relaxed text-ink">{sectionBody}</div>
            </section>
          )
        })}
      </div>
      {backToTop}
    </>
  )

  // Visitors get the public site frame; signed-in players keep their menu.
  if (!user) {
    return (
      <PublicFrame title="Privacy Notice" subtitle={subtitle} width="narrow">
        <div id="privacy-notice" tabIndex={-1} className="max-w-[68ch] focus:outline-none">
          {tagline}
          <div className="mt-2">{backLink}</div>
          {body}
        </div>
      </PublicFrame>
    )
  }

  return (
    <AppShell role={user.role}>
      <main className="app-content-rail safe-bottom mx-auto w-full py-6 sm:py-10">
        <div id="privacy-notice" tabIndex={-1} className="mx-auto max-w-[68ch] focus:outline-none">
          {backLink}
          <header className="mt-4">
            <h1 className="text-heading-1 font-semibold text-ink">Privacy Notice</h1>
            <p className="mt-2 text-subtitle text-muted">{subtitle}</p>
            <div className="mt-1">{tagline}</div>
          </header>
          {body}
        </div>
      </main>
    </AppShell>
  )
}
