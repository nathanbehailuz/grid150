import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageSkeleton } from '../components/PageSkeleton'
import { StatusBanner } from '../components/StatusBanner'
import { supabase } from '../lib/supabase'
import {
  formatLongDate,
  formatShortDate,
  greetingForHour,
  isOverdue,
  isoWeekNumber,
  localDateInTz,
  monthGrid,
  outcomeLabel,
  parseYearMonth,
  priorWeekStart,
  weekStartInTz,
} from '../lib/dates'
import {
  aggregateAttemptsByDay,
  bestStreakDays,
  countSolvesOnLocalDay,
  dayState,
  successfulNewSolveDays,
  weekDailySplits,
} from '../lib/practice'
import { standingDelta } from '../lib/standings'
import type { Problem, Profile, ReviewTask, WeeklySnapshot } from '../lib/types'

type Props = {
  profile: Profile
  userId: string
  focusedGroupId: string | null
}

type ReviewRow = ReviewTask & {
  topicName?: string
  lastOutcome?: string | null
  lastAt?: string | null
}

type NewRow = Problem & { topicName?: string }

export function TodayPage({
  profile,
  userId,
  focusedGroupId,
}: Props) {
  const [nextProblem, setNextProblem] = useState<NewRow | null>(null)
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [blocked, setBlocked] = useState(false)
  const [dailyTarget, setDailyTarget] = useState(1)
  const [completedToday, setCompletedToday] = useState(0)
  const [reviewsDoneToday, setReviewsDoneToday] = useState(0)
  const [streak, setStreak] = useState<number | null>(null)
  const [bestStreak, setBestStreak] = useState(0)
  const [weekSnap, setWeekSnap] = useState<WeeklySnapshot | null>(null)
  const [prevSnap, setPrevSnap] = useState<WeeklySnapshot | null>(null)
  const [standing, setStanding] = useState({
    rank: null as number | null,
    of: 0,
    gapToFirst: null as number | null,
    movement: null as number | null,
  })
  const [activeDays, setActiveDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [dayCounts, setDayCounts] = useState<Record<string, number>>({})
  const [weekBars, setWeekBars] = useState<
    { date: string; label: string; independent: number; hint: number }[]
  >([])
  const [pacePerWeek, setPacePerWeek] = useState<number | null>(null)
  const [deadline, setDeadline] = useState<string | null>(null)
  const [calCursor, setCalCursor] = useState(() =>
    parseYearMonth(localDateInTz(profile.timezone)),
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const todayLocal = localDateInTz(profile.timezone)
  const weekNum = isoWeekNumber(profile.timezone)

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data: nextId, error: nextErr } = await supabase.rpc(
        'next_unlocked_problem',
      )
      if (nextErr) throw nextErr

      let problem: NewRow | null = null
      if (nextId) {
        const { data, error: pErr } = await supabase
          .from('problems')
          .select(
            'id, title, slug, difficulty, global_order, topic_id, neetcode_url, topics!inner(name)',
          )
          .eq('id', nextId)
          .maybeSingle()
        if (pErr) throw pErr
        if (data) {
          const topics = data.topics as unknown as { name: string }
          problem = {
            id: data.id as string,
            title: data.title as string,
            slug: data.slug as string,
            difficulty: data.difficulty as Problem['difficulty'],
            global_order: data.global_order as number,
            topic_id: data.topic_id as string,
            neetcode_url: data.neetcode_url as string | null,
            topicName: topics.name,
          }
        }
      }
      setNextProblem(problem)

      const { data: reviewRows, error: rErr } = await supabase
        .from('review_tasks')
        .select(
          'id, problem_id, due_at, status, problems!inner(id, title, slug, global_order, difficulty, topic_id, topics!inner(name))',
        )
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('due_at', { ascending: true })
      if (rErr) throw rErr

      const mappedBase: ReviewRow[] = (reviewRows ?? []).map((row) => {
        const problems = row.problems as unknown as ReviewTask['problems'] & {
          topic_id: string
          topics: { name: string }
        }
        return {
          id: row.id as string,
          problem_id: row.problem_id as string,
          due_at: row.due_at as string,
          status: row.status as ReviewTask['status'],
          problems,
          topicName: problems.topics?.name,
        }
      })

      const problemIds = mappedBase.map((r) => r.problem_id)
      const lastByProblem = new Map<string, { outcome: string; at: string }>()
      if (problemIds.length > 0) {
        const { data: recent } = await supabase
          .from('attempts')
          .select('problem_id, outcome, completed_at')
          .eq('user_id', userId)
          .in('problem_id', problemIds)
          .is('invalidated_at', null)
          .order('completed_at', { ascending: false })
        for (const a of recent ?? []) {
          const pid = a.problem_id as string
          if (!lastByProblem.has(pid)) {
            lastByProblem.set(pid, {
              outcome: a.outcome as string,
              at: a.completed_at as string,
            })
          }
        }
      }

      const mapped = mappedBase.map((r) => {
        const last = lastByProblem.get(r.problem_id)
        return {
          ...r,
          lastOutcome: last?.outcome ?? null,
          lastAt: last?.at ?? null,
        }
      })
      setReviews(mapped)
      setBlocked(mapped.some((r) => isOverdue(r.due_at)))

      const { data: attempts } = await supabase
        .from('attempts')
        .select('completed_at, outcome, attempt_type')
        .eq('user_id', userId)
        .is('invalidated_at', null)

      const attemptRows = attempts ?? []
      setDayCounts(aggregateAttemptsByDay(attemptRows, profile.timezone))
      setWeekBars(weekDailySplits(attemptRows, profile.timezone))
      setCompletedToday(
        countSolvesOnLocalDay(attemptRows, profile.timezone, todayLocal),
      )
      setReviewsDoneToday(
        countSolvesOnLocalDay(
          attemptRows,
          profile.timezone,
          todayLocal,
          'scheduled_review',
        ),
      )

      let active = [1, 2, 3, 4, 5]
      if (focusedGroupId) {
        const weekStart = weekStartInTz(profile.timezone)
        const prevStart = priorWeekStart(weekStart)
        const [targetRes, streakRes, snapRes, prevRes, paceRes] =
          await Promise.all([
            supabase
              .from('member_targets')
              .select('daily_new_target')
              .eq('user_id', userId)
              .eq('group_id', focusedGroupId)
              .maybeSingle(),
            supabase.rpc('current_streak', { p_group_id: focusedGroupId }),
            supabase
              .from('weekly_score_snapshots')
              .select(
                'user_id, group_id, week_start, progress, consistency, improvement, total, independent_solves, hint_assisted_solves',
              )
              .eq('group_id', focusedGroupId)
              .eq('week_start', weekStart)
              .order('total', { ascending: false }),
            supabase
              .from('weekly_score_snapshots')
              .select(
                'user_id, group_id, week_start, progress, consistency, improvement, total, independent_solves, hint_assisted_solves',
              )
              .eq('group_id', focusedGroupId)
              .eq('week_start', prevStart)
              .order('total', { ascending: false }),
            supabase
              .from('group_pace_settings')
              .select('problems_per_week, deadline, active_days')
              .eq('group_id', focusedGroupId)
              .maybeSingle(),
          ])

        if (targetRes.error) throw targetRes.error
        if (streakRes.error) throw streakRes.error
        if (snapRes.error) throw snapRes.error
        if (prevRes.error) throw prevRes.error

        setDailyTarget(targetRes.data?.daily_new_target ?? 1)
        setStreak(typeof streakRes.data === 'number' ? streakRes.data : 0)

        const thisWeek = (snapRes.data ?? []) as WeeklySnapshot[]
        const lastWeek = (prevRes.data ?? []) as WeeklySnapshot[]
        setWeekSnap(thisWeek.find((s) => s.user_id === userId) ?? null)
        setPrevSnap(lastWeek.find((s) => s.user_id === userId) ?? null)
        const info = standingDelta(thisWeek, lastWeek, userId)
        setStanding({
          rank: info.rank,
          of: info.of,
          gapToFirst: info.gapToFirst,
          movement: info.movement,
        })

        if (paceRes.data) {
          active = (paceRes.data.active_days as number[]) ?? active
          setPacePerWeek(paceRes.data.problems_per_week as number | null)
          setDeadline(paceRes.data.deadline as string | null)
        }
      }
      setActiveDays(active)
      setBestStreak(
        bestStreakDays(
          successfulNewSolveDays(attemptRows, profile.timezone),
          active,
          profile.timezone,
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Today')
    } finally {
      setLoading(false)
    }
  }, [userId, focusedGroupId, profile.timezone, todayLocal])

  useEffect(() => {
    void load()
  }, [load])

  const actionable = reviews.filter(
    (r) => new Date(r.due_at).getTime() <= Date.now() + 24 * 60 * 60 * 1000,
  )

  const grid = useMemo(
    () => monthGrid(calCursor.year, calCursor.month),
    [calCursor],
  )

  const monthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(calCursor.year, calCursor.month, 1)))

  const weekDelta =
    weekSnap && prevSnap
      ? Number(weekSnap.total) - Number(prevSnap.total)
      : null

  const weeklyTarget =
    pacePerWeek ?? dailyTarget * activeDays.length

  const maxBar = Math.max(
    1,
    ...weekBars.map((d) => d.independent + d.hint),
  )

  const newRemaining = Math.max(0, dailyTarget - completedToday)
  const beyondTarget = Math.max(0, completedToday - dailyTarget)
  const targetMet = completedToday >= dailyTarget && dailyTarget > 0

  let weekOfLabel = `Week ${weekNum}`
  if (deadline) {
    const start = weekStartInTz(profile.timezone)
    const [y, m, d] = deadline.split('-').map(Number)
    const end = new Date(Date.UTC(y, m - 1, d, 12))
    const [sy, sm, sd] = start.split('-').map(Number)
    const weeksLeft = Math.max(
      1,
      Math.ceil(
        (end.getTime() - Date.UTC(sy, sm - 1, sd)) / (7 * 86400000),
      ),
    )
    weekOfLabel = `Week ${weekNum} · ${weeksLeft} weeks to deadline`
  }

  return (
    <div className="stack page-enter">
      <header className="page-head">
        <p className="muted" style={{ marginBottom: '0.35rem' }}>
          {formatLongDate(profile.timezone)} · {weekOfLabel}
        </p>
        <h1>
          {greetingForHour(profile.timezone)},{' '}
          {profile.display_name.split(' ')[0]}.
        </h1>
      </header>

      {error ? (
        <StatusBanner tone="error" message={error} onRetry={() => void load()} />
      ) : null}
      {loading && !nextProblem && reviews.length === 0 ? (
        <PageSkeleton rows={5} label="Loading today" />
      ) : null}

      {blocked ? (
        <p className="message error" role="status">
          Overdue reviews block new problems. Clear the review queue before
          logging the next unlock.
        </p>
      ) : null}

      <section className="panel">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.75rem',
          }}
        >
          <h2 style={{ margin: 0 }}>Questions today</h2>
          <Link to="/log" className="muted">
            Open log
          </Link>
        </div>
        <div className="row-list">
          {nextProblem ? (
            <Link
              className="row-link"
              to={
                blocked
                  ? '/log#review'
                  : `/log?problem=${nextProblem.id}&type=new_problem#new`
              }
            >
              <div>
                <div className="title">{nextProblem.title}</div>
                <div className="meta">
                  New · {nextProblem.difficulty}
                  {nextProblem.topicName ? ` · ${nextProblem.topicName}` : ''}
                  {blocked ? ' · locked until review is logged' : ''}
                  {!blocked && newRemaining === 0
                    ? ' · beyond daily target'
                    : ''}
                </div>
              </div>
              <span className={`badge${blocked ? ' overdue' : ' ok'}`}>
                {blocked ? 'Blocked' : 'New'}
              </span>
            </Link>
          ) : null}

          {actionable.map((r) => {
            const overdue = isOverdue(r.due_at)
            const last =
              r.lastOutcome && r.lastAt
                ? `${outcomeLabel(r.lastOutcome)} ${formatShortDate(r.lastAt, profile.timezone)}`
                : null
            return (
              <Link
                key={r.id}
                className="row-link"
                to={`/log?problem=${r.problem_id}&type=scheduled_review#review`}
              >
                <div>
                  <div className="title">{r.problems.title}</div>
                  <div className="meta">
                    {overdue
                      ? 'Overdue'
                      : `Due ${formatShortDate(r.due_at, profile.timezone)}`}
                    {r.topicName ? ` · ${r.topicName}` : ''}
                    {last ? ` · ${last}` : ''}
                  </div>
                </div>
                <span className={`badge${overdue ? ' overdue' : ' due'}`}>
                  Review
                </span>
              </Link>
            )
          })}

          {!nextProblem && actionable.length === 0 ? (
            <p className="muted">Nothing queued for today.</p>
          ) : null}
        </div>
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          {reviewsDoneToday} review complete ·{' '}
          {beyondTarget > 0
            ? `${beyondTarget} beyond plan`
            : `${newRemaining} new remaining`}
          {reviews.length > actionable.length ? (
            <>
              {' · '}
              <Link to="/reviews">Full queue ({reviews.length})</Link>
            </>
          ) : null}
        </p>
      </section>

      <div className="split-2">
        <section className="panel summary-block">
          <div>
            <span className="muted" style={{ fontSize: '0.6875rem' }}>
              TODAY
            </span>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.75rem',
                color: 'var(--color-bright)',
              }}
            >
              {completedToday}/{dailyTarget}
            </div>
            <p className="muted" style={{ margin: '0.25rem 0 0' }}>
              {beyondTarget > 0
                ? `new problems · +${beyondTarget} beyond plan`
                : targetMet
                  ? 'new problems · target met'
                  : 'new problems'}
            </p>
            <div className="shell-progress-bar" style={{ marginTop: '0.5rem' }}>
              <div
                className="indep"
                style={{
                  width: `${Math.min(100, (completedToday / Math.max(1, dailyTarget)) * 100)}%`,
                }}
              />
            </div>
          </div>
          <div className="divider" />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
            <div>
              <span className="muted" style={{ fontSize: '0.6875rem' }}>
                STREAK
              </span>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1.5rem',
                  color: 'var(--color-bright)',
                }}
              >
                {streak ?? '—'}
                <span className="muted" style={{ fontSize: '0.75rem' }}>
                  {' '}
                  days
                </span>
              </div>
              <p className="muted" style={{ margin: 0 }}>
                Best {bestStreak}
              </p>
            </div>
            <div>
              <span className="muted" style={{ fontSize: '0.6875rem' }}>
                WEEK
              </span>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1.5rem',
                  color: 'var(--color-bright)',
                }}
              >
                {weekSnap ? Number(weekSnap.total).toFixed(0) : '—'}
                <span className="muted" style={{ fontSize: '0.75rem' }}>
                  {' '}
                  / 100
                </span>
              </div>
              <p className="muted" style={{ margin: 0 }}>
                {weekDelta != null
                  ? `${weekDelta >= 0 ? '+' : ''}${weekDelta.toFixed(0)} vs last week`
                  : 'First week'}
                {weekSnap
                  ? ` · ${weekSnap.independent_solves} indep · ${weekSnap.hint_assisted_solves} hints`
                  : ''}
              </p>
            </div>
          </div>
          <div className="divider" />
          <div>
            <span className="muted" style={{ fontSize: '0.6875rem' }}>
              RANK
            </span>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.5rem',
                color: 'var(--color-bright)',
              }}
            >
              {standing.rank != null ? `#${standing.rank}` : '—'}
              {standing.of > 0 ? (
                <span className="muted" style={{ fontSize: '0.75rem' }}>
                  {' '}
                  of {standing.of}
                </span>
              ) : null}
            </div>
            <p className="muted" style={{ margin: 0 }}>
              {standing.movement != null && standing.movement !== 0
                ? standing.movement > 0
                  ? `up ${standing.movement}`
                  : `down ${Math.abs(standing.movement)}`
                : 'no change'}
              {standing.gapToFirst != null && standing.rank !== 1
                ? ` · ${standing.gapToFirst.toFixed(1)} pts behind first`
                : standing.rank === 1
                  ? ' · leading'
                  : ''}
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="cal-nav">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() =>
                setCalCursor((c) => {
                  const m = c.month - 1
                  return m < 0
                    ? { year: c.year - 1, month: 11 }
                    : { year: c.year, month: m }
                })
              }
            >
              ‹
            </button>
            <strong style={{ color: 'var(--color-bright)' }}>{monthLabel}</strong>
            <button
              type="button"
              aria-label="Next month"
              onClick={() =>
                setCalCursor((c) => {
                  const m = c.month + 1
                  return m > 11
                    ? { year: c.year + 1, month: 0 }
                    : { year: c.year, month: m }
                })
              }
            >
              ›
            </button>
          </div>
          <div className="cal-grid">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="cal-dow">
                {d}
              </div>
            ))}
            {grid.map((cell, i) => {
              const state = dayState(
                cell.date,
                todayLocal,
                dayCounts,
                activeDays,
              )
              const count = cell.date ? dayCounts[cell.date] ?? 0 : 0
              return (
                <div key={i} className={`cal-cell ${state}`}>
                  {cell.day ?? ''}
                  {count > 0 ? <span className="count">{count}</span> : null}
                </div>
              )
            })}
          </div>
          <div className="cal-legend">
            <span>Practiced</span>
            <span>Missed</span>
            <span>Rest</span>
            <span>Today</span>
          </div>
        </section>
      </div>

      <section className="panel">
        <h2>This week</h2>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '1.75rem',
            color: 'var(--color-bright)',
          }}
        >
          {weekSnap ? Number(weekSnap.total).toFixed(1) : '0'}
          <span className="muted" style={{ fontSize: '0.875rem' }}>
            {' '}
            / 100
          </span>
        </div>
        <div className="score-lines">
          <div className="score-line">
            <span>Progress</span>
            <div className="track">
              <div
                className="fill"
                style={{
                  width: `${Math.min(100, ((weekSnap ? Number(weekSnap.progress) : 0) / 50) * 100)}%`,
                }}
              />
            </div>
            <span>{weekSnap ? Number(weekSnap.progress).toFixed(0) : 0}/50</span>
          </div>
          <div className="score-line">
            <span>Consistency</span>
            <div className="track">
              <div
                className="fill consistency"
                style={{
                  width: `${Math.min(100, ((weekSnap ? Number(weekSnap.consistency) : 0) / 25) * 100)}%`,
                }}
              />
            </div>
            <span>
              {weekSnap ? Number(weekSnap.consistency).toFixed(0) : 0}/25
            </span>
          </div>
          <div className="score-line">
            <span>Improvement</span>
            <div className="track">
              <div
                className="fill improvement"
                style={{
                  width: `${Math.min(100, ((weekSnap ? Number(weekSnap.improvement) : 0) / 25) * 100)}%`,
                }}
              />
            </div>
            <span>
              {weekSnap ? Number(weekSnap.improvement).toFixed(0) : 0}/25
            </span>
          </div>
        </div>
        <p className="muted">Weekly target: {weeklyTarget} problems</p>
        <div className="week-bars" aria-label="Daily independent vs hint solves">
          {weekBars.map((d) => {
            const total = d.independent + d.hint
            const h = (total / maxBar) * 100
            const indepH =
              total > 0 ? (d.independent / total) * h : 0
            const hintH = total > 0 ? (d.hint / total) * h : 0
            return (
              <div key={d.date} className="week-bar">
                <div className="stack" style={{ height: '5rem' }}>
                  <div
                    className="seg indep"
                    style={{ height: `${indepH}%` }}
                    title={`${d.independent} independent`}
                  />
                  <div
                    className="seg hint"
                    style={{ height: `${hintH}%` }}
                    title={`${d.hint} hint`}
                  />
                </div>
                <span className="lbl">{d.label}</span>
              </div>
            )
          })}
        </div>
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          <Link to="/leaderboard">View full leaderboard standings</Link>
        </p>
      </section>
    </div>
  )
}
