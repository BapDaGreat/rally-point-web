import { useEffect, useState } from 'react'
import { AppHeader, AppShell, LoadingBlock, SignOutButton } from '../components/Shell'
import { api } from '../lib/api'
import type { Booking, Role } from '../types'
import { fmtDateTime, peso } from '../types'

export function BookingsDesk({ role }: { role: 'staff' | 'admin' }) {
  const [rows, setRows] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const list = await api.listBookings()
        setRows(list)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load bookings')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <AppShell role={role as Role}>
      <AppHeader
        title="Online bookings"
        subtitle="Member self-service court holds"
        right={<SignOutButton />}
      />
      <main className="safe-bottom px-4 pt-4 space-y-3">
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <section className="card p-4 text-sm text-red-600">{error}</section>
        ) : rows.length === 0 ? (
          <section className="card p-4 text-sm text-slate-500">No online bookings yet.</section>
        ) : (
          <section className="card p-2">
            {rows.map((b) => (
              <div key={b.id} className="list-row px-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">
                    {b.court?.name ?? 'Court'} · {b.member?.full_name ?? 'Member'}
                  </p>
                  <p className="text-xs text-slate-400">
                    {fmtDateTime(b.start_at)} · {b.hours}h ·{' '}
                    <span className="capitalize">{b.status.replace('_', ' ')}</span>
                    {b.payment_method ? ` · ${b.payment_method}` : ''}
                  </p>
                  {b.payment_ref ? (
                    <p className="text-[10px] font-mono text-slate-400 mt-0.5">{b.payment_ref}</p>
                  ) : null}
                </div>
                <p className="font-bold text-sm whitespace-nowrap">{peso(b.amount)}</p>
              </div>
            ))}
          </section>
        )}
      </main>
    </AppShell>
  )
}

export function StaffBookings() {
  return <BookingsDesk role="staff" />
}

export function AdminBookings() {
  return <BookingsDesk role="admin" />
}
