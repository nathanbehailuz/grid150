import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)
  const sessionRef = useRef<Session | null>(null)
  sessionRef.current = session

  const fetchProfile = useCallback(async (user: User | null) => {
    if (!supabase || !user) {
      setProfile(null)
      return
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, timezone, focused_group_id')
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      setProfileError(error.message)
      setProfile(null)
      return
    }
    setProfileError(null)
    setProfile(data as Profile | null)
  }, [])

  const refreshProfile = useCallback(async () => {
    await fetchProfile(sessionRef.current?.user ?? null)
  }, [fetchProfile])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let cancelled = false
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      void fetchProfile(data.session?.user ?? null).finally(() => {
        if (!cancelled) setLoading(false)
      })
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      void fetchProfile(next?.user ?? null)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  const updateProfile = useCallback(
    async (patch: Partial<Pick<Profile, 'display_name' | 'timezone'>>) => {
      if (!supabase || !session?.user) {
        throw new Error('Not signed in')
      }
      const { data, error } = await supabase
        .from('profiles')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', session.user.id)
        .select('id, display_name, timezone, focused_group_id')
        .single()
      if (error) throw error
      setProfile(data as Profile)
      return data as Profile
    },
    [session],
  )

  const signOut = useCallback(async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }, [])

  return {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    profileError,
    refreshProfile,
    updateProfile,
    signOut,
  }
}
