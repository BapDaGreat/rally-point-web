import type { Club, ClubRole, MyClub, Profile } from '../../types'
import { getActiveClubId } from '../clubContext'
import { DEFAULT_CLUB_SLUG, DEMO_CLUB_ID } from '../tenant'
import type { DemoDB } from './model'

/** The club that sign-ups without a club link join. */
export function defaultClub(db: DemoDB): Club | undefined {
  return db.clubs.find((club) => club.slug === DEFAULT_CLUB_SLUG) ?? db.clubs[0]
}

export function normalizeSlug(slug: string) {
  return slug.trim().toLowerCase()
}

export function activeClubBySlug(db: DemoDB, slug: string): Club | undefined {
  const wanted = normalizeSlug(slug)
  return db.clubs.find((club) => club.is_active && club.slug.toLowerCase() === wanted)
}

export function isPlatformSuperadmin(db: DemoDB, userId?: string | null) {
  return !!userId && db.platformRoles.some((row) => row.user_id === userId && row.role === 'superadmin')
}

/** Mirrors private.current_club_role: admin, then staff (active rows), then member. */
export function clubRoleFor(db: DemoDB, userId: string | null | undefined, clubId: string | null | undefined): ClubRole | null {
  if (!userId || !clubId) return null
  const staffRows = db.clubRoles.filter((row) => row.club_id === clubId && row.user_id === userId && row.is_active)
  if (staffRows.some((row) => row.role === 'admin')) return 'admin'
  if (staffRows.some((row) => row.role === 'staff')) return 'staff'
  if (db.members.some((member) => member.club_id === clubId && member.user_id === userId)) return 'member'
  return null
}

/** Active clubs the person can act in, with their role there, sorted by name (like list_my_clubs). */
export function myClubsFor(db: DemoDB, userId: string): MyClub[] {
  const clubs: MyClub[] = []
  for (const club of db.clubs) {
    if (!club.is_active) continue
    const role = clubRoleFor(db, userId, club.id)
    if (role) clubs.push({ club_id: club.id, slug: club.slug, name: club.name, role })
  }
  return clubs.sort((a, b) => a.name.localeCompare(b.name) || a.club_id.localeCompare(b.club_id))
}

/** Where a person lands without a chosen club: the default club if they belong to it, else their first club. */
export function preferredClubId(db: DemoDB, userId: string): string | null {
  const clubs = myClubsFor(db, userId)
  return (clubs.find((club) => club.slug === DEFAULT_CLUB_SLUG) ?? clubs[0])?.club_id ?? null
}

/**
 * The club demo reads and writes are scoped to: the tab's active club (set by
 * AuthProvider), else the signed-in person's preferred club, else the default club.
 */
export function activeClubId(db: DemoDB): string {
  const chosen = getActiveClubId()
  if (chosen) return chosen
  if (db.sessionUserId) {
    const preferred = preferredClubId(db, db.sessionUserId)
    if (preferred) return preferred
  }
  return defaultClub(db)?.id ?? DEMO_CLUB_ID
}

/** The active club row, falling back to the default club when the chosen id is unknown here. */
export function activeClub(db: DemoDB): Club | undefined {
  const id = activeClubId(db)
  return db.clubs.find((club) => club.id === id) ?? defaultClub(db)
}

/** The profile with its role taken from trusted demo records (platform role, then club role). */
export function profileWithRole(db: DemoDB, profile: Profile): Profile {
  if (isPlatformSuperadmin(db, profile.id)) return { ...profile, role: 'superadmin' }
  const role = clubRoleFor(db, profile.id, activeClubId(db))
    ?? clubRoleFor(db, profile.id, preferredClubId(db, profile.id))
  return role ? { ...profile, role } : { ...profile }
}

/** The club a court belongs to, for rows saved without one. */
export function clubForCourt(db: Pick<DemoDB, 'courts'>, courtId?: string | null) {
  return courtId ? db.courts.find((court) => court.id === courtId)?.club_id : undefined
}
