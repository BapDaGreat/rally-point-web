export type Role = 'member' | 'staff' | 'admin'

export type MembershipType = 'basic' | 'standard' | 'premium'
export type MemberStatus = 'active' | 'expired' | 'pending' | 'suspended'
export type SessionStatus = 'scheduled' | 'playing' | 'completed' | 'cancelled' | 'pending_payment'
export type TxType = 'membership' | 'court_rental' | 'walk_in' | 'extension' | 'booking' | 'other'
export type CourtStatus = 'available' | 'occupied' | 'maintenance'
export type PaymentMethod = 'gcash' | 'maya' | 'card' | 'demo_wallet'
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled'
export type BookingStatus = 'pending_payment' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: Role
  phone?: string | null
  avatar_url?: string | null
  created_at: string
}

export interface Member {
  id: string
  user_id?: string | null
  member_code: string
  full_name: string
  email?: string | null
  phone?: string | null
  membership_type: MembershipType
  status: MemberStatus
  join_date: string
  expiry_date: string
  notes?: string | null
  created_at: string
}

export interface Court {
  id: string
  name: string
  status: CourtStatus
  hourly_rate: number
}

export interface CourtSession {
  id: string
  court_id: string
  member_id?: string | null
  guest_name?: string | null
  start_at: string
  end_at: string
  status: SessionStatus
  amount: number
  created_by?: string | null
  notes?: string | null
  booking_id?: string | null
  court?: Court
  member?: Member
}

export interface Booking {
  id: string
  court_id: string
  member_id: string
  start_at: string
  end_at: string
  hours: number
  amount: number
  status: BookingStatus
  payment_method?: PaymentMethod | null
  payment_ref?: string | null
  session_id?: string | null
  created_at: string
  court?: Court
  member?: Member
}

export interface TimeSlot {
  startHour: number
  label: string
  available: boolean
}

export interface CourtDayAvailability {
  court: Court
  slots: TimeSlot[]
}

export interface PaymentIntent {
  id: string
  booking_id: string
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  checkout_url?: string | null
  created_at: string
}

export interface CheckIn {
  id: string
  member_id: string
  checked_in_at: string
  staff_id?: string | null
  note?: string | null
  member?: Member
}

export interface Transaction {
  id: string
  member_id?: string | null
  amount: number
  type: TxType
  description: string
  created_at: string
  created_by?: string | null
  member?: Member
}

export interface Notification {
  id: string
  user_id: string
  title: string
  body: string
  read: boolean
  created_at: string
}

export interface WalkIn {
  id: string
  full_name: string
  phone?: string | null
  purpose: string
  amount: number
  created_at: string
  created_by?: string | null
}

export interface DashboardStats {
  members: number
  active_now: number
  revenue_today: number
  courts_occupied: number
}

/** Club open hours (local) */
export const CLUB_OPEN_HOUR = 6
export const CLUB_CLOSE_HOUR = 22

export function peso(n: number) {
  return `Php ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function fmtDateTime(iso: string) {
  return `${fmtDate(iso)} · ${fmtTime(iso)}`
}

export function hourLabel(h: number) {
  const d = new Date()
  d.setHours(h, 0, 0, 0)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function ymdLocal(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function localRangeISO(dateYmd: string, startHour: number, hours: number) {
  const [y, m, d] = dateYmd.split('-').map(Number)
  const start = new Date(y, m - 1, d, startHour, 0, 0, 0)
  const end = new Date(start.getTime() + hours * 3600000)
  return { start_at: start.toISOString(), end_at: end.toISOString() }
}
