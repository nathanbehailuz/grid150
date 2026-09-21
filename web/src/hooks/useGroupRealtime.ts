import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Subscribe to group-scoped realtime changes and invalidate (refetch).
 * Publishes weekly_score_snapshots, group_join_requests, reactions only.
 *
 * Channel topic is unique per mount so multiple subscribers (e.g. leaderboard
 * + analytics) and React Strict Mode remounts never call `.on()` on an
 * already-subscribed channel.
 */
export function useGroupRealtime(
  groupId: string | null,
  onInvalidate: () => void,
) {
  const cb = useRef(onInvalidate)
  cb.current = onInvalidate

  useEffect(() => {
    if (!supabase || !groupId) return

    const channel = supabase
      .channel(`group-${groupId}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'weekly_score_snapshots',
          filter: `group_id=eq.${groupId}`,
        },
        () => cb.current(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_join_requests',
          filter: `group_id=eq.${groupId}`,
        },
        () => cb.current(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reactions',
        },
        () => cb.current(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [groupId])
}
