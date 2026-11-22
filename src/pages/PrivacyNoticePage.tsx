import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
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
  return [
    {
      title: 'Who we are',
      content: (
        <p>
          {club.isGensan
            ? 'bRineLy is the booking portal for club players.'
            : `${club.name ?? 'Your club'} is the club named in this notice, and bRineLy is the booking portal it uses.`}{' '}
          bRineLy is used by multiple clubs. The registered entities responsible for the portal
          and each club, and whether they act as separate or joint personal information controllers
          or processors, have not yet been confirmed. This is a working draft, not a final or
          legally approved notice.
        </p>
      ),
    },
    {
      title: 'Personal information we collect',
      content: (
        <>
          <p>Depending on how you use the app, we may collect:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Account details such as your name, email address, and optional phone number. For an
              owner account, this can also include the email address used for an owner invitation
              and whether that invitation was claimed or cancelled.
            </li>
            <li>
              Club service details such as membership status, bookings, open-play sign-ups,
              check-in times and QR identifiers, and support inquiry subjects and messages.
            </li>
            <li>
              Payment and transaction details recorded for club services, such as amounts,
              payment method, and references. Online checkout in the app is currently simulated;
              the app does not have a live online payment processor.
            </li>
            <li>
              If you ask us to call you about listing your club: your name, your club or venue name and
              city, how many courts it has, your mobile number or email, when you would like the call,
              and any message. Only authorized platform superadmins can view these requests.
            </li>
            <li>
              Information club admins enter to operate or list a club, such as venue addresses and
              map pins, court and venue details, rates, business contact details, coach names,
              biographies and contact details, and uploaded photos. Some of this information may
              identify a person.
            </li>
          </ul>
          <p className="mt-2">
            We receive account and owner-request details from the person using the app. Club staff
            and admins may enter member, invitation, coach, and business-listing details. Club
            admins choose which club information to publish publicly.
          </p>
          <p className="mt-2">
            Do not send sensitive personal information unless it is needed for a specific service
            and we explain why it is required.
          </p>
        </>
      ),
    },
    {
      title: 'Why we use information and lawful bases',
      content: (
        <>
          <p>
            We use information to create and manage accounts, provide memberships and bookings,
            support open-play and check-in, record transactions, respond to support inquiries,
            contact court owners who ask about listing, manage owner invitations, publish club
            listings at the club's direction, maintain the service, and meet legal requirements.
          </p>
          <p className="mt-2">
            The Philippine Data Privacy Act of 2012 (RA 10173) allows processing only on a
            permitted legal basis. Depending on the purpose, possible bases include your consent,
            steps you request before a service or performance of a contract, a legal obligation,
            or a legitimate interest that does not override your rights. The responsible entity
            must confirm the basis for each purpose before this draft is used as the official
            notice. If sensitive personal information is processed, an applicable basis under the
            Act must be confirmed.
          </p>
        </>
      ),
    },
    {
      title: 'Who can see information',
      content: (
        <>
          <p>
            Club staff and admins with the required club role can access information needed to run
            that club, such as member, booking, check-in, and support records. Authorized platform
            superadmins can see owner call requests and owner-invitation details.
          </p>
          <p className="mt-2">
            A superadmin may also open a reason-recorded, time-limited, read-only support view of
            one club. It shows club settings, counts, today's schedule, and open inquiry subjects
            and status. It does not show member names, contact details, or payment records. Opening
            and reading the support view is recorded in an audit log.
          </p>
          <p className="mt-2">
            We use Supabase for account, database, and photo-storage services. The app is currently
            served through GitHub Pages. Where a club page has a map, it embeds OpenStreetMap;
            choosing “Get directions,” when available, opens Google Maps with the public venue
            address or map pin. Those map services may receive your browser or network information
            when their content is loaded or opened. The full provider list, provider locations, and
            any cross-border access have not been confirmed.
          </p>
          <p className="mt-2">
            The app includes a server-side integration for booking confirmation emails through
            Resend. When email sending is enabled, Resend receives the recipient's email address
            and the booking details included in the confirmation, such as the club, court, schedule,
            amount, and any payment reference. The intended sender is no-reply@brinely.info, but the
            sender address is controlled by deployment configuration and its live setting has not
            been verified. If email sending is not configured, the app does not send the message.
          </p>
          <p className="mt-2">
            We may also disclose information when required by law. This is not yet a complete,
            verified list of service providers or recipients.
          </p>
        </>
      ),
    },
    {
      title: 'Club pages and public information',
      content: (
        <p>
          Club admins choose what to publish on public club pages. This can include club contact
          details, venue locations, court rates, amenities, coaches' names, biographies, contact
          details and photos, and club, venue, or court photos. A club may also publish payment
          instructions, including an account name or number and a QR image, so players can pay the
          club directly. These details and images may be visible to anyone on the internet. bRineLy
          does not take, hold, or verify those direct-to-club payments. Clubs should only
          publish information and images they are authorized to share.
        </p>
      ),
    },
    {
      title: 'Retention and security',
      content: (
        <>
          <p>
            We keep personal information only for as long as needed for the purposes above and
            applicable legal or operational requirements. Specific retention periods, including
            for closed owner requests, account records, backups, and support audit logs, have not
            been confirmed. A documented retention schedule is needed before this notice is final.
          </p>
          <p className="mt-2">
            We aim to use reasonable organizational, physical, and technical safeguards to
            protect information from unauthorized access, use, or disclosure. No method of
            storage or transmission can be guaranteed completely secure. Demo-mode information
            is stored in your browser and is separate from live club records.
          </p>
        </>
      ),
    },
    {
      title: 'Details to confirm before this notice is official',
      content: (
        <>
          <p>
            The current app does not yet have confirmed notice details for:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              The legal name and contact details of each responsible organization, and how the
              clubs and platform divide privacy responsibilities.
            </li>
            <li>A verified privacy contact and a process for receiving, verifying, and answering requests.</li>
            <li>Purpose-by-purpose legal bases and retention periods, including deletion and backup schedules.</li>
            <li>The complete provider and recipient list, hosting locations, and any international transfers or access.</li>
            <li>
              Whether automated decisions, analytics, or other tracking are used, and how the
              service handles information about minors, if they may use it.
            </li>
            <li>The approved security, incident response, and notice-change procedures.</li>
          </ul>
          <p className="mt-2">
            Confirm these details with the responsible organizations and have the final notice
            reviewed by a qualified Philippine privacy professional before treating it as official.
          </p>
        </>
      ),
    },
    {
      title: 'Your rights under RA 10173',
      content: (
        <>
          <p>Subject to legal conditions and exceptions, you may have the right to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Be informed about how your personal information is processed and access it.</li>
            <li>Object to processing, or request correction, erasure, or blocking.</li>
            <li>Request data portability where applicable.</li>
            <li>File a complaint with the National Privacy Commission and seek remedies provided by law.</li>
          </ul>
          <p className="mt-2">
            You may also withdraw consent where processing is based on consent. This does not
            affect processing already carried out lawfully.
          </p>
        </>
      ),
    },
    {
      title: 'Privacy contact',
      content: club.isGensan ? (
        <p>
          For a privacy question or request, email{' '}
          <a
            className="inline-flex min-h-12 items-center font-semibold text-brand-800 underline"
            href={`mailto:${brinelyPrivacyEmail}`}
          >
            {brinelyPrivacyEmail}
          </a>
          . This is a provisional contact pending confirmation that it is the correct address for
          privacy questions and requests. It has not been confirmed as a dedicated Data Protection
          Officer contact.
        </p>
      ) : (
        <p>
          For a privacy question or request, ask the staff at {clubLabel}. A dedicated Data
          Protection Officer contact has not been confirmed yet.
        </p>
      ),
    },
  ]
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

  const content = (
    <main className="app-content-rail safe-bottom mx-auto w-full py-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          className="inline-flex min-h-12 items-center font-semibold text-brand-800 underline underline-offset-2"
          to={backTo}
        >
          {backLabel(backTo)}
        </Link>
        <header className="mt-4 border-b border-slate-200 pb-5">
          <h1 className="text-heading-1 font-extrabold tracking-tight text-slate-950">
            Privacy Notice
          </h1>
          <p className="mt-2 text-body text-slate-600">{subtitle}</p>
          <p className="mt-1 text-caption text-slate-500">Stay in the brine. Play more.</p>
          <p className="mt-1 text-caption text-slate-500">
            Last updated: November 22, 2026
          </p>
        </header>

        <div className="mt-5 space-y-4">
          {sections(club).map(({ title, content: body }) => (
            <section
              key={title}
              aria-labelledby={`privacy-${title.toLowerCase().replaceAll(' ', '-')}`}
              className="card p-4 sm:p-5"
            >
              <h2
                id={`privacy-${title.toLowerCase().replaceAll(' ', '-')}`}
                className="text-title font-bold text-slate-900"
              >
                {title}
              </h2>
              <div className="mt-2 text-body leading-relaxed text-slate-700">{body}</div>
            </section>
          ))}
        </div>
      </div>
    </main>
  )

  // Signed-in players keep their menu; visitors see the page on its own.
  if (user) return <AppShell role={user.role}>{content}</AppShell>
  return <div className="app-shell app-shell-desktop">{content}</div>
}
