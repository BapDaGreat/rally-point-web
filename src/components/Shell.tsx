import { NavLink } from 'react-router-dom'
import {
  Activity,
  Bell,
  Home,
  LayoutDashboard,
  LogOut,
  Receipt,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { Role } from '../types'
import { useAuth } from '../context/AuthContext'

const memberTabs = [
  { to: '/member', end: true, label: 'Home', icon: Home },
  { to: '/member/pay', label: 'Pay', icon: Wallet },
  { to: '/member/transactions', label: 'Txns', icon: Receipt },
  { to: '/member/notifications', label: 'Alerts', icon: Bell },
  { to: '/member/profile', label: 'Profile', icon: UserRound },
]

const staffTabs = [
  { to: '/staff', end: true, label: 'Home', icon: LayoutDashboard },
  { to: '/staff/members', label: 'Members', icon: Users },
  { to: '/staff/checkin', label: 'Check-in', icon: UserRound },
  { to: '/staff/courts', label: 'Courts', icon: Home },
]

const adminTabs = [
  { to: '/admin', end: true, label: 'Home', icon: LayoutDashboard },
  { to: '/admin/members', label: 'Members', icon: Users },
  { to: '/admin/ops', label: 'Ops', icon: Home },
  { to: '/admin/transactions', label: 'Txns', icon: Receipt },
  { to: '/admin/users', label: 'Users', icon: UserRound },
]

function tabsFor(role: Role) {
  if (role === 'admin') return adminTabs
  if (role === 'staff') return staffTabs
  return memberTabs
}

export function SideNav({ role }: { role: Role }) {
  const { user, signOut } = useAuth()
  const tabs = tabsFor(role)

  return (
    <aside className="side-nav">
      <div className="px-2 mb-6">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-9 h-9 rounded-xl bg-teal-500/20 text-teal-200 flex items-center justify-center border border-teal-400/20">
            <Activity size={18} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-teal-300/80">Rally Point</p>
            <p className="text-sm font-extrabold leading-tight capitalize">{role}</p>
          </div>
        </div>
        {user ? (
          <p className="text-xs text-slate-400 mt-2 truncate px-0.5" title={user.email}>
            {user.full_name}
          </p>
        ) : null}
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {tabs.map(({ to, end, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `side-nav-link${isActive ? ' active' : ''}`}
          >
            <Icon size={18} strokeWidth={2.25} />
            {label}
          </NavLink>
        ))}
      </nav>

      <button
        type="button"
        onClick={() => void signOut()}
        className="side-nav-link mt-4 w-full border-0 bg-transparent cursor-pointer text-left"
      >
        <LogOut size={18} />
        Sign out
      </button>
    </aside>
  )
}

export function BottomNav({ role }: { role: Role }) {
  const tabs = tabsFor(role)
  const cols = tabs.length <= 4 ? 'grid-cols-4' : 'grid-cols-5'
  return (
    <nav className="bottom-nav">
      <div className={`grid ${cols} px-1 pt-1 pb-1`}>
        {tabs.map(({ to, end, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 rounded-xl text-[10px] font-bold ${
                isActive ? 'text-brand-700' : 'text-slate-400'
              }`
            }
          >
            <Icon size={20} strokeWidth={2.25} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

/** Responsive chrome: sidebar on desktop, bottom nav on phone */
export function AppShell({ role, children }: { role: Role; children: ReactNode }) {
  return (
    <div className="app-shell">
      <SideNav role={role} />
      <div className="app-shell-desktop min-h-[100dvh] md:min-h-0 flex-1 flex flex-col relative w-full">
        {children}
        <BottomNav role={role} />
      </div>
    </div>
  )
}

export function AppHeader({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-100 px-4 md:px-6 pt-4 pb-3">
      <div className="flex items-start justify-between gap-3 max-w-5xl">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700 md:hidden">
            Rally Point
          </p>
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 leading-tight">{title}</h1>
          {subtitle ? <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p> : null}
        </div>
        <div className="md:hidden">{right}</div>
        <div className="hidden md:block">{right}</div>
      </div>
    </header>
  )
}

export function SignOutButton() {
  const { signOut } = useAuth()
  return (
    <button
      type="button"
      onClick={() => void signOut()}
      className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 md:hidden"
      aria-label="Sign out"
    >
      <LogOut size={18} />
    </button>
  )
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="card p-6 text-center">
      <p className="font-bold text-slate-800">{title}</p>
      {body ? <p className="text-sm text-slate-500 mt-1">{body}</p> : null}
    </div>
  )
}

export function LoadingBlock() {
  return (
    <div className="space-y-3 p-4">
      <div className="skeleton h-20" />
      <div className="skeleton h-14" />
      <div className="skeleton h-14" />
    </div>
  )
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return <div className="toast">{message}</div>
}
