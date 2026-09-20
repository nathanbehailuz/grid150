import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GroupAnalyticsPanel } from '../components/GroupAnalyticsPanel'
import { supabase } from '../lib/supabase'
import {
  isoWeekNumber,
  localDateInTz,
  priorWeekStart,
  weekStartInTz,
} from '../lib/dates'
import { allTimeAverage, daysUntil, standingDelta } from '../lib/standings'
import type { Membership, Profile, WeeklySnapshot } from '../lib/types'

type Row = {
  userId: string
  name: string
  score: number
  independent: number
  hint: number
  completed: number
  weeks?: number
  movement?: number | null
  streak?: number | null
}

type Props = {
  profile: Profile
  userId: string
  focusedGroupId: string | null
  focusedGroupName: string | null
  memberships: Membership[]
  onSwitchGroup: (groupId: string) => Promise<void>
}

export function LeaderboardPage({
  profile,
  userId,
  focusedGroupId,
  focusedGroupName,
  memberships,
  onSwitchGroup,
}: Props) {
  const [mode, setMode] = useState<'week' | 'all'>('week')
  const [view, setView] = useState<'standings' | 'analytics'>('standings')
  const [rows, setRows] = useState<Row[]>([])
  const [standing, setStanding] = useState({
    rank: null as number | null,
    of: 0,
    score: null as number | null,
    gapToFirst: null as number | null,
    movement: null as number | null,
    allTimeAvg: null as number | null,
  })
  const [pace, setPace] = useState<{
    problems_per_week: number | null
    deadline: string | null
    daysLeft: number | null
  }>({ problems_per_week: null, deadline: null, daysLeft: null })
  const [yourOutput, setYourOutput] = useState({ indep: 0, hint: 0 })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const weekNum = isoWeekNumber(profile.timezone)

  const load = useCallback(async () => {
    if (!supabase || !focusedGroupId) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const weekStart = weekStartInTz(profile.timezone)
      const prevStart = priorWeekStart(weekStart)
      const today = localDateInTz(profile.timezone)

      const [paceRes, progressRes, thisRes, prevRes, allRes, streakRes] =
        await Promise.all([
        supabase
          .from('group_pace_settings')
          .select('problems_per_week, deadline, active_days')
          .eq('group_id', focusedGroupId)
          .maybeSingle(),
        supabase
          .from('problem_progress')
          .select('user_id')
          .eq('status', 'completed'),
        supabase
          .from('weekly_score_snapshots')
          .select(
            'user_id, total, independent_solves, hint_assisted_solves, progress, consistency, improvement, week_start, group_id, profiles!inner(display_name)',
          )
          .eq('group_id', focusedGroupId)
          .eq('week_start', weekStart)
          .order('total', { ascending: false }),
        supabase
          .from('weekly_score_snapshots')
          .select('user_id, total, week_start, group_id')
          .eq('group_id', focusedGroupId)
          .eq('week_start', prevStart),
        supabase
          .from('weekly_score_snapshots')
          .select('user_id, total')
          .eq('group_id', focusedGroupId),
        supabase.rpc('current_streak', { p_group_id: focusedGroupId }),
      ])

      if (paceRes.error) throw paceRes.error
      if (thisRes.error) throw thisRes.error
      if (prevRes.error) throw prevRes.error
      if (allRes.error) throw allRes.error
      const streakVal =
        typeof streakRes.data === 'number' ? streakRes.data : null

      if (paceRes.data) {
        setPace({
          problems_per_week: paceRes.data.problems_per_week as number | null,
          deadline: paceRes.data.deadline as string | null,
          daysLeft: daysUntil(paceRes.data.deadline as string | null, today),
        })
      }

      const completedByUser = new Map<string, number>()
      for (const p of progressRes.data ?? []) {
        const uid = p.user_id as string
        completedByUser.set(uid, (completedByUser.get(uid) ?? 0) + 1)
      }

      const thisWeek = (thisRes.data ?? []).map((r) => {
        const profiles = r.profiles as unknown as { display_name: string }
        return {
          user_id: r.user_id as string,
          group_id: focusedGroupId,
          week_start: weekStart,
          progress: Number(r.progress ?? 0),
          consistency: Number(r.consistency ?? 0),
          improvement: Number(r.improvement ?? 0),
          total: Number(r.total),
          independent_solves: r.independent_solves as number,
          hint_assisted_solves: r.hint_assisted_solves as number,
          profiles,
        }
      }) as WeeklySnapshot[]

      const lastWeek = (prevRes.data ?? []) as WeeklySnapshot[]
      const info = standingDelta(thisWeek, lastWeek, userId)
      const avg = allTimeAverage(allRes.data ?? [], userId)
      setStanding({
        rank: info.rank,
        of: info.of,
        score: info.score,
        gapToFirst: info.gapToFirst,
        movement: info.movement,
        allTimeAvg: avg,
      })

      const mine = thisWeek.find((s) => s.user_id === userId)
      setYourOutput({
        indep: mine?.independent_solves ?? 0,
        hint: mine?.hint_assisted_solves ?? 0,
      })

      if (mode === 'week') {
        const prevRank = new Map<string, number>()
        const sortedPrev = [...lastWeek].sort(
          (a, b) => Number(b.total) - Number(a.total),
        )
        sortedPrev.forEach((s, i) => prevRank.set(s.user_id, i + 1))

        setRows(
          thisWeek.map((r, i) => {
            const prev = prevRank.get(r.user_id)
            return {
              userId: r.user_id,
              name: (r.profiles as { display_name: string })?.display_name ?? 'Member',
              score: Number(r.total),
              independent: r.independent_solves,
              hint: r.hint_assisted_solves,
              completed: completedByUser.get(r.user_id) ?? 0,
              movement: prev != null ? prev - (i + 1) : null,
              streak: r.user_id === userId ? streakVal : null,
            }
          }),
        )
      } else {
        const byUser = new Map<
          string,
          { total: number; weeks: number; indep: number; hint: number }
        >()
        for (const r of allRes.data ?? []) {
          const uid = r.user_id as string
          const cur = byUser.get(uid) ?? {
            total: 0,
            weeks: 0,
            indep: 0,
            hint: 0,
          }
          cur.total += Number(r.total)
          cur.weeks += 1
          byUser.set(uid, cur)
        }
        // enrich indep/hint from this week snaps if present
        for (const r of thisWeek) {
          const cur = byUser.get(r.user_id)
          if (cur) {
            cur.indep = r.independent_solves
            cur.hint = r.hint_assisted_solves
          }
        }

        const userIds = [...byUser.keys()]
        const { data: profiles, error: pErr } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', userIds)
        if (pErr) throw pErr
        const nameMap = new Map(
          (profiles ?? []).map((p) => [p.id as string, p.display_name as string]),
        )

        setRows(
          [...byUser.entries()]
            .filter(([, v]) => v.weeks >= 1)
            .map(([uid, v]) => ({
              userId: uid,
              name: nameMap.get(uid) ?? 'Member',
              score: v.total / v.weeks,
              independent: v.indep,
              hint: v.hint,
              completed: completedByUser.get(uid) ?? 0,
              weeks: v.weeks,
              streak: uid === userId ? streakVal : null,
            }))
            .sort((a, b) => b.score - a.score),
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load standings')
    } finally {
      setLoading(false)
    }
  }, [focusedGroupId, mode, profile.timezone, userId])

  useEffect(() => {
    void load()
  }, [load])

  if (!focusedGroupId) {
    return (
      <div className="stack">
        <header className="page-head">
          <h1>Leaderboard</h1>
          <p>Join a group to see standings.</p>
        </header>
        <p className="muted">
          <Link to="/groups/join">Create or join a group</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="stack">
      <header className="page-head">
        <p className="muted" style={{ marginBottom: '0.35rem' }}>
          Week {weekNum}
        </p>
        <h1>
          Week {weekNum} standings,{' '}
          <span style={{ color: 'var(--color-on-surface)' }}>
            {focusedGroupName}
          </span>
        </h1>
      </header>

      {memberships.length > 1 ? (
        <label className="muted" style={{ display: 'grid', gap: '0.35rem' }}>
          Switch group
          <select
            value={focusedGroupId}
            onChange={(e) => void onSwitchGroup(e.target.value)}
            style={{
              maxWidth: '20rem',
              padding: '0.45rem 0.65rem',
              background: 'var(--color-surface-container)',
              color: 'var(--color-bright)',
              border: '1px solid var(--color-outline-variant)',
              borderRadius: 'var(--radius)',
              font: 'inherit',
            }}
          >
            {memberships.map((m) => (
              <option key={m.id} value={m.group_id}>
                {m.groups.name}
                {m.rank != null ? ` (#${m.rank})` : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="segmented">
        <button
          type="button"
          className={view === 'standings' ? 'active' : undefined}
          onClick={() => setView('standings')}
        >
          Standings
        </button>
        <button
          type="button"
          className={view === 'analytics' ? 'active' : undefined}
          onClick={() => setView('analytics')}
        >
          Analytics
        </button>
      </div>

      {view === 'analytics' ? (
        <GroupAnalyticsPanel
          profile={profile}
          userId={userId}
          focusedGroupId={focusedGroupId}
        />
      ) : (
        <>
      <div className="segmented">
        <button
          type="button"
          className={mode === 'week' ? 'active' : undefined}
          onClick={() => setMode('week')}
        >
          This week
        </button>
        <button
          type="button"
          className={mode === 'all' ? 'active' : undefined}
          onClick={() => setMode('all')}
        >
          All-time avg
        </button>
      </div>

      {error ? <p className="message error">{error}</p> : null}
      {loading ? <p className="muted">Loading…</p> : null}

      <section className="panel">
        <span className="muted" style={{ fontSize: '0.6875rem' }}>
          YOUR STANDING
        </span>
        <div className="split-2" style={{ marginTop: '0.75rem' }}>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '2rem',
                color: 'var(--color-bright)',
              }}
            >
              {standing.rank != null ? `#${standing.rank}` : '—'}
              {standing.of > 0 ? (
                <span className="muted" style={{ fontSize: '0.875rem' }}>
                  {' '}
                  of {standing.of}
                </span>
              ) : null}
            </div>
            <p className="muted">
              {standing.movement != null && standing.movement !== 0
                ? standing.movement > 0
                  ? `up ${standing.movement} vs last week`
                  : `down ${Math.abs(standing.movement)} vs last week`
                : 'flat vs last week'}
            </p>
            <p className="muted">
              Score{' '}
              {standing.score != null ? standing.score.toFixed(1) : '—'}
              {standing.allTimeAvg != null
                ? ` · all-time avg ${standing.allTimeAvg.toFixed(1)}`
                : ''}
            </p>
          </div>
          <div>
            <p className="muted" style={{ margin: 0 }}>
              Group pace:{' '}
              {pace.problems_per_week != null
                ? `${pace.problems_per_week} / week`
                : '—'}
            </p>
            <p className="muted">
              Deadline:{' '}
              {pace.deadline
                ? `${pace.deadline}${pace.daysLeft != null ? ` (${pace.daysLeft}d)` : ''}`
                : '—'}
            </p>
            <p className="muted">
              Your output: {yourOutput.indep} indep · {yourOutput.hint} hint
            </p>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Member</th>
                <th>NeetCode</th>
                <th>Indep / Hint</th>
                <th>Streak</th>
                <th>Score</th>
                {mode === 'week' ? <th>±</th> : <th>Weeks</th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={7} className="muted">
                    No snapshots for this period yet.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr
                    key={r.userId}
                    className={r.userId === userId ? 'me' : undefined}
                  >
                    <td>#{i + 1}</td>
                    <td>{r.name}</td>
                    <td>
                      {r.completed}/150 (
                      {Math.round((r.completed / 150) * 100)}%)
                    </td>
                    <td>
                      {r.independent}/{r.hint}
                    </td>
                    <td>
                      {r.streak != null ? `${r.streak}d` : '—'}
                    </td>
                    <td>{r.score.toFixed(1)}</td>
                    {mode === 'week' ? (
                      <td>
                        {r.movement != null && r.movement !== 0
                          ? r.movement > 0
                            ? `↑${r.movement}`
                            : `↓${Math.abs(r.movement)}`
                          : '—'}
                      </td>
                    ) : (
                      <td>{r.weeks}</td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          <strong style={{ color: 'var(--color-on-surface)' }}>
            How scores work:{' '}
          </strong>
          Weekly score is Progress (50) + Consistency (25) + Improvement (25).
          All-time rank is average weekly score. Private reflections and
          confidence never appear here.
        </p>
      </section>
        </>
      )}
    </div>
  )
}
