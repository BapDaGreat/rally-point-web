import { useEffect, useId, useRef, useState, type ComponentType } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Bell,
  CalendarDays,
  ChevronDown,
  GraduationCap,
  HelpCircle,
  LogOut,
  QrCode,
  Receipt,
  UserRound,
  Users,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { memberPhotoUrl } from '../lib/photos'
import { isDemoMode } from '../lib/supabase'
import { MemberAvatar } from './MemberIdentity'
import { ClubSwitcher, SignOutAction } from './Shell'

type MenuLink = { to: string; label: string; icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }> }

/** Everything a signed-in player or member owns, one tap from any page. */
const menuLinks: MenuLink[] = [
  { to: '/member/pass', label: 'My QR codes', icon: QrCode },
  { to: '/member/book', label: 'My bookings', icon: CalendarDays },
  { to: '/member', label: 'Account & memberships', icon: UserRound },
  { to: '/member/open', label: 'Open play', icon: Users },
  { to: '/member/coaches', label: 'Rent a coach', icon: GraduationCap },
  { to: '/member/notifications', label: 'Messages', icon: Bell },
  { to: '/member/transactions', label: isDemoMode ? 'Payments' : 'Charges', icon: Receipt },
  { to: '/member/help', label: 'Help', icon: HelpCircle },
]

/**
 * The account button in the public site header for a signed-in player or member: their
 * photo or initials and what they like to be called. It opens a list of their pages,
 * the club switcher when they belong to more than one club, and Log out.
 */
export function AccountMenu() {
  const { user } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  // Going to another page closes the menu.
  useEffect(() => {
    setOpen(false)
  }, [location.pathname, location.search])

  // Escape closes it and gives focus back to the button; a tap outside closes it.
  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    function onPointer(event: PointerEvent) {
      const target = event.target as Node
      if (panel.current?.contains(target) || button.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  if (!user) return null
  const shownName = user.nickname?.trim() || user.full_name.split(' ')[0] || 'Account'

  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Account menu for ${user.full_name}`}
        className="control-feedback inline-flex min-h-12 items-center gap-2 rounded-[10px] border-[1.5px] border-field bg-white pl-1.5 pr-2.5 font-semibold text-ink"
        onClick={() => setOpen((value) => !value)}
      >
        <MemberAvatar name={user.full_name} photoUrl={user.photo_path ? memberPhotoUrl(user.photo_path) : null} size="sm" />
        <span className="hidden max-w-[9rem] truncate min-[380px]:inline" aria-hidden>{shownName}</span>
        <ChevronDown size={18} aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {/* Hidden rather than removed when closed: Log out's confirmation dialog lives in here. */}
      <div
          ref={panel}
          id={panelId}
          hidden={!open}
          className="absolute right-0 top-full z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-line bg-white p-2 shadow-lg"
        >
          <div className="px-3 pb-2 pt-1">
            <p className="truncate text-subtitle font-semibold text-ink">{user.full_name}</p>
            <p className="truncate text-caption text-muted">{user.email}</p>
          </div>
          <nav aria-label="Your account">
            <ul className="space-y-0.5">
              {menuLinks.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="control-feedback flex min-h-12 items-center gap-3 rounded-xl px-3 text-body font-semibold text-ink hover:bg-brand-50"
                    aria-current={location.pathname === to ? 'page' : undefined}
                  >
                    <Icon size={20} aria-hidden />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <ClubSwitcher className="mt-2 border-t border-line px-3 pt-3" />
          <div className="mt-2 border-t border-line pt-2">
            <SignOutAction className="control-feedback flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-body font-semibold text-red-800 hover:bg-red-50">
              <LogOut size={20} aria-hidden />
              Log out
            </SignOutAction>
          </div>
        </div>
    </div>
  )
}
