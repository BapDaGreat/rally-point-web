import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Activity, Shield, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../types'

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
    <div className="app-shell flex flex-col">
      <div className="flex-1 px-5 pt-10 pb-8 flex flex-col">
        <div className="mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-700 text-white flex items-center justify-center shadow-lg shadow-teal-900/20">
            <Activity size={28} />
          </div>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-900">Rally Point</h1>
          <p className="mt-2 text-slate-500 text-[15px] leading-relaxed">
            Court rental & membership — built for phones. Sign in to continue.
          </p>
          {demo ? (
            <p className="mt-3 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              Demo mode (no Supabase keys). Use the quick logins below.
            </p>
          ) : (
            <p className="mt-3 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
              Connected to Supabase.
            </p>
          )}
        </div>

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
          <div className="mt-8">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Quick demo logins</p>
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

        <p className="mt-auto pt-8 text-center text-[11px] text-slate-400">Developed for mobile browsers · PHP pricing</p>
      </div>
    </div>
  )
}
