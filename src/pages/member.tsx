import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, ChevronRight, CreditCard, CalendarDays, QrCode, Users } from 'lucide-react'
import { AppHeader, AppShell, LoadingBlock, SignOutButton } from '../components/Shell'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import type { Member, Notification, Transaction } from '../types'
import { fmtDate, peso, friendlyStatus } from '../types'

export function MemberHome() {
  const { user } = useAuth()
  const [member, setMember] = useState<Member | null>(null)
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [txs, setTxs] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    void (async () => {
      setLoading(true)
      const [m, n, t] = await Promise.all([
        api.memberForUser(user.id),
        api.notifications(user.id),
        api.transactions(user.id, 'member'),
      ])
      setMember(m)
      setNotifs(n)
      setTxs(t.slice(0, 3))
      setLoading(false)
    })()
  }, [user])

  const unread = notifs.filter((n) => !n.read).length
  const firstName = user?.full_name.split(' ')[0] ?? 'there'

  return (
    <AppShell role="member">
      <AppHeader
        title={`Hi, ${firstName}`}
        subtitle="What do you want to do?"
        right={<SignOutButton />}
      />
      <main className="safe-bottom px-4 pt-4 space-y-4">
        {loading ? (
          <LoadingBlock />
        ) : (
          <>
            <section className="stat-card">
              <p className="text-teal-100 text-sm font-bold">Your membership</p>
              <p className="text-2xl font-extrabold mt-1">
                {friendlyStatus(member?.membership_type ?? '—')} plan
              </p>
              <div className="mt-3 flex items-center justify-between gap-2 text-base">
                <span className="text-teal-50 font-semibold">ID {member?.member_code ?? '—'}</span>
                <span
                  className={`pill ${member?.status === 'active' ? 'bg-white/25 text-white' : 'bg-amber-300 text-amber-950'}`}
                >
                  {friendlyStatus(member?.status ?? 'n/a')}
                </span>
              </div>
              <p className="mt-3 text-base text-teal-50 flex items-center gap-2">
                <CalendarDays size={18} aria-hidden /> Valid until{' '}
                {member ? fmtDate(member.expiry_date) : '—'}
              </p>
            </section>

            <div>
              <h2 className="text-base font-extrabold text-slate-800 mb-2 px-0.5">Quick actions</h2>
              <div className="grid grid-cols-2 gap-3">
                <Link to="/member/book" className="action-tile">
                  <span className="action-tile-icon" aria-hidden>
                    <CalendarDays size={24} />
                  </span>
                  <span className="action-tile-title">Book a court</span>
                  <span className="action-tile-sub">Pick time & pay</span>
                </Link>
                <Link to="/member/open" className="action-tile">
                  <span className="action-tile-icon" aria-hidden>
                    <Users size={24} />
                  </span>
                  <span className="action-tile-title">Join open play</span>
                  <span className="action-tile-sub">Drop-in games</span>
                </Link>
                <Link to="/member/pass" className="action-tile">
                  <span className="action-tile-icon" aria-hidden>
                    <QrCode size={24} />
                  </span>
                  <span className="action-tile-title">Show my QR</span>
                  <span className="action-tile-sub">For check-in</span>
                </Link>
                <Link to="/member/pay" className="action-tile">
                  <span className="action-tile-icon" aria-hidden>
                    <CreditCard size={24} />
                  </span>
                  <span className="action-tile-title">Pay dues</span>
                  <span className="action-tile-sub">Renew plan</span>
                </Link>
              </div>
            </div>

            <Link
              to="/member/notifications"
              className="card p-4 flex items-center gap-3 active:scale-[0.99] transition min-h-[72px]"
            >
              <span className="action-tile-icon shrink-0" aria-hidden>
                <Bell size={22} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-base">Messages</p>
                <p className="text-sm text-slate-600">Bookings & reminders</p>
              </div>
              {unread ? (
                <span className="text-sm font-extrabold bg-red-600 text-white rounded-full min-w-8 h-8 px-2 flex items-center justify-center">
                  {unread}
                </span>
              ) : (
                <ChevronRight className="text-slate-400" size={22} aria-hidden />
              )}
            </Link>

            <section className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-extrabold text-base">Recent payments</h2>
                <Link to="/member/transactions" className="text-sm font-extrabold text-brand-800 min-h-11 inline-flex items-center">
                  See all
                </Link>
              </div>
              {txs.length === 0 ? (
                <p className="text-base text-slate-600 py-3">No payments yet.</p>
              ) : (
                txs.map((t) => (
                  <div key={t.id} className="list-row">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-base truncate">{t.description}</p>
                      <p className="text-sm text-slate-500">{fmtDate(t.created_at)}</p>
                    </div>
                    <p className="font-extrabold text-base whitespace-nowrap">{peso(t.amount)}</p>
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </main>
    </AppShell>
  )
}

export function MemberPay() {
  const { user } = useAuth()
  const [member, setMember] = useState<Member | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const amount = 2500

  useEffect(() => {
    if (!user) return
    void api.memberForUser(user.id).then(setMember)
  }, [user])

  async function pay() {
    if (!user || !member) return
    setBusy(true)
    try {
      await api.payMembership(member.id, amount, user.id)
      setMember(await api.memberForUser(user.id))
      setMsg('Payment recorded. Membership extended 30 days.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Payment failed')
    } finally {
      setBusy(false)
      setTimeout(() => setMsg(null), 3500)
    }
  }

  return (
    <AppShell role="member">
      <AppHeader title="Online payment" subtitle="Membership renewal" right={<SignOutButton />} />
      <main className="safe-bottom px-4 pt-4 space-y-4">
        <section className="card p-4">
          <p className="text-xs font-bold uppercase text-slate-400">Amount due</p>
          <p className="text-3xl font-extrabold text-slate-900 mt-1">{peso(amount)}</p>
          <p className="text-sm text-slate-500 mt-2 capitalize">
            {member?.membership_type ?? '—'} plan · {member?.member_code}
          </p>
        </section>
        <section className="card p-4 space-y-3">
          <div>
            <label className="label">Cardholder</label>
            <input className="input" defaultValue={user?.full_name} />
          </div>
          <div>
            <label className="label">Card number</label>
            <input className="input" placeholder="4242 4242 4242 4242" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Expiry</label>
              <input className="input" placeholder="MM/YY" />
            </div>
            <div>
              <label className="label">CVC</label>
              <input className="input" placeholder="123" />
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Demo checkout — no real card charge. Connect a payment provider later if needed.
          </p>
          <button className="btn-primary" type="button" disabled={busy || !member} onClick={() => void pay()}>
            {busy ? 'Processing…' : `Pay ${peso(amount)}`}
          </button>
        </section>
      </main>
      {msg ? <div className="toast">{msg}</div> : null}
      </AppShell>
  )
}

export function MemberTransactions() {
  const { user } = useAuth()
  const [rows, setRows] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    void api.transactions(user.id, 'member').then((t) => {
      setRows(t)
      setLoading(false)
    })
  }, [user])

  return (
    <AppShell role="member">
      <AppHeader title="Transactions" subtitle="Your payments" right={<SignOutButton />} />
      <main className="safe-bottom px-4 pt-4">
        {loading ? (
          <LoadingBlock />
        ) : (
          <section className="card p-4">
            {rows.map((t) => (
              <div key={t.id} className="list-row">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{t.description}</p>
                  <p className="text-xs text-slate-400 capitalize">
                    {t.type.replace('_', ' ')} · {fmtDate(t.created_at)}
                  </p>
                </div>
                <p className="font-bold text-sm">{peso(t.amount)}</p>
              </div>
            ))}
          </section>
        )}
      </main>
      </AppShell>
  )
}

export function MemberNotifications() {
  const { user } = useAuth()
  const [rows, setRows] = useState<Notification[]>([])

  async function load() {
    if (!user) return
    setRows(await api.notifications(user.id))
  }

  useEffect(() => {
    void load()
  }, [user])

  return (
    <AppShell role="member">
      <AppHeader title="Notifications" right={<SignOutButton />} />
      <main className="safe-bottom px-4 pt-4 space-y-2">
        {rows.map((n) => (
          <button
            key={n.id}
            type="button"
            className={`card p-4 w-full text-left ${n.read ? 'opacity-70' : 'ring-1 ring-brand-200'}`}
            onClick={() => void api.markNotifRead(n.id).then(load)}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-sm">{n.title}</p>
              {!n.read ? <span className="pill pill-brand">New</span> : null}
            </div>
            <p className="text-sm text-slate-600 mt-1">{n.body}</p>
            <p className="text-xs text-slate-400 mt-2">{fmtDate(n.created_at)}</p>
          </button>
        ))}
      </main>
      </AppShell>
  )
}

export function MemberProfile() {
  const { user } = useAuth()
  const [member, setMember] = useState<Member | null>(null)

  useEffect(() => {
    if (!user) return
    void api.memberForUser(user.id).then(setMember)
  }, [user])

  return (
    <AppShell role="member">
      <AppHeader title="Profile" right={<SignOutButton />} />
      <main className="safe-bottom px-4 pt-4 space-y-4">
        <section className="card p-4 flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-brand-100 text-brand-800 font-extrabold flex items-center justify-center text-lg">
            {(user?.full_name ?? '?')
              .split(' ')
              .map((p) => p[0])
              .slice(0, 2)
              .join('')}
          </div>
          <div className="min-w-0">
            <p className="font-extrabold text-lg truncate">{user?.full_name}</p>
            <p className="text-sm text-slate-500 truncate">{user?.email}</p>
          </div>
        </section>
        <section className="card p-4 space-y-3 text-sm">
          <Row label="Member ID" value={member?.member_code ?? '—'} />
          <Row label="Phone" value={user?.phone || member?.phone || '—'} />
          <Row label="Plan" value={member?.membership_type ?? '—'} />
          <Row label="Status" value={member?.status ?? '—'} />
          <Row label="Joined" value={member ? fmtDate(member.join_date) : '—'} />
          <Row label="Expires" value={member ? fmtDate(member.expiry_date) : '—'} />
        </section>
        <Link to="/member/pay" className="btn-secondary">
          Renew membership <ChevronRight size={16} />
        </Link>
      </main>
      </AppShell>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold capitalize text-right">{value}</span>
    </div>
  )
}
