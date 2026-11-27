import { isSafeLink } from './clubProfile'
import type { PublicClubProfile } from '../types'
import { peso } from '../types'

/** One, two or three columns of club cards, depending on the screen. */
export const clubGrid = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'

/**
 * One or two clubs would leave an empty column in `clubGrid`, so the owners tile fills the rest
 * of the row instead. Use `clubGrid` on the outer box, `list` on the list of clubs (it keeps the
 * same column widths inside) and `tile` on the owners tile. Null when the clubs fill the row.
 */
export function shortClubGrid(clubCount: number) {
  if (clubCount === 1) return { list: 'grid grid-cols-1 gap-4', tile: 'lg:col-span-2' }
  if (clubCount === 2) {
    return { list: 'grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2', tile: 'sm:col-span-2 lg:col-span-1' }
  }
  return null
}

export function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`
}

/** A peso amount that never breaks between "Php" and the number. */
export function pesoKeep(amount: number) {
  return peso(amount).replace(/^Php /, 'Php ')
}

/** "4 indoor · 2 outdoor", or one of the two; null when the club has no courts with a type. */
export function courtTypeCounts(indoor: number | null | undefined, outdoor: number | null | undefined) {
  const parts = [
    indoor ? `${indoor} indoor` : null,
    outdoor ? `${outdoor} outdoor` : null,
  ].filter((part): part is string => part != null)
  return parts.length ? parts.join(' · ') : null
}

/** The cheapest hour, and the members' price on a line of its own when it is lower. */
export function rateLines(regular: number | null, member: number | null) {
  if (regular == null) return { regular: 'No courts open for booking yet', member: null }
  return {
    regular: `From ${pesoKeep(regular)} per hour`,
    member: member != null && member < regular ? `Members from ${pesoKeep(member)}` : null,
  }
}

// Only a plain address becomes an email link, so a stored value can never add extra
// mail fields (such as ?bcc=) to the message it opens.
export const PLAIN_EMAIL = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/

/** The quick ways to reach a club (call, a plain email address, an https Messenger link), or null when it gave none. */
export function clubContactLinks(profile: PublicClubProfile | null) {
  if (!profile) return null
  const email = profile.email && PLAIN_EMAIL.test(profile.email) ? profile.email : null
  const messenger = isSafeLink(profile.messenger_url) ? profile.messenger_url : null
  return profile.phone || email || messenger ? { phone: profile.phone, email, messenger } : null
}
