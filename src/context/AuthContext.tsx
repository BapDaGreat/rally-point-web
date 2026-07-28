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
    () => ({ user, loading, demo: isDemoMode, signIn, signOut, refresh }),
    [user, loading, signIn, signOut, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
