import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '../lib/supabase'
import {
  formatShortDate,
  localDateInTz,
  outcomeLabel,
  weekStartInTz,
} from '../lib/dates'
import type { Profile, Topic } from '../lib/types'

type Props = {
  profile: Profile
  userId: string
  focusedGroupId: string
}

type Activity = {
  attempt_id: string
  user_id: string
  problem_id: string
  attempt_type: string
  outcome: string
  completed_at: string
}

type ReactionKind =
  | 'applause'
  | 'fire'
  | 'respect'
  | 'comeback'
  | 'challenge'

const REACTION_KINDS: { kind: ReactionKind; label: string }[] = [
  { kind: 'applause', label: 'Applause' },
  { kind: 'fire', label: 'Fire' },
  { kind: 'respect', label: 'Respect' },
  { kind: 'comeback', label: 'Comeback' },
  { kind: 'challenge', label: 'Challenge' },
]

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function GroupAnalyticsPanel({
  profile,
  userId,
  focusedGroupId,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [paceMarker, setPaceMarker] = useState<{
    topicName: string | null
    note: string | null
  }>({ topicName: null, note: null })
  const [heatmap, setHeatmap] = useState<
    { member: string; cells: number[] }[]
  >([])
  const [masteryBars, setMasteryBars] = useState<
    { topic: string; mastery: number }[]
  >([])
  const [weakTopics, setWeakTopics] = useState<
    { topic: string; rate: number }[]
  >([])
  const [indepTrend, setIndepTrend] = useState<
    { week: string; independent: number }[]
  >([])
  const [feed, setFeed] = useState<
    (Activity & {
      display_name: string
      problem_title: string
      firstIndep: boolean
      reactions: Record<ReactionKind, number>
    })[]
  >([])
  const [selfStreak, setSelfStreak] = useState<number | null>(null)
  const [weekLeader, setWeekLeader] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setError(null)
    try {
      const [
        paceRes,
        topicsRes,
        problemsRes,
        progressRes,
        memRes,
        activityRes,
        snapsRes,
        streakRes,
        weekSnapRes,
      ] = await Promise.all([
        supabase
          .from('group_pace_settings')
          .select('pace_marker_topic_id, pace_marker_note')
          .eq('group_id', focusedGroupId)
          .maybeSingle(),
        supabase
          .from('topics')
          .select('id, name, sort_order')
          .order('sort_order', { ascending: true }),
        supabase.from('problems').select('id, topic_id, title, global_order'),
        supabase
          .from('problem_progress')
          .select('user_id, problem_id, status'),
        supabase
          .from('group_memberships')
          .select('user_id, profiles!inner(display_name)')
          .eq('group_id', focusedGroupId)
          .is('left_at', null),
        supabase.rpc('group_recent_activity', {
          p_group_id: focusedGroupId,
          p_limit: 40,
        }),
        supabase
          .from('weekly_score_snapshots')
          .select('week_start, independent_solves')
          .eq('group_id', focusedGroupId)
          .order('week_start', { ascending: true }),
        supabase.rpc('current_streak', { p_group_id: focusedGroupId }),
        supabase
          .from('weekly_score_snapshots')
          .select('user_id, total, profiles!inner(display_name)')
          .eq('group_id', focusedGroupId)
          .eq('week_start', weekStartInTz(profile.timezone))
          .order('total', { ascending: false })
          .limit(1),
      ])

      if (paceRes.error) throw paceRes.error
      if (topicsRes.error) throw topicsRes.error
      if (problemsRes.error) throw problemsRes.error
      if (progressRes.error) throw progressRes.error
      if (memRes.error) throw memRes.error
      if (activityRes.error) throw activityRes.error
      if (snapsRes.error) throw snapsRes.error

      const topics = (topicsRes.data ?? []) as Topic[]
      const problems = problemsRes.data ?? []
      const progress = progressRes.data ?? []
      const memberIds = (memRes.data ?? []).map((m) => m.user_id as string)
      const nameByUser = new Map(
        (memRes.data ?? []).map((m) => {
          const p = m.profiles as unknown as { display_name: string }
          return [m.user_id as string, p.display_name]
        }),
      )

      let markerName: string | null = null
      if (paceRes.data?.pace_marker_topic_id) {
        markerName =
          topics.find((t) => t.id === paceRes.data!.pace_marker_topic_id)
            ?.name ?? null
      }
      setPaceMarker({
        topicName: markerName,
        note: (paceRes.data?.pace_marker_note as string | null) ?? null,
      })

      setSelfStreak(
        typeof streakRes.data === 'number' ? streakRes.data : null,
      )
      if (weekSnapRes.data?.[0]) {
        const p = weekSnapRes.data[0].profiles as unknown as {
          display_name: string
        }
        setWeekLeader(p.display_name)
      } else {
        setWeekLeader(null)
      }

      // Mastery & weak topics (group avg completion per topic)
      const problemsByTopic = new Map<string, string[]>()
      for (const p of problems) {
        const tid = p.topic_id as string
        const list = problemsByTopic.get(tid) ?? []
        list.push(p.id as string)
        problemsByTopic.set(tid, list)
      }
      const completed = new Set(
        progress
          .filter(
            (pr) =>
              pr.status === 'completed' &&
              memberIds.includes(pr.user_id as string),
          )
          .map((pr) => `${pr.user_id}:${pr.problem_id}`),
      )

      const mastery: { topic: string; mastery: number }[] = []
      const weak: { topic: string; rate: number }[] = []
      for (const t of topics) {
        const ids = problemsByTopic.get(t.id) ?? []
        if (ids.length === 0 || memberIds.length === 0) continue
        let done = 0
        const total = ids.length * memberIds.length
        for (const uid of memberIds) {
          for (const pid of ids) {
            if (completed.has(`${uid}:${pid}`)) done += 1
          }
        }
        const rate = Math.round((done / total) * 100)
        mastery.push({ topic: t.name, mastery: rate })
        weak.push({ topic: t.name, rate })
      }
      setMasteryBars(mastery)
      setWeakTopics(
        [...weak].sort((a, b) => a.rate - b.rate).slice(0, 6),
      )

      // Indep trend by week
      const byWeek = new Map<string, number>()
      for (const s of snapsRes.data ?? []) {
        const w = s.week_start as string
        byWeek.set(w, (byWeek.get(w) ?? 0) + (s.independent_solves as number))
      }
      setIndepTrend(
        [...byWeek.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-8)
          .map(([week, independent]) => ({
            week: week.slice(5),
            independent,
          })),
      )

      // Heatmap: last 7 local days × members from activity
      const activity = (activityRes.data ?? []) as Activity[]
      const today = localDateInTz(profile.timezone)
      const dayKeys: string[] = []
      for (let i = 6; i >= 0; i--) {
        const [y, m, d] = today.split('-').map(Number)
        const dt = new Date(Date.UTC(y, m - 1, d, 12))
        dt.setUTCDate(dt.getUTCDate() - i)
        dayKeys.push(dt.toISOString().slice(0, 10))
      }

      const heatRows = memberIds.map((uid) => {
        const cells = dayKeys.map((day) => {
          let n = 0
          for (const a of activity) {
            if (a.user_id !== uid) continue
            if (
              a.outcome !== 'solved_independently' &&
              a.outcome !== 'solved_with_hints'
            ) {
              continue
            }
            if (
              localDateInTz(profile.timezone, new Date(a.completed_at)) === day
            ) {
              n += 1
            }
          }
          return n
        })
        return {
          member: nameByUser.get(uid) ?? 'Member',
          cells,
        }
      })
      setHeatmap(heatRows)

      // Feed enrichment
      const problemTitle = new Map(
        problems.map((p) => [
          p.id as string,
          `#${p.global_order} ${p.title}`,
        ]),
      )
      const attemptIds = activity.map((a) => a.attempt_id)
      const reactionCounts = new Map<string, Record<ReactionKind, number>>()
      if (attemptIds.length > 0) {
        const { data: reactions } = await supabase
          .from('reactions')
          .select('target_id, kind')
          .eq('target_type', 'activity')
          .in('target_id', attemptIds)
        for (const r of reactions ?? []) {
          const tid = r.target_id as string
          const kind = r.kind as ReactionKind
          const cur = reactionCounts.get(tid) ?? {
            applause: 0,
            fire: 0,
            respect: 0,
            comeback: 0,
            challenge: 0,
          }
          cur[kind] = (cur[kind] ?? 0) + 1
          reactionCounts.set(tid, cur)
        }
      }

      // first indep: earliest indep attempt per user+problem in feed order
      const seenIndep = new Set<string>()
      const chronological = [...activity].sort(
        (a, b) =>
          new Date(a.completed_at).getTime() -
          new Date(b.completed_at).getTime(),
      )
      const firstIndepIds = new Set<string>()
      for (const a of chronological) {
        if (a.outcome !== 'solved_independently') continue
        const key = `${a.user_id}:${a.problem_id}`
        if (!seenIndep.has(key)) {
          seenIndep.add(key)
          firstIndepIds.add(a.attempt_id)
        }
      }

      setFeed(
        activity.map((a) => ({
          ...a,
          display_name: nameByUser.get(a.user_id) ?? 'Member',
          problem_title: problemTitle.get(a.problem_id) ?? a.problem_id.slice(0, 8),
          firstIndep: firstIndepIds.has(a.attempt_id),
          reactions: reactionCounts.get(a.attempt_id) ?? {
            applause: 0,
            fire: 0,
            respect: 0,
            comeback: 0,
            challenge: 0,
          },
        })),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [focusedGroupId, profile.timezone, userId])

  useEffect(() => {
    void load()
  }, [load])

  const dayLabels = useMemo(() => {
    const today = localDateInTz(profile.timezone)
    const labels: string[] = []
    for (let i = 6; i >= 0; i--) {
      const [y, m, d] = today.split('-').map(Number)
      const dt = new Date(Date.UTC(y, m - 1, d, 12))
      dt.setUTCDate(dt.getUTCDate() - i)
      labels.push(DOW[dt.getUTCDay()])
    }
    return labels
  }, [profile.timezone])

  async function react(attemptId: string, kind: ReactionKind) {
    if (!supabase) return
    setBusyId(attemptId + kind)
    setMessage(null)
    setError(null)
    try {
      const { error: rpcErr } = await supabase.rpc('add_reaction', {
        p_kind: kind,
        p_target_type: 'activity',
        p_target_id: attemptId,
      })
      if (rpcErr) throw rpcErr
      setMessage('Reaction added.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reaction failed')
    } finally {
      setBusyId(null)
    }
  }

  const maxHeat = Math.max(1, ...heatmap.flatMap((r) => r.cells))

  if (loading) return <p className="muted">Loading analytics…</p>

  return (
    <div className="stack">
      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message ok">{message}</p> : null}

      <section className="panel">
        <h2>Pace marker</h2>
        {paceMarker.topicName || paceMarker.note ? (
          <p className="muted" style={{ margin: 0 }}>
            {paceMarker.topicName ? (
              <strong style={{ color: 'var(--color-bright)' }}>
                {paceMarker.topicName}
              </strong>
            ) : null}
            {paceMarker.note ? ` — ${paceMarker.note}` : ''}
          </p>
        ) : (
          <p className="muted">
            No pace marker set. Owners can set one under Manage → Pace.
          </p>
        )}
        {weekLeader ? (
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            This week’s #1: {weekLeader}
          </p>
        ) : null}
        {selfStreak != null && selfStreak >= 7 ? (
          <p className="muted">
            Your streak milestone: {selfStreak} days
            {selfStreak >= 30 ? ' (30+)' : selfStreak >= 14 ? ' (14+)' : ' (7+)'}
          </p>
        ) : null}
      </section>

      <section className="panel">
        <h2>Consistency (last 7 days)</h2>
        <div className="heat-grid" style={{ overflowX: 'auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `7rem repeat(7, 2rem)`,
              gap: '0.25rem',
              alignItems: 'center',
              fontSize: '0.75rem',
            }}
          >
            <div />
            {dayLabels.map((d) => (
              <div
                key={d}
                style={{
                  textAlign: 'center',
                  color: 'var(--color-on-surface-variant)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {d[0]}
              </div>
            ))}
            {heatmap.map((row) => (
              <Fragment key={row.member}>
                <div
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'var(--color-on-surface)',
                  }}
                >
                  {row.member}
                </div>
                {row.cells.map((n, i) => (
                  <div
                    key={`${row.member}-${i}`}
                    title={`${n}`}
                    style={{
                      width: '2rem',
                      height: '2rem',
                      borderRadius: 4,
                      background:
                        n === 0
                          ? 'var(--color-surface-highest)'
                          : `rgba(125, 154, 136, ${0.25 + (n / maxHeat) * 0.75})`,
                    }}
                  />
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      </section>

      <div className="split-2">
        <section className="panel">
          <h2>Topic mastery (group %)</h2>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={masteryBars.slice(0, 10)}>
                <CartesianGrid stroke="var(--color-outline-variant)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="topic"
                  tick={{ fill: '#8a909a', fontSize: 10 }}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fill: '#8a909a', fontSize: 11 }} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    background: '#1c1f26',
                    border: '1px solid #3a3f48',
                  }}
                />
                <Bar dataKey="mastery" fill="#7d9a88" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel">
          <h2>Weak topics</h2>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={weakTopics} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid stroke="var(--color-outline-variant)" strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#8a909a', fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="topic"
                  width={90}
                  tick={{ fill: '#8a909a', fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    background: '#1c1f26',
                    border: '1px solid #3a3f48',
                  }}
                />
                <Bar dataKey="rate" fill="#a89478" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="panel">
        <h2>Independent solves (group weekly)</h2>
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer>
            <LineChart data={indepTrend}>
              <CartesianGrid stroke="var(--color-outline-variant)" strokeDasharray="3 3" />
              <XAxis dataKey="week" tick={{ fill: '#8a909a', fontSize: 11 }} />
              <YAxis tick={{ fill: '#8a909a', fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: '#1c1f26',
                  border: '1px solid #3a3f48',
                }}
              />
              <Line
                type="monotone"
                dataKey="independent"
                stroke="#93ad9e"
                strokeWidth={2}
                dot={{ r: 3, fill: '#7d9a88' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel">
        <h2>Recent milestones</h2>
        <p className="muted">
          React to group activity. Standings stay reaction-free.
        </p>
        <div className="row-list" style={{ marginTop: '0.75rem' }}>
          {feed.length === 0 ? (
            <p className="muted">No recent attributed attempts.</p>
          ) : (
            feed.map((item) => (
              <div key={item.attempt_id} className="row-link" style={{ cursor: 'default' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="title">
                    {item.display_name}
                    {item.firstIndep ? (
                      <span className="badge ok" style={{ marginLeft: '0.35rem' }}>
                        First indep
                      </span>
                    ) : null}
                  </div>
                  <div className="meta">
                    {item.problem_title} · {outcomeLabel(item.outcome)} ·{' '}
                    {formatShortDate(item.completed_at, profile.timezone)}
                  </div>
                  <div
                    className="outcome-chips"
                    style={{ marginTop: '0.5rem' }}
                  >
                    {REACTION_KINDS.map(({ kind, label }) => (
                      <button
                        key={kind}
                        type="button"
                        disabled={busyId === item.attempt_id + kind}
                        onClick={() => void react(item.attempt_id, kind)}
                        title={label}
                      >
                        {label}
                        {item.reactions[kind] > 0
                          ? ` ${item.reactions[kind]}`
                          : ''}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
