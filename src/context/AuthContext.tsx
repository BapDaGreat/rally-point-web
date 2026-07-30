import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { isDemoMode, supabase } from '../lib/supabase'
import { demoStore } from '../lib/demoStore'
import type { Profile, Role } from '../types'

interface AuthState {
  user: Profile | null
  loading: boolean
  demo: boolean
  signIn: (email: string, password: string) => Promise<Profile>
  /** Public join — always creates a member (never admin/staff). */
  signUpMember: (input: {
    email: string
    password: string
    full_name: string
    phone?: string
  }) => Promise<Profile>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) {
    console.error(error)
    return null
  }
  return data as Profile | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (isDemoMode) {
      setUser(demoStore.currentUser())
      setLoading(false)
      return
    }
    if (!supabase) {
      setUser(null)
      setLoading(false)
      return
    }
    const { data } = await supabase.auth.getSession()
    const uid = data.session?.user?.id
    if (!uid) {
      setUser(null)
      setLoading(false)
      return
    }
    const profile = await fetchProfile(uid)
    if (profile) setUser(profile)
    else {
      // bootstrap profile from auth metadata if trigger not ready
      const meta = data.session!.user
      setUser({
        id: meta.id,
        email: meta.email ?? '',
        full_name: (meta.user_metadata?.full_name as string) || meta.email || 'User',
        role: ((meta.user_metadata?.role as Role) || 'member') as Role,
        phone: (meta.user_metadata?.phone as string) || null,
        created_at: new Date().toISOString(),
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
    if (!isDemoMode && supabase) {
      const { data: sub } = supabase.auth.onAuthStateChange(() => {
        void refresh()
      })
      return () => sub.subscription.unsubscribe()
    }
  }, [refresh])

  const signIn = useCallback(async (email: string, password: string) => {
    if (isDemoMode) {
      const profile = demoStore.login(email, password)
      setUser(profile)
      return profile
    }
    if (!supabase) throw new Error('Supabase not configured')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const uid = data.user?.id
    if (!uid) throw new Error('No user returned')
    let profile = await fetchProfile(uid)
    if (!profile) {
      profile = {
        id: uid,
        email: data.user.email ?? email,
        full_name: (data.user.user_metadata?.full_name as string) || email,
        role: ((data.user.user_metadata?.role as Role) || 'member') as Role,
        phone: (data.user.user_metadata?.phone as string) || null,
        created_at: new Date().toISOString(),
      }
    }
    setUser(profile)
    return profile
  }, [])

  const signUpMember = useCallback(
    async (input: { email: string; password: string; full_name: string; phone?: string }) => {
      const email = input.email.trim().toLowerCase()
      const full_name = input.full_name.trim()
      if (!full_name) throw new Error('Please enter your name')
      if (input.password.length < 6) throw new Error('Password must be at least 6 characters')

      if (isDemoMode) {
        const profile = demoStore.registerMember({
          email,
          password: input.password,
          full_name,
          phone: input.phone?.trim() || undefined,
        })
        setUser(profile)
        return profile
      }
      if (!supabase) throw new Error('Supabase not configured')

      // Public signup is always member — never admin/staff
      const { data, error } = await supabase.auth.signUp({
        email,
        password: input.password,
        options: {
          data: {
            full_name,
            phone: input.phone?.trim() || null,
            role: 'member',
          },
        },
      })
      if (error) throw error
      if (!data.user) throw new Error('Sign-up failed')

      // If email confirmation is ON, session may be null
      if (!data.session) {
        throw new Error(
          'Check your email to confirm your account, then log in. (Or turn off email confirm in Supabase Auth for instant join.)',
        )
      }

      // Ensure member row exists (trigger + client fallback)
      const { data: existing } = await supabase
        .from('members')
        .select('id')
        .eq('user_id', data.user.id)
        .maybeSingle()
      if (!existing) {
        const code = `RP-${String(Math.floor(1000 + Math.random() * 9000))}`
        const token = `q_${Math.random().toString(36).slice(2, 12)}`
        const today = new Date().toISOString().slice(0, 10)
        const exp = new Date()
        exp.setDate(exp.getDate() + 30)
        await supabase.from('members').insert({
          user_id: data.user.id,
          member_code: code,
          full_name,
          email,
          phone: input.phone?.trim() || null,
          membership_type: 'standard',
          status: 'active',
          join_date: today,
          expiry_date: exp.toISOString().slice(0, 10),
          qr_token: token,
        })
      }

      let profile = await fetchProfile(data.user.id)
      if (!profile) {
        profile = {
          id: data.user.id,
          email,
          full_name,
          role: 'member',
          phone: input.phone?.trim() || null,
          created_at: new Date().toISOString(),
        }
      } else if (profile.role !== 'member') {
        // Client signup must never elevate
        profile = { ...profile, role: 'member' }
      }
      setUser(profile)
      return profile
    },
    [],
  )

  const signOut = useCallback(async () => {
    if (isDemoMode) {
      demoStore.logout()
      setUser(null)
      return
    }
    if (supabase) await supabase.auth.signOut()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, demo: isDemoMode, signIn, signUpMember, signOut, refresh }),
    [user, loading, signIn, signUpMember, signOut, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
