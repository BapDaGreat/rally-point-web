import { Link } from 'react-router-dom'
import { Building2, ChevronRight, UserRound } from 'lucide-react'
import { PublicFrame } from '../components/PublicFrame'
import { stagger } from '../lib/motion'

const choices = [
  {
    to: '/clubs',
    icon: UserRound,
    title: 'I’m a player',
    body: 'Find a club near you and book a court.',
  },
  {
    to: '/owners',
    icon: Building2,
    title: 'I own a court',
    body: 'List your club on Rally Point. Ask us for a call.',
  },
]

/** Where visitors start: players go to Find a court, court owners to the owner page. */
export function WelcomePage() {
  return (
    <PublicFrame title="Welcome to Rally Point" subtitle="Book a pickleball court near you" accountLinks="login">
      <h2 className="enter-rise text-subtitle font-semibold text-slate-900">How can we help you today?</h2>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {choices.map(({ to, icon: Icon, title, body }, index) => (
          <li key={to} className="enter-rise" style={stagger(index + 1)}>
            <Link to={to} className="control-feedback card flex h-full min-h-24 items-center gap-4 p-5">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-800" aria-hidden>
                <Icon size={28} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-subtitle font-bold text-slate-900">{title}</span>
                <span className="block text-body text-slate-600">{body}</span>
              </span>
              <ChevronRight className="shrink-0 text-slate-400" size={22} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <p className="enter-rise text-body text-slate-600" style={stagger(3)}>
        <Link to="/privacy" className="control-feedback inline-flex min-h-12 items-center font-semibold text-brand-800 underline">
          Privacy Notice
        </Link>
      </p>
    </PublicFrame>
  )
}
