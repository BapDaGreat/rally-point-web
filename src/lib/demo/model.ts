import type { Booking, Branch, CheckIn, Club, Court, CourtSession, Member, Notification, OpenPlaySession, OpenPlaySignup, PlatformCommission, Profile, Reminder, StaffVenueGrant, SupportInquiry, Transaction, Venue, WalkIn } from '../../types'

export interface DemoDB {
  clubs: Club[]
  venues: Venue[]
  staffVenueGrants: StaffVenueGrant[]
  branches: Branch[]
  commissions: PlatformCommission[]
  profiles: Profile[]
  members: Member[]
  courts: Court[]
  sessions: CourtSession[]
  bookings: Booking[]
  openPlays: OpenPlaySession[]
  openPlaySignups: OpenPlaySignup[]
  reminders: Reminder[]
  checkins: CheckIn[]
  transactions: Transaction[]
  notifications: Notification[]
  inquiries: SupportInquiry[]
  walkins: WalkIn[]
  sessionUserId: string | null
}
