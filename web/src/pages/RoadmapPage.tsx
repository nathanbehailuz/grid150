import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { isOverdue } from '../lib/dates'
import type { Problem, ProblemProgress, Topic } from '../lib/types'

type Props = {
  userId: string
}

type TopicBundle = Topic & {
  problems: (Problem & { status: ProblemProgress['status'] })[]
  mastery: number
  state: 'complete' | 'current' | 'active' | 'locked'
  dueCount: number
  overdueCount: number
  indep: number
  hint: number
}

export function RoadmapPage({ userId }: Props) {
  const [topics, setTopics] = useState<TopicBundle[]>([])
  const [filter, setFilter] = useState<
    'all' | 'due' | 'available' | 'completed'
  >('all')
  const [query, setQuery] = useState('')
  const [currentTopicId, setCurrentTopicId] = useState<string | null>(null)
  const [indepTotal, setIndepTotal] = useState(0)
  const [hintTotal, setHintTotal] = useState(0)
  const [reviewPassRate, setReviewPassRate] = useState<number | null>(null)
  const [pace, setPace] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setError(null)
    try {
      const [
        topicsRes,
        problemsRes,
        progressRes,
        reviewsRes,
        attemptsRes,
        nextRes,
        completedReviews,
      ] = await Promise.all([
        supabase
          .from('topics')
          .select('id, slug, name, sort_order')
          .order('sort_order', { ascending: true }),
        supabase
          .from('problems')
          .select(
            'id, title, slug, difficulty, global_order, topic_id, neetcode_url',
          )
          .order('global_order', { ascending: true }),
        supabase
          .from('problem_progress')
          .select('problem_id, status')
          .eq('user_id', userId),
        supabase
          .from('review_tasks')
          .select('problem_id, due_at, status')
          .eq('user_id', userId)
          .eq('status', 'pending'),
        supabase
          .from('attempts')
          .select('problem_id, outcome, attempt_type, completed_at')
          .eq('user_id', userId)
          .is('invalidated_at', null)
          .eq('attempt_type', 'new_problem')
          .in('outcome', ['solved_independently', 'solved_with_hints']),
        supabase.rpc('next_unlocked_problem'),
        supabase
          .from('review_tasks')
          .select('id, status')
          .eq('user_id', userId)
          .in('status', ['pending', 'completed']),
      ])

      if (topicsRes.error) throw topicsRes.error
      if (problemsRes.error) throw problemsRes.error
      if (progressRes.error) throw progressRes.error
      if (reviewsRes.error) throw reviewsRes.error
      if (attemptsRes.error) throw attemptsRes.error

      const progressMap = new Map(
        (progressRes.data ?? []).map((p) => [
          p.problem_id as string,
          p.status as ProblemProgress['status'],
        ]),
      )

      const dueByProblem = new Map<string, { due_at: string }>()
      for (const r of reviewsRes.data ?? []) {
        dueByProblem.set(r.problem_id as string, {
          due_at: r.due_at as string,
        })
      }

      const indepByProblem = new Set<string>()
      const hintByProblem = new Set<string>()
      for (const a of attemptsRes.data ?? []) {
        if (a.outcome === 'solved_independently')
          indepByProblem.add(a.problem_id as string)
        if (a.outcome === 'solved_with_hints')
          hintByProblem.add(a.problem_id as string)
      }
      setIndepTotal(indepByProblem.size)
      setHintTotal(hintByProblem.size)

      const allReviews = completedReviews.data ?? []
      const done = allReviews.filter((r) => r.status === 'completed').length
      const totalR = allReviews.length
      setReviewPassRate(totalR > 0 ? Math.round((done / totalR) * 100) : null)

      const recent = (attemptsRes.data ?? [])
        .map((a) => new Date(a.completed_at as string).getTime())
        .filter((t) => t > Date.now() - 14 * 86400000)
      setPace(
        recent.length > 0
          ? Math.round((recent.length / 14) * 10) / 10
          : null,
      )

      const nextId = nextRes.data as string | null
      const nextProblem = (problemsRes.data as Problem[]).find(
        (p) => p.id === nextId,
      )
      const currentTid = nextProblem?.topic_id ?? null
      setCurrentTopicId(currentTid)

      const bundles: TopicBundle[] = (topicsRes.data as Topic[]).map((t) => {
        const problems = (problemsRes.data as Problem[])
          .filter((p) => p.topic_id === t.id)
          .map((p) => ({
            ...p,
            status: progressMap.get(p.id) ?? 'locked',
          }))
        const doneN = problems.filter((p) => p.status === 'completed').length
        const mastery =
          problems.length > 0
            ? Math.round((doneN / problems.length) * 100)
            : 0
        let dueCount = 0
        let overdueCount = 0
        for (const p of problems) {
          const due = dueByProblem.get(p.id)
          if (due) {
            dueCount += 1
            if (isOverdue(due.due_at)) overdueCount += 1
          }
        }
        const hasAvailable = problems.some((p) => p.status === 'available')
        const allLocked = problems.every((p) => p.status === 'locked')
        let state: TopicBundle['state'] = 'active'
        if (doneN === problems.length && problems.length > 0) state = 'complete'
        else if (t.id === currentTid) state = 'current'
        else if (allLocked) state = 'locked'
        else if (hasAvailable || doneN > 0) state = 'active'

        return {
          ...t,
          problems,
          mastery,
          state,
          dueCount,
          overdueCount,
          indep: problems.filter((p) => indepByProblem.has(p.id)).length,
          hint: problems.filter((p) => hintByProblem.has(p.id)).length,
        }
      })
      setTopics(bundles)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load roadmap')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const completed = useMemo(
    () =>
      topics.reduce(
        (n, t) => n + t.problems.filter((p) => p.status === 'completed').length,
        0,
      ),
    [topics],
  )

  const dueTopicCount = topics.filter((t) => t.dueCount > 0).length
  const availableCount = topics.filter(
    (t) =>
      t.state === 'current' ||
      t.state === 'active' ||
      t.problems.some((p) => p.status === 'available'),
  ).length

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return topics
      .map((t) => ({
        ...t,
        problems: t.problems.filter((p) => {
          if (filter === 'due') {
            return (
              t.dueCount > 0 &&
              // show problems that have due OR all in topic when filtering topics
              true
            )
          }
          if (filter === 'available' && p.status !== 'available') return false
          if (filter === 'completed' && p.status !== 'completed') return false
          if (!q) return true
          return (
            p.title.toLowerCase().includes(q) ||
            String(p.global_order).includes(q)
          )
        }),
      }))
      .filter((t) => {
        if (filter === 'due') return t.dueCount > 0
        if (filter === 'available')
          return (
            t.state === 'current' ||
            t.state === 'active' ||
            t.problems.some((p) => p.status === 'available')
          )
        if (filter === 'completed') return t.state === 'complete'
        if (q) return t.problems.length > 0 || t.name.toLowerCase().includes(q)
        return true
      })
  }, [topics, filter, query])

  const current =
    topics.find((t) => t.id === currentTopicId) ??
    topics.find((t) => t.state === 'current') ??
    null

  const pct = Math.round((completed / 150) * 1000) / 10
  const unsolved = 150 - completed

  const dueProblem = current?.problems.find((p) => {
    return p.status === 'completed' && current.dueCount > 0
  })
  const availableProblem = current?.problems.find(
    (p) => p.status === 'available',
  )

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Roadmap</h1>
        <p>
          {completed} / 150 completed ({pct}%). New problems unlock in sequence.
        </p>
      </header>

      {error ? <p className="message error">{error}</p> : null}
      {loading ? <p className="muted">Loading…</p> : null}

      <div className="overview-strip">
        <div className="stat">
          <dt>Independent</dt>
          <dd>{indepTotal}</dd>
        </div>
        <div className="stat">
          <dt>With hints</dt>
          <dd>{hintTotal}</dd>
        </div>
        <div className="stat">
          <dt>Unsolved</dt>
          <dd>{unsolved}</dd>
        </div>
        <div className="stat">
          <dt>Review pass</dt>
          <dd>{reviewPassRate != null ? `${reviewPassRate}%` : '—'}</dd>
        </div>
        <div className="stat">
          <dt>Pace</dt>
          <dd>{pace != null ? `${pace}/day` : '—'}</dd>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search problems"
          style={{
            flex: '1 1 12rem',
            padding: '0.5rem 0.65rem',
            border: '1px solid var(--color-outline-variant)',
            background: 'var(--color-surface-container)',
            color: 'var(--color-bright)',
            font: 'inherit',
            borderRadius: 'var(--radius)',
          }}
        />
        <div className="segmented">
          {(
            [
              ['all', 'All'],
              ['due', `Due (${dueTopicCount})`],
              ['available', `In progress (${availableCount})`],
              ['completed', 'Completed'],
            ] as const
          ).map(([f, label]) => (
            <button
              key={f}
              type="button"
              className={filter === f ? 'active' : undefined}
              onClick={() => setFilter(f)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="roadmap-layout">
        <div className="stack">
          {visible.map((t) => (
            <section key={t.id} className="topic-block">
              <div className="topic-head">
                <div>
                  <h3>{t.name}</h3>
                  <div className="topic-meta" style={{ marginTop: '0.35rem' }}>
                    <span className="badge">{t.state}</span>
                    <span className="badge ok">{t.mastery}% mastery</span>
                    {t.overdueCount > 0 ? (
                      <span className="badge overdue">Review expired</span>
                    ) : t.dueCount > 0 ? (
                      <span className="badge due">Review due</span>
                    ) : null}
                  </div>
                </div>
                <span className="badge">
                  {t.problems.filter((p) => p.status === 'completed').length}/
                  {t.problems.length}
                </span>
              </div>
              {(filter === 'due'
                ? t.problems.filter((p) => p.status === 'completed')
                : t.problems
              ).map((p) => (
                <div
                  key={p.id}
                  className={`problem-row${p.status === 'locked' ? ' locked' : ''}`}
                >
                  <div>
                    <span className="meta" style={{ marginRight: '0.5rem' }}>
                      #{p.global_order}
                    </span>
                    {p.title} <span className="badge">{p.status}</span>
                  </div>
                  {p.status === 'available' ? (
                    <Link to={`/log?problem=${p.id}&type=new_problem#new`}>
                      Log
                    </Link>
                  ) : p.status === 'completed' ? (
                    <Link
                      to={`/log?problem=${p.id}&type=scheduled_review#review`}
                    >
                      Review
                    </Link>
                  ) : (
                    <span className="muted">Locked</span>
                  )}
                </div>
              ))}
            </section>
          ))}
        </div>

        {current ? (
          <aside className="panel" style={{ position: 'sticky', top: '4rem' }}>
            <span className="muted" style={{ fontSize: '0.6875rem' }}>
              CURRENT TOPIC
            </span>
            <h2 style={{ margin: '0.35rem 0' }}>{current.name}</h2>
            <p className="muted">
              {current.problems.filter((p) => p.status === 'completed').length}{' '}
              / {current.problems.length} complete · {current.mastery}% mastery
            </p>
            <dl className="stats-grid" style={{ marginTop: '0.75rem' }}>
              <div className="stat">
                <dt>Indep</dt>
                <dd>{current.indep}</dd>
              </div>
              <div className="stat">
                <dt>Hints</dt>
                <dd>{current.hint}</dd>
              </div>
              <div className="stat">
                <dt>Due</dt>
                <dd>{current.dueCount}</dd>
              </div>
            </dl>
            {availableProblem ? (
              <Link
                className="btn-primary"
                style={{ marginTop: '0.75rem', display: 'inline-flex' }}
                to={`/log?problem=${availableProblem.id}&type=new_problem#new`}
              >
                Log {availableProblem.title}
              </Link>
            ) : current.dueCount > 0 ? (
              <Link
                className="btn-primary"
                style={{ marginTop: '0.75rem', display: 'inline-flex' }}
                to={
                  dueProblem
                    ? `/log?problem=${dueProblem.id}&type=scheduled_review#review`
                    : '/reviews'
                }
              >
                Clear reviews
              </Link>
            ) : (
              <Link
                className="btn-primary"
                style={{ marginTop: '0.75rem', display: 'inline-flex' }}
                to="/log"
              >
                Open log
              </Link>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  )
}
