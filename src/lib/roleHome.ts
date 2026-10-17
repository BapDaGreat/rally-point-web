import type { Role } from '../types'

/** Where each role lands after signing in or switching clubs. */
export function homeFor(role: Role) {
  if (role === 'superadmin') return '/superadmin'
  if (role === 'admin') return '/admin'
  if (role === 'staff') return '/staff'
  return '/member'
}
