import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight, Shield, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../types'
import { ShaderCanvas } from '../components/ui/animated-shader-hero'
import { RallyPointLogo } from '../components/RallyPointLogo'

const demos: { role: Role; email: string; password: string; label: string }[] = [
  { role: 'admin', email: 'admin@rallypoint.local', password: 'admin123', label: 'Admin' },
  { role: 'staff', email: 'staff@rallypoint.local', password: 'staff123', label: 'Staff' },
  { role: 'member', email: 'member@rallypoint.local', password: 'member123', label: 'Member' },
]

function homeFor(role: Role) {
  if (role === 'admin') return '/admin'
  if (role === 'staff') return '/staff'
  return '/member'
}

export default function LoginPage() {
  const { user, loading, signIn, demo } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to={homeFor(user.role)} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const profile = await signIn(email, password)
      nav(homeFor(profile.role), { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed'
      setError(
        /invalid login credentials/i.test(msg)
          ? 'Invalid email or password. Use your Supabase admin account (not the old demo logins).'
          : msg,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell app-shell-bleed relative min-h-[100dvh] text-white overflow-hidden">
      <ShaderCanvas className="!fixed inset-0" />
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(20,184,166,0.22),transparent_50%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/50"
        aria-hidden
      />

      {/* Desktop: split brand | form. Mobile: stacked hero concept. */}
      <div className="relative z-10 mx-auto grid min-h-[100dvh] w-full max-w-6xl grid-cols-1 lg:grid-cols-2 lg:items-center lg:gap-12 px-5 py-10 sm:px-8 lg:px-10">
        {/* Brand panel — login concept */}
        <div className="flex flex-col justify-center text-center lg:text-left pt-6 lg:pt-0 pb-8 lg:pb-0">
          <div className="mb-5 inline-flex self-center lg:self-start items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-sm font-semibold text-white/95 backdrop-blur-md">
            <span aria-hidden>🏓</span>
            {demo ? 'Try it now · demo' : 'Pickleball club app'}
          </div>

          <div className="mb-4 flex justify-center lg:justify-start">
            <RallyPointLogo
              variant="color"
              className="h-24 sm:h-28 w-auto drop-shadow-2xl"
              title="Rally Point"
            />
          </div>

          <h1 className="sr-only">Rally Point</h1>
          <p className="text-3xl sm:text-4xl xl:text-5xl font-extrabold leading-[1.08] tracking-tight text-center lg:text-left">
            <span className="block bg-gradient-to-r from-teal-200 via-cyan-200 to-violet-300 bg-clip-text text-transparent">
              Book. Play. Pay.
            </span>
          </p>

          <p className="mt-5 max-w-md mx-auto lg:mx-0 text-base sm:text-lg leading-relaxed text-white/85">
            Simple court booking and membership for every age. Book a court, join open play, or show
            your QR at the desk.
          </p>

          <div className="mt-8 hidden lg:flex flex-wrap gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-md">
              <p className="text-sm font-bold text-teal-200">1 · Book</p>
              <p className="text-base font-semibold text-white/95">Choose court & time</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-md">
              <p className="text-sm font-bold text-teal-200">2 · Pay</p>
              <p className="text-base font-semibold text-white/95">GCash, Maya, or card</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-md">
              <p className="text-sm font-bold text-teal-200">3 · Play</p>
              <p className="text-base font-semibold text-white/95">Show QR at the desk</p>
            </div>
          </div>
        </div>

        {/* Access card */}
        <div className="flex items-center justify-center lg:justify-end pb-8 lg:pb-0">
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-white p-5 sm:p-7 text-slate-900 shadow-2xl shadow-black/40">
            <div className="mb-5">
              <p className="text-sm font-bold text-slate-500">Welcome</p>
              <h2 className="mt-1 text-2xl font-extrabold text-slate-900">Log in</h2>
              <p className="mt-1.5 text-base text-slate-600">Enter the email and password from your club.</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-3.5">
              <div>
                <label className="label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  autoComplete="username"
                  placeholder="you@club.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error ? (
                <p className="text-sm font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  {error}
                </p>
              ) : null}
              <button className="btn-primary gap-2" type="submit" disabled={busy}>
                {busy ? 'Please wait…' : 'Log in'}
                {!busy ? <ArrowRight size={18} aria-hidden /> : null}
              </button>
            </form>

            {demo ? (
              <div className="mt-6 pt-5 border-t border-slate-100">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
                  Quick demo logins
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {demos.map((d) => (
                    <button
                      key={d.role}
                      type="button"
                      className="card p-3 text-left active:scale-[0.98] transition hover:border-teal-300"
                      onClick={() => {
                        setEmail(d.email)
                        setPassword(d.password)
                      }}
                    >
                      <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center mb-2">
                        {d.role === 'admin' ? <Shield size={16} /> : <UserRound size={16} />}
                      </div>
                      <p className="text-sm font-bold text-slate-800">{d.label}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">{d.password}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-5 text-center text-[11px] text-slate-400">
                PHP pricing · mobile & desktop
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
