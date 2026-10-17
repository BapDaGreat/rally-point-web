import { createContext, useContext } from 'react'
import type { MyClub, Profile } from '../types'

interface AuthState {
  user: Profile | null
  loading: boolean
  demo: boolean
  /** Clubs this person can act in (from trusted access records). */
  clubs: MyClub[]
  /** The club the app is currently showing; null for platform superadmins. */
  activeClub: MyClub | null
  /** Switch to another of the person's clubs. Their role follows the club. */
  switchClub: (clubId: string) => void
  /** Join another club through its link while signed in; returns that club. */
  joinClub: (slug: string) => Promise<MyClub>
  signIn: (email: string, password: string) => Promise<Profile>
  /** Public join — always creates a member (never admin/staff). */
  signUpMember: (input: {
    email: string
    password: string
    full_name: string
    phone?: string
    /** Set only by a club join link. */
    clubSlug?: string
  }) => Promise<Profile>
  resetPassword: (email: string) => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
