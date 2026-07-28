import { useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Shield, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../types'
import { AnimatedShaderHero } from '../components/ui/animated-shader-hero'

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
  const formRef = useRef<HTMLDivElement>(null)
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

  function scrollToForm() {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="app-shell flex flex-col overflow-y-auto">
      <AnimatedShaderHero
        minHeight="auto"
        className="flex-1 min-h-[100dvh]"
        trustBadge={{
          text: demo ? 'Demo mode · local data' : 'Connected to Supabase',
          icons: ['✨'],
        }}
        headline={{
          line1: 'Rally Point',
          line2: 'Courts. Members. Ops.',
        }}
        subtitle="Court rental & membership for phone-first clubs — check-in, rentals, walk-ins, and revenue in one place."
        buttons={{
          primary: {
            text: 'Sign in',
            onClick: scrollToForm,
          },
          secondary: {
            text: 'PHP pricing',
            onClick: scrollToForm,
          },
        }}
      >
        <div
          ref={formRef}
          className="rounded-2xl border border-white/15 bg-white/95 p-4 text-slate-900 shadow-2xl shadow-black/40 backdrop-blur-xl"
        >
          <p className="mb-3 text-center text-xs font-bold uppercase tracking-wide text-slate-400">
            Club access
          </p>
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="username"
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
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {demo ? (
            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
                Quick demo logins
              </p>
              <div className="grid grid-cols-3 gap-2">
                {demos.map((d) => (
                  <button
                    key={d.role}
                    type="button"
                    className="card p-3 text-left active:scale-[0.98] transition"
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
          ) : null}
        </div>
      </AnimatedShaderHero>
    </div>
  )
}
