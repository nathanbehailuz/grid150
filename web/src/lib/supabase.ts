import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

/** Browser client. Null when env vars are missing so the shell still boots. */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        flowType: 'pkce',
      },
    })
  : null

/** Where confirmation / magic links should return after Auth. */
export function authRedirectTo(): string {
  return `${window.location.origin}/`
}

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn(
    'Supabase env missing. Copy web/.env.example to web/.env.local and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  )
}
