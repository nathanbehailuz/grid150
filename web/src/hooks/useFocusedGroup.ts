import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { weekStartInTz } from '../lib/dates'
import type { Membership, Profile, WeeklySnapshot } from '../lib/types'

type UseFocusedGroupArgs = {
  userId: string | null
  profile: Profile | null
  onProfileRefresh: () => Promise<void> | void
}

export function useFocusedGroup({
  userId,
  profile,
  onProfileRefresh,
}: UseFocusedGroupArgs) {
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [rank, setRank] = useState<number | null>(null)
  const [snapshot, setSnapshot] = useState<WeeklySnapshot | null>(null)
  const [completedCount, setCompletedCount] = useState(0)
  const [independentCount, setIndependentCount] = useState(0)
  const [assistedCount, setAssistedCount] = useState(0)
  const [dueReviewCount, setDueReviewCount] = useState(0)
  const [topicsDone, setTopicsDone] = useState(0)
  const [topicsTotal, setTopicsTotal] = useState(18)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const onProfileRefreshRef = useRef(onProfileRefresh)
  onProfileRefreshRef.current = onProfileRefresh

  const focusedGroupId = useMemo(() => {
    if (!profile) return null
    if (
      profile.focused_group_id &&
      memberships.some((m) => m.group_id === profile.focused_group_id)
    ) {
      return profile.focused_group_id
    }
    return memberships[0]?.group_id ?? null
  }, [profile, memberships])

  const focusedGroup = useMemo(
    () => memberships.find((m) => m.group_id === focusedGroupId)?.groups ?? null,
    [memberships, focusedGroupId],
  )

  const focusedRole = useMemo(
    () =>
      memberships.find((m) => m.group_id === focusedGroupId)?.role ?? null,
    [memberships, focusedGroupId],
  )

  const timezone = profile?.timezone ?? 'UTC'
  const profileFocusedId = profile?.focused_group_id ?? null

  const reload = useCallback(async () => {
    if (!supabase || !userId) {
      setMemberships([])
      setRank(null)
      setSnapshot(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const [memRes, progressRes, attemptsRes, reviewsRes, topicsRes] =
        await Promise.all([
          supabase
            .from('group_memberships')
            .select('id, group_id, role, groups!inner(id, name)')
            .eq('user_id', userId)
            .is('left_at', null)
            .order('joined_at', { ascending: true }),
          supabase
            .from('problem_progress')
            .select('problem_id, status')
            .eq('user_id', userId),
          supabase
            .from('attempts')
            .select('outcome')
            .eq('user_id', userId)
            .is('invalidated_at', null)
            .in('outcome', ['solved_independently', 'solved_with_hints'])
            .eq('attempt_type', 'new_problem'),
          supabase
            .from('review_tasks')
            .select('id, due_at')
            .eq('user_id', userId)
            .eq('status', 'pending'),
          supabase.from('topics').select('id', { count: 'exact', head: true }),
        ])

      if (memRes.error) throw memRes.error
      if (progressRes.error) throw progressRes.error
      if (attemptsRes.error) throw attemptsRes.error
      if (reviewsRes.error) throw reviewsRes.error

      const progressRows = progressRes.data ?? []
      const completed = progressRows.filter((p) => p.status === 'completed')
      setCompletedCount(completed.length)

      const { data: allProblems } = await supabase
        .from('problems')
        .select('id, topic_id')
      const problemsByTopic = new Map<string, string[]>()
      for (const p of allProblems ?? []) {
        const list = problemsByTopic.get(p.topic_id as string) ?? []
        list.push(p.id as string)
        problemsByTopic.set(p.topic_id as string, list)
      }
      const completedIds = new Set(completed.map((c) => c.problem_id as string))
      let doneTopics = 0
      for (const [, ids] of problemsByTopic) {
        if (ids.length > 0 && ids.every((id) => completedIds.has(id))) {
          doneTopics += 1
        }
      }
      setTopicsDone(doneTopics)
      setTopicsTotal(topicsRes.count ?? (problemsByTopic.size || 18))

      const rowsBase = (memRes.data ?? []).map((row) => {
        const g = row.groups as unknown as { id: string; name: string }
        return {
          id: row.id as string,
          group_id: row.group_id as string,
          role: row.role as Membership['role'],
          groups: g,
          rank: null as number | null,
        }
      })

      const attempts = attemptsRes.data ?? []
      setIndependentCount(
        attempts.filter((a) => a.outcome === 'solved_independently').length,
      )
      setAssistedCount(
        attempts.filter((a) => a.outcome === 'solved_with_hints').length,
      )

      const now = Date.now()
      setDueReviewCount(
        (reviewsRes.data ?? []).filter(
          (r) => new Date(r.due_at as string).getTime() <= now,
        ).length,
      )

      const gid =
        profileFocusedId &&
        rowsBase.some((m) => m.group_id === profileFocusedId)
          ? profileFocusedId
          : (rowsBase[0]?.group_id ?? null)

      if (!gid) {
        setMemberships(rowsBase)
        setRank(null)
        setSnapshot(null)
        return
      }

      if (!profileFocusedId) {
        await supabase.rpc('set_focused_group', { p_group_id: gid })
        await onProfileRefreshRef.current()
      }

      const weekStart = weekStartInTz(timezone)
      const groupIds = rowsBase.map((m) => m.group_id)
      const { data: allSnaps, error: snapErr } = await supabase
        .from('weekly_score_snapshots')
        .select(
          'user_id, group_id, week_start, progress, consistency, improvement, total, independent_solves, hint_assisted_solves',
        )
        .in('group_id', groupIds)
        .eq('week_start', weekStart)
        .order('total', { ascending: false })

      if (snapErr) throw snapErr
      const snaps = (allSnaps ?? []) as WeeklySnapshot[]

      const withRanks = rowsBase.map((m) => {
        const list = snaps.filter((s) => s.group_id === m.group_id)
        const idx = list.findIndex((s) => s.user_id === userId)
        return { ...m, rank: idx >= 0 ? idx + 1 : null }
      })
      setMemberships(withRanks)

      const focusedSnaps = snaps.filter((s) => s.group_id === gid)
      const mine = focusedSnaps.find((s) => s.user_id === userId) ?? null
      setSnapshot(mine)
      const idx = focusedSnaps.findIndex((s) => s.user_id === userId)
      setRank(idx >= 0 ? idx + 1 : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load groups')
    } finally {
      setLoading(false)
    }
  }, [userId, profileFocusedId, timezone])

  useEffect(() => {
    void reload()
  }, [reload])

  const setFocusedGroup = useCallback(
    async (groupId: string) => {
      if (!supabase) return
      const { error: rpcErr } = await supabase.rpc('set_focused_group', {
        p_group_id: groupId,
      })
      if (rpcErr) throw rpcErr
      await onProfileRefreshRef.current()
      await reload()
    },
    [reload],
  )

  return {
    memberships,
    focusedGroupId,
    focusedGroup,
    focusedRole,
    rank,
    snapshot,
    completedCount,
    independentCount,
    assistedCount,
    dueReviewCount,
    topicsDone,
    topicsTotal,
    loading,
    error,
    reload,
    setFocusedGroup,
  }
}
