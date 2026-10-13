import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  Building2,
  Coins,
  DollarSign,
  Plus,
  RefreshCw,
  TrendingUp,
  Users,
  ShieldCheck,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { AppHeader, AppShell, LoadingBlock, SignOutButton } from '../components/Shell'
import { api } from '../lib/api'
import type { Branch, PlatformCommission, SuperadminStats } from '../types'
import { fmtDateTime, peso } from '../types'

type SuperadminTab = 'overview' | 'branches' | 'commissions'

export function SuperadminPage() {
  const [tab, setTab] = useState<SuperadminTab>('overview')
  const [stats, setStats] = useState<SuperadminStats | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [commissions, setCommissions] = useState<PlatformCommission[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showNewBranchModal, setShowNewBranchModal] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // New branch form state
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [commissionRate, setCommissionRate] = useState(5.0)
  const [commissionType, setCommissionType] = useState<'percentage' | 'fixed'>('percentage')
  const [savingBranch, setSavingBranch] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [s, b, c] = await Promise.all([
        api.superadminStats(),
        api.branches(),
        api.commissions(),
      ])
      setStats(s)
      setBranches(b)
      setCommissions(c)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to load platform data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function handleRefresh() {
    setRefreshing(true)
    await loadData()
  }

  async function handleCreateBranch(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !slug.trim()) return
    setSavingBranch(true)
    try {
      await api.createBranch({
        name: name.trim(),
        slug: slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        city: city.trim(),
        address: address.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        commission_rate: Number(commissionRate) || 5.0,
        commission_type: commissionType,
        status: 'active',
      })
      setShowNewBranchModal(false)
      setName('')
      setSlug('')
      setCity('')
      setAddress('')
      setEmail('')
      setPhone('')
      setToast(`Branch "${name}" created successfully!`)
      await loadData()
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not create branch')
    } finally {
      setSavingBranch(false)
    }
  }

  async function handleToggleBranchStatus(branch: Branch) {
    const nextStatus = branch.status === 'active' ? 'suspended' : 'active'
    try {
      await api.updateBranchStatus(branch.id, nextStatus)
      setToast(`Branch "${branch.name}" is now ${nextStatus}.`)
      await loadData()
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to update branch')
    }
  }

  return (
    <AppShell role="superadmin">
      <AppHeader
        title="Platform Superadmin"
        subtitle="Multi-branch SaaS governance & commission engine"
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="control-feedback inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-caption font-semibold text-brand-800"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} aria-hidden />
              Refresh
            </button>
            <SignOutButton />
          </div>
        }
      />

      <main className="safe-bottom px-4 pt-4 space-y-4">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1" role="tablist">
          {[
            { id: 'overview' as const, label: 'Overview & KPIs', icon: TrendingUp },
            { id: 'branches' as const, label: `Branches (${branches.length})`, icon: Building2 },
            { id: 'commissions' as const, label: `Commissions (${commissions.length})`, icon: Coins },
          ].map((item) => {
            const Icon = item.icon
            const active = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`control-feedback inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-subtitle font-bold transition ${
                  active
                    ? 'bg-brand-800 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Icon size={18} aria-hidden />
                {item.label}
              </button>
            )
          })}
        </div>

        {loading ? (
          <LoadingBlock />
        ) : (
          <>
            {/* TAB: OVERVIEW */}
            {tab === 'overview' ? (
              <div className="space-y-4">
                {/* Global KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="stat-card">
                    <div className="flex items-center justify-between text-teal-100">
                      <span className="text-caption font-bold uppercase tracking-wider">Superadmin Cut</span>
                      <Coins size={20} />
                    </div>
                    <p className="text-3xl font-extrabold mt-2 text-white">
                      {peso(stats?.totalCommissionsEarned ?? 0)}
                    </p>
                    <p className="text-caption text-teal-100 mt-1">Platform commissions collected</p>
                  </div>

                  <div className="card p-4">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="text-caption font-bold uppercase tracking-wider">Gross Booking Volume</span>
                      <DollarSign size={20} className="text-brand-700" />
                    </div>
                    <p className="text-3xl font-extrabold mt-2 text-slate-900">
                      {peso(stats?.totalGrossVolume ?? 0)}
                    </p>
                    <p className="text-caption text-slate-500 mt-1">Total revenue across all branches</p>
                  </div>

                  <div className="card p-4">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="text-caption font-bold uppercase tracking-wider">Active Branches</span>
                      <Building2 size={20} className="text-brand-700" />
                    </div>
                    <p className="text-3xl font-extrabold mt-2 text-slate-900">
                      {stats?.activeBranchesCount ?? 0}
                    </p>
                    <p className="text-caption text-slate-500 mt-1">Live club locations</p>
                  </div>

                  <div className="card p-4">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="text-caption font-bold uppercase tracking-wider">Total Bookings</span>
                      <Users size={20} className="text-brand-700" />
                    </div>
                    <p className="text-3xl font-extrabold mt-2 text-slate-900">
                      {stats?.totalBookingsCount ?? 0}
                    </p>
                    <p className="text-caption text-slate-500 mt-1">Court sessions processed</p>
                  </div>
                </div>

                {/* Quick Branch Breakdown */}
                <section className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-title font-bold text-slate-900">Branch Performance</h2>
                      <p className="text-body text-slate-600 mt-0.5">Overview of active franchise branches</p>
                    </div>
                    <button
                      type="button"
                      className="btn-primary text-xs px-3"
                      onClick={() => setShowNewBranchModal(true)}
                    >
                      <Plus size={16} aria-hidden /> New branch
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {branches.map((b) => {
                      const branchComms = commissions.filter((c) => c.branch_id === b.id)
                      const branchGross = branchComms.reduce((acc, c) => acc + c.gross_amount, 0)
                      const branchCut = branchComms.reduce((acc, c) => acc + c.commission_amount, 0)

                      return (
                        <div key={b.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-subtitle font-bold text-slate-900">{b.name}</p>
                              <span
                                className={`pill ${b.status === 'active' ? 'pill-ok' : 'pill-warn'}`}
                              >
                                {b.status}
                              </span>
                            </div>
                            <p className="text-caption text-slate-500 mt-0.5">
                              {b.city} · Slug: <code className="text-brand-800 font-bold">{b.slug}</code> · Cut: {b.commission_rate}%
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-body font-bold text-slate-900">{peso(branchGross)} gross</p>
                            <p className="text-caption font-semibold text-teal-700 mt-0.5">
                              +{peso(branchCut)} commission
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              </div>
            ) : null}

            {/* TAB: BRANCHES */}
            {tab === 'branches' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-title font-bold text-slate-900">Branch Directory</h2>
                    <p className="text-body text-slate-600 mt-0.5">Manage club branches and customize commission percentages</p>
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setShowNewBranchModal(true)}
                  >
                    <Plus size={18} aria-hidden /> Add new branch
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {branches.map((b) => (
                    <article key={b.id} className="card p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-title font-extrabold text-slate-900">{b.name}</h3>
                            <span className={`pill ${b.status === 'active' ? 'pill-ok' : 'pill-warn'}`}>
                              {b.status}
                            </span>
                          </div>
                          <p className="text-caption text-slate-500 mt-1">{b.address}</p>
                        </div>
                        <span className="pill pill-brand font-mono font-bold">
                          {b.commission_rate}% cut
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-caption pt-2 border-t border-slate-100 text-slate-600">
                        <div>
                          <span className="font-semibold text-slate-700">Subdomain/Slug:</span>
                          <p className="font-mono text-brand-800 font-bold">{b.slug}.rallypoint.ph</p>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-700">Contact Email:</span>
                          <p className="truncate">{b.email ?? 'Not set'}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          className="control-feedback inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-caption font-bold text-slate-700"
                          onClick={() => void handleToggleBranchStatus(b)}
                        >
                          {b.status === 'active' ? (
                            <>
                              <XCircle size={14} className="text-red-600" /> Suspend branch
                            </>
                          ) : (
                            <>
                              <CheckCircle size={14} className="text-teal-600" /> Activate branch
                            </>
                          )}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {/* TAB: COMMISSIONS LEDGER */}
            {tab === 'commissions' ? (
              <section className="card p-4 space-y-3">
                <div>
                  <h2 className="text-title font-bold text-slate-900">Platform Commission Ledger</h2>
                  <p className="text-body text-slate-600 mt-0.5">
                    Live log of platform cuts automatically collected from branch bookings
                  </p>
                </div>

                {commissions.length === 0 ? (
                  <p className="text-body text-slate-500 py-4">No commissions recorded yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {commissions.map((c) => (
                      <div key={c.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-subtitle font-bold text-slate-900">{c.branch_name}</p>
                            <span className="pill pill-brand text-[10px]">{c.commission_rate}% fee</span>
                            <span className="pill pill-ok text-[10px] capitalize">{c.status}</span>
                          </div>
                          <p className="text-caption text-slate-600 mt-0.5">{c.description}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{fmtDateTime(c.created_at)}</p>
                        </div>

                        <div className="text-right">
                          <p className="text-title font-extrabold text-teal-700">
                            +{peso(c.commission_amount)}
                          </p>
                          <p className="text-caption text-slate-500 mt-0.5">
                            Gross: {peso(c.gross_amount)} · Branch Net: {peso(c.branch_net_amount)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}
          </>
        )}

        {/* MODAL: PROVISION NEW BRANCH */}
        {showNewBranchModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="card w-full max-w-lg p-6 space-y-4 shadow-xl">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-title font-extrabold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="text-brand-700" size={22} /> Provision New Branch
                  </h3>
                  <p className="text-body text-slate-600 mt-0.5">
                    Set up a new club location with its own website and commission rate.
                  </p>
                </div>
                <button
                  type="button"
                  className="text-slate-400 hover:text-slate-600 p-1"
                  onClick={() => setShowNewBranchModal(false)}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={(e) => void handleCreateBranch(e)} className="space-y-3">
                <div>
                  <label className="label" htmlFor="branch-name">Branch / Club Name</label>
                  <input
                    id="branch-name"
                    className="input"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      if (!slug) {
                        setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))
                      }
                    }}
                    placeholder="e.g. Rally Point Cebu"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label" htmlFor="branch-slug">URL Slug (Subdomain)</label>
                    <input
                      id="branch-slug"
                      className="input"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="e.g. cebu"
                      required
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="branch-city">City</label>
                    <input
                      id="branch-city"
                      className="input"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. Cebu City"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor="branch-address">Full Address</label>
                  <input
                    id="branch-address"
                    className="input"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. North Reclamation Area, Cebu City"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label" htmlFor="branch-comm-rate">Platform Commission</label>
                    <div className="relative">
                      <input
                        id="branch-comm-rate"
                        type="number"
                        step="0.5"
                        min="0"
                        max="100"
                        className="input"
                        value={commissionRate}
                        onChange={(e) => setCommissionRate(Number(e.target.value))}
                        required
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                        %
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor="branch-comm-type">Fee Type</label>
                    <select
                      id="branch-comm-type"
                      className="input"
                      value={commissionType}
                      onChange={(e) => setCommissionType(e.target.value as 'percentage' | 'fixed')}
                    >
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed">Flat fee (PHP)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label" htmlFor="branch-email">Branch Email</label>
                    <input
                      id="branch-email"
                      type="email"
                      className="input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@branch.com"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="branch-phone">Branch Phone</label>
                    <input
                      id="branch-phone"
                      className="input"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+63 917 555 0000"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowNewBranchModal(false)}
                    disabled={savingBranch}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={savingBranch}
                  >
                    {savingBranch ? 'Provisioning…' : 'Create Branch'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {toast ? (
          <div className="toast" role="status">
            {toast}
          </div>
        ) : null}
      </main>
    </AppShell>
  )
}
