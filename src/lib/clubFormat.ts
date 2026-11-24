import { peso } from '../types'

/** One, two or three columns of club cards, depending on the screen. */
export const clubGrid = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'

export function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`
}

export function rateLine(regular: number | null, member: number | null) {
  if (regular == null) return 'No courts open for booking yet'
  const from = `From ${peso(regular)} per hour`
  return member != null && member < regular ? `${from} · Members from ${peso(member)}` : from
}
