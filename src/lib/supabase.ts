import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { clubAwareFetch } from './clubContext'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isDemoMode = !url || !anon || url.trim() === '' || anon.trim() === ''

export const supabase: SupabaseClient | null = isDemoMode
  ? null
  : createClient(url!, anon!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      // Database requests carry the active club; see clubContext.ts.
      global: { fetch: clubAwareFetch },
    })
